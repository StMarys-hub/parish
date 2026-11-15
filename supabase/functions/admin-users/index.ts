// Supabase Edge Function: admin-users
// Secure RBAC User & Role Management (Super Admin / Vicar vs. Trustee)
// Uses SUPABASE_SERVICE_ROLE_KEY strictly server-side, verified against caller JWT + admin_users.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, x-supabase-client-platform, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AdminRole = "super_admin" | "vicar" | "trustee" | "secretary";

interface AdminUsersRequest {
  action: "list" | "invite" | "update_role" | "delete_user" | "log_password_reset";
  email?: string;
  fullName?: string;
  role?: AdminRole;
  designation?: string;
  redirectTo?: string;
  targetUserId?: string;
  targetEmail?: string;
  isActive?: boolean;
}

const VALID_ROLES = new Set<AdminRole>(["super_admin", "vicar", "trustee", "secretary"]);

function isSuperAdminRole(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "vicar";
}

function sanitizeRedirect(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonError("Missing Authorization header", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Verify caller identity via user-scoped JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: callerAuth },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !callerAuth) {
      return jsonError("Invalid or expired session", 401);
    }

    // 2. Verify active admin membership
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: caller, error: callerErr } = await adminClient
      .from("admin_users")
      .select("user_id, email, full_name, role, is_active")
      .eq("user_id", callerAuth.id)
      .eq("is_active", true)
      .maybeSingle();

    if (callerErr || !caller) {
      return jsonError("Forbidden: not an active parish admin", 403);
    }

    const body = (await req.json()) as AdminUsersRequest;

    // =========================================================================
    // ACTION: LIST ROSTER
    // =========================================================================
    if (body.action === "list") {
      const { data: rows, error: listErr } = await adminClient
        .from("admin_users")
        .select("user_id, email, full_name, role, designation, invite_status, is_active, last_active_at, created_at")
        .order("created_at", { ascending: true });

      if (listErr) {
        return jsonError(listErr.message, 500);
      }

      const authStatusMap = new Map<string, { lastSignInAt: string | null; emailConfirmedAt: string | null }>();
      try {
        const { data: authList } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
        for (const u of authList?.users ?? []) {
          authStatusMap.set(u.id, {
            lastSignInAt: u.last_sign_in_at ?? null,
            emailConfirmedAt: u.email_confirmed_at ?? null,
          });
        }
      } catch (e) {
        console.warn("Unable to inspect auth user statuses:", e);
      }

      const users = (rows ?? []).map((row) => {
        const authMeta = authStatusMap.get(row.user_id);
        const derivedStatus =
          authMeta?.lastSignInAt || row.last_active_at || row.invite_status === "active"
            ? "active"
            : "pending_invite";

        return {
          ...row,
          invite_status: derivedStatus,
          last_active_at: row.last_active_at ?? authMeta?.lastSignInAt ?? null,
        };
      });

      return jsonOk({ users });
    }

    // =========================================================================
    // ACTION: LOG PASSWORD RESET (Allowed for self or any target by Super Admin)
    // =========================================================================
    if (body.action === "log_password_reset") {
      const targetId = body.targetUserId ?? "";
      const isSelf = targetId === caller.user_id;
      if (!isSelf && !isSuperAdminRole(caller.role)) {
        return jsonError("Forbidden: only Super Admin / Vicar can trigger resets for other admins", 403);
      }

      const targetEmail = (body.targetEmail ?? "").trim().toLowerCase();
      if (!targetEmail) {
        return jsonError("Target email is required", 400);
      }

      await adminClient.from("audit_logs").insert({
        actor_user_id: caller.user_id,
        actor_email: caller.email,
        actor_role: caller.role,
        action: "PASSWORD_RESET",
        table_name: "admin_users",
        record_id: targetId || targetEmail,
        change_summary: `Dispatched password reset link to ${targetEmail}`,
        new_data: { target_user_id: targetId, target_email: targetEmail },
      });

      return jsonOk({ ok: true });
    }

    // All remaining mutations require Super Admin / Vicar
    if (!isSuperAdminRole(caller.role)) {
      return jsonError("Forbidden: Super Admin / Vicar privileges required", 403);
    }

    // =========================================================================
    // ACTION: INVITE / CREATE ADMIN USER
    // =========================================================================
    if (body.action === "invite") {
      const email = (body.email ?? "").trim().toLowerCase();
      const fullName = (body.fullName ?? "").trim();
      const role = body.role;
      const designation = (body.designation ?? "").trim() || null;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonError("Valid email address is required", 400);
      }
      if (!fullName || fullName.length < 2) {
        return jsonError("Full name is required", 400);
      }
      if (!role || !VALID_ROLES.has(role)) {
        return jsonError("Invalid role specified", 400);
      }

      // Check existing admin_users row first
      const { data: existingAdmin } = await adminClient
        .from("admin_users")
        .select("user_id, is_active")
        .eq("email", email)
        .maybeSingle();

      if (existingAdmin?.is_active) {
        return jsonError(`An active admin user (${email}) already exists`, 400);
      }

      const redirectTo = sanitizeRedirect(body.redirectTo);
      let targetUserId: string | null = existingAdmin?.user_id ?? null;
      let inviteStatus: "active" | "pending_invite" = "pending_invite";

      if (!targetUserId) {
        const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName, designation },
          redirectTo,
        });

        if (inviteErr) {
          // If email already exists in Auth but wasn't in admin_users, link cleanly
          const msg = inviteErr.message.toLowerCase();
          if (msg.includes("already") || msg.includes("registered") || inviteErr.status === 422) {
            const { data: listData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
            const found = listData?.users?.find((u) => u.email?.toLowerCase() === email);
            if (!found) {
              return jsonError(inviteErr.message, 400);
            }
            targetUserId = found.id;
            inviteStatus = found.last_sign_in_at ? "active" : "pending_invite";
          } else {
            return jsonError(inviteErr.message, 400);
          }
        } else if (invited?.user) {
          targetUserId = invited.user.id;
          inviteStatus = "pending_invite";
        }
      }

      if (!targetUserId) {
        return jsonError("Failed to provision user account", 500);
      }

      const { data: savedRow, error: upsertErr } = await adminClient
        .from("admin_users")
        .upsert(
          {
            user_id: targetUserId,
            email,
            full_name: fullName,
            role,
            designation,
            invite_status: inviteStatus,
            is_active: true,
            invited_by: caller.user_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select("user_id, email, full_name, role, designation, invite_status, is_active, last_active_at, created_at")
        .single();

      if (upsertErr) {
        return jsonError(upsertErr.message, 400);
      }

      await adminClient.from("audit_logs").insert({
        actor_user_id: caller.user_id,
        actor_email: caller.email,
        actor_role: caller.role,
        action: "USER_INVITE",
        table_name: "admin_users",
        record_id: targetUserId,
        change_summary: `Added/invited ${fullName} (${email}) as ${role}`,
        new_data: savedRow,
      });

      return jsonOk({ user: savedRow });
    }

    // =========================================================================
    // ACTION: UPDATE ROLE / DESIGNATION / ACTIVE STATE
    // =========================================================================
    if (body.action === "update_role") {
      const targetUserId = body.targetUserId ?? "";
      if (!targetUserId) {
        return jsonError("targetUserId is required", 400);
      }

      const { data: target, error: targetErr } = await adminClient
        .from("admin_users")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (targetErr || !target) {
        return jsonError("Admin user not found", 404);
      }

      const nextRole = body.role ?? target.role;
      if (!VALID_ROLES.has(nextRole)) {
        return jsonError("Invalid role", 400);
      }

      const nextActive = typeof body.isActive === "boolean" ? body.isActive : target.is_active;
      const nextDesignation =
        body.designation !== undefined ? (body.designation.trim() || null) : target.designation;

      // Safety guard: block self-deactivation or self-demotion from Super Admin
      if (targetUserId === caller.user_id) {
        if (!nextActive) {
          return jsonError("You cannot deactivate your own currently active account", 400);
        }
        if (!isSuperAdminRole(nextRole)) {
          return jsonError("You cannot demote your own Super Admin / Vicar role", 400);
        }
      }

      // Safety guard: prevent demoting/deactivating last remaining Super Admin / Vicar
      if (target.is_active && isSuperAdminRole(target.role) && (!nextActive || !isSuperAdminRole(nextRole))) {
        const { count } = await adminClient
          .from("admin_users")
          .select("user_id", { count: "exact", head: true })
          .eq("is_active", true)
          .in("role", ["super_admin", "vicar"])
          .neq("user_id", targetUserId);

        if ((count ?? 0) < 1) {
          return jsonError("Cannot demote or deactivate the last remaining Super Admin / Vicar", 400);
        }
      }

      const { data: updated, error: updErr } = await adminClient
        .from("admin_users")
        .update({
          role: nextRole,
          designation: nextDesignation,
          is_active: nextActive,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", targetUserId)
        .select("user_id, email, full_name, role, designation, invite_status, is_active, last_active_at, created_at")
        .single();

      if (updErr) {
        return jsonError(updErr.message, 400);
      }

      const actionType = nextActive !== target.is_active ? "USER_DEACTIVATE" : "ROLE_CHANGE";
      const summary =
        nextActive !== target.is_active
          ? `${nextActive ? "Reactivated" : "Deactivated"} ${target.full_name} (${target.email})`
          : `Updated ${target.full_name} (${target.email}) role from ${target.role} to ${nextRole}`;

      await adminClient.from("audit_logs").insert({
        actor_user_id: caller.user_id,
        actor_email: caller.email,
        actor_role: caller.role,
        action: actionType,
        table_name: "admin_users",
        record_id: targetUserId,
        change_summary: summary,
        old_data: target,
        new_data: updated,
      });

      return jsonOk({ user: updated });
    }

    // =========================================================================
    // ACTION: DELETE ADMIN USER
    // =========================================================================
    if (body.action === "delete_user") {
      const targetUserId = body.targetUserId ?? "";
      if (!targetUserId) {
        return jsonError("targetUserId is required", 400);
      }

      if (targetUserId === caller.user_id) {
        return jsonError("Safety rule: You cannot delete your own currently active account", 400);
      }

      const { data: target, error: targetErr } = await adminClient
        .from("admin_users")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (targetErr || !target) {
        return jsonError("Admin user not found", 404);
      }

      if (target.is_active && isSuperAdminRole(target.role)) {
        const { count } = await adminClient
          .from("admin_users")
          .select("user_id", { count: "exact", head: true })
          .eq("is_active", true)
          .in("role", ["super_admin", "vicar"])
          .neq("user_id", targetUserId);

        if ((count ?? 0) < 1) {
          return jsonError("Safety rule: Cannot delete the last remaining Super Admin / Vicar", 400);
        }
      }

      // Remove admin access immediately
      const { error: delRowErr } = await adminClient
        .from("admin_users")
        .delete()
        .eq("user_id", targetUserId);

      if (delRowErr) {
        return jsonError(delRowErr.message, 400);
      }

      // Clean up Auth account (migration 002 changed updated_by/invited_by FKs to ON DELETE SET NULL)
      const { error: delAuthErr } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (delAuthErr) {
        console.warn("Auth delete warning (admin row already removed):", delAuthErr.message);
      }

      await adminClient.from("audit_logs").insert({
        actor_user_id: caller.user_id,
        actor_email: caller.email,
        actor_role: caller.role,
        action: "USER_DELETE",
        table_name: "admin_users",
        record_id: targetUserId,
        change_summary: `Removed admin user ${target.full_name} (${target.email}, role: ${target.role})`,
        old_data: target,
      });

      return jsonOk({ deletedUserId: targetUserId });
    }

    return jsonError("Unsupported action", 400);
  } catch (err) {
    console.error("admin-users Edge Function error:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return jsonError(message, 500);
  }
});

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
