// Supabase Edge Function: reimbursements
// Enforces Authenticated Device Login + Admin-Configurable Anti-Spam Gate:
// 1. Parishioners MUST sign in with Supabase Auth (no anonymous uploads).
// 2. Anti-spam gates: Parish Access PIN + Device Login | Approved Emails Only | Rate-Limited Login.
// 3. Server-side magic-byte file verification + per-user 24h rate limiting + honeypot check.
// 4. Verified Trustee / Super Admin (Vicar) queue, receipt signing, and access control management.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, x-supabase-client-platform, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_PAYOUT_METHODS = new Set([
  "Check",
  "Zelle",
  "Direct Reimbursement",
]);
const ALLOWED_GATE_MODES = new Set([
  "pin_and_login",
  "allowlist_only",
  "login_with_rate_limit",
]);
const SIGNED_URL_TTL_SECONDS = 300; // 5-minute short-lived URL

function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(input: unknown, maxLen = 500): string {
  return String(input ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLen);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashParishPin(pin: string): Promise<string> {
  return sha256Hex(`parish-reimb-pin-v1:${pin.trim().toUpperCase()}`);
}

function generateRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateReferenceCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (let i = 0; i < bytes.length; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `CLM-${suffix}`;
}

function getFileExtension(mimeType: string, originalName: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "application/pdf") return "pdf";
  const match = originalName.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : "bin";
}

function verifyMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.length < 12) return false;
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  if (mimeType === "application/pdf") {
    const limit = Math.min(bytes.length - 4, 1024);
    for (let i = 0; i <= limit; i++) {
      if (
        bytes[i] === 0x25 &&
        bytes[i + 1] === 0x50 &&
        bytes[i + 2] === 0x44 &&
        bytes[i + 3] === 0x46
      ) {
        return true;
      }
    }
    return false;
  }
  return false;
}

function isTrusteeOrVicar(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "vicar" || role === "trustee";
}

async function sanitizeClaimRow(
  adminClient: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
  includeContact: boolean
) {
  let receiptSignedUrl: string | null = null;
  const receiptPath = typeof row.receipt_path === "string" ? row.receipt_path : null;
  if (receiptPath) {
    const { data: signed } = await adminClient.storage
      .from("receipts")
      .createSignedUrl(receiptPath, SIGNED_URL_TTL_SECONDS);
    receiptSignedUrl = signed?.signedUrl ?? null;
  }

  return {
    id: row.id,
    reference_code: row.reference_code,
    full_name: row.full_name,
    ...(includeContact ? { contact_info: row.contact_info, submitter_email: row.submitter_email } : {}),
    ministry: row.ministry,
    expense_date: row.expense_date,
    amount_cents: row.amount_cents,
    description: row.description,
    payout_method: row.payout_method,
    ...(includeContact && receiptPath ? { receipt_path: receiptPath } : {}),
    receipt_mime_type: row.receipt_mime_type,
    receipt_file_name: row.receipt_file_name,
    receipt_signed_url: receiptSignedUrl,
    status: row.status,
    trustee_notes: row.trustee_notes,
    reviewed_by_name: row.reviewed_by_name,
    reviewed_at: row.reviewed_at,
    paid_at: row.paid_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function verifySignedInCaller(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
  adminClient: ReturnType<typeof createClient>
) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: jsonError("Device login required to submit or track receipts.", 401), user: null, admin: null };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user || !authData.user.email) {
    return {
      error: jsonError("Device login session expired or invalid. Please sign in again.", 401),
      user: null,
      admin: null,
    };
  }

  const { data: adminRow } = await adminClient
    .from("admin_users")
    .select("user_id, email, full_name, role, is_active")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  return { error: null, user: authData.user, admin: adminRow ?? null };
}

async function getSubmitterEligibility(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  userEmail: string,
  isAdmin: boolean
) {
  const normalizedEmail = userEmail.trim().toLowerCase();

  const [{ data: secRow }, { data: subRow }] = await Promise.all([
    adminClient.from("reimbursement_security_config").select("*").eq("id", 1).maybeSingle(),
    adminClient
      .from("reimbursement_submitters")
      .select("*")
      .eq("email", normalizedEmail)
      .maybeSingle(),
  ]);

  const gateMode = (secRow?.gate_mode as string) || "pin_and_login";
  const hasPinConfigured = Boolean(secRow?.pin_hash);
  const maxPer24h = Number(secRow?.max_submissions_per_24h ?? 3);

  const isBlocked = Boolean(subRow?.is_blocked) && !isAdmin;
  const isApproved = isAdmin || Boolean(subRow?.is_approved);

  // PIN verification stays valid until Trustees rotate/update the PIN
  const pinVerifiedAt = subRow?.pin_verified_at ? Date.parse(String(subRow.pin_verified_at)) : 0;
  const configUpdatedAt = secRow?.updated_at ? Date.parse(String(secRow.updated_at)) : 0;
  const pinVerified =
    hasPinConfigured && Boolean(subRow?.pin_verified_at) && pinVerifiedAt >= configUpdatedAt;

  let canSubmit = false;
  if (!isBlocked) {
    if (isApproved) {
      canSubmit = true;
    } else if (gateMode === "login_with_rate_limit") {
      canSubmit = true;
    } else if (gateMode === "pin_and_login") {
      canSubmit = pinVerified;
    } else if (gateMode === "allowlist_only") {
      canSubmit = false;
    }
  }

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await adminClient
    .from("reimbursements")
    .select("id", { count: "exact", head: true })
    .eq("submitter_user_id", userId)
    .gte("created_at", sinceIso);

  const remainingToday = Math.max(0, maxPer24h - (recentCount ?? 0));

  return {
    gateMode,
    hasPinConfigured,
    pinHash: (secRow?.pin_hash as string | null) ?? null,
    maxPer24h,
    recentCount: recentCount ?? 0,
    remainingToday,
    isBlocked,
    isApproved,
    pinVerified,
    canSubmit,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Every reimbursement operation requires authenticated Device Login (no anonymous calls)
    const { error: callerErr, user, admin } = await verifySignedInCaller(
      req,
      supabaseUrl,
      supabaseAnonKey,
      adminClient
    );
    if (callerErr || !user || !user.email) return callerErr!;

    const contentType = req.headers.get("content-type") ?? "";

    // ----------------------------------------------------------------------
    // ACTION: SUBMIT (multipart/form-data with private receipt upload)
    // ----------------------------------------------------------------------
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const action = cleanText(form.get("action") ?? "submit", 30);
      if (action !== "submit") {
        return jsonError("Unsupported multipart action", 400);
      }

      // Honeypot check against automated bots
      const honeypot = cleanText(form.get("companyWebsite"), 120);
      if (honeypot) {
        return jsonError("Submission rejected by anti-spam filter.", 400);
      }

      const eligibility = await getSubmitterEligibility(
        adminClient,
        user.id,
        user.email,
        Boolean(admin)
      );

      if (eligibility.isBlocked) {
        return jsonError("This account is blocked from submitting reimbursements. Contact a Parish Trustee.", 403);
      }

      // Verify gate rules before accepting file bytes
      if (!eligibility.canSubmit) {
        if (eligibility.gateMode === "allowlist_only") {
          return jsonError(
            "Only Trustee-approved ministry leads & parishioners can upload receipts. Ask a Trustee to approve your email.",
            403
          );
        }
        if (eligibility.gateMode === "pin_and_login") {
          const submittedPin = cleanText(form.get("parishPin"), 64);
          if (!eligibility.hasPinConfigured) {
            return jsonError(
              "A Parish Submission PIN has not been set by Trustees yet. Ask a Trustee to set one or approve your email.",
              403
            );
          }
          if (!submittedPin) {
            return jsonError("Enter the Parish Submission PIN to unlock receipt uploads.", 403);
          }
          const candidatePinHash = await hashParishPin(submittedPin);
          if (candidatePinHash !== eligibility.pinHash) {
            return jsonError("Incorrect Parish Submission PIN.", 403);
          }
          // Cache PIN verification for this user until Trustees rotate the PIN
          await adminClient.from("reimbursement_submitters").upsert({
            email: user.email.trim().toLowerCase(),
            user_id: user.id,
            full_name: cleanText(form.get("fullName"), 120) || null,
            pin_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      if (eligibility.remainingToday <= 0) {
        return jsonError(
          `Daily limit reached (${eligibility.maxPer24h} submissions per 24 hours) to prevent spam. Try again tomorrow.`,
          429
        );
      }

      const fullName = cleanText(form.get("fullName"), 120);
      const contactInfo = cleanText(form.get("contactInfo"), 160) || user.email;
      const ministry = cleanText(form.get("ministry"), 100);
      const expenseDate = cleanText(form.get("expenseDate"), 20);
      const amountCents = Number(form.get("amountCents"));
      const description = cleanText(form.get("description"), 1000);
      const payoutMethod = cleanText(form.get("payoutMethod"), 40);
      const receipt = form.get("receipt");

      if (!fullName || !contactInfo || !ministry || !description) {
        return jsonError("Full Name, Contact Info, Ministry, and Description are required", 400);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
        return jsonError("Valid Expense Date (YYYY-MM-DD) is required", 400);
      }
      if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) {
        return jsonError("Valid Expense Amount ($) greater than $0.00 is required", 400);
      }
      if (!ALLOWED_PAYOUT_METHODS.has(payoutMethod)) {
        return jsonError("Invalid payout method", 400);
      }
      if (!(receipt instanceof File) || receipt.size === 0) {
        return jsonError("Receipt image (JPG/PNG/WEBP) or PDF attachment is required", 400);
      }
      if (receipt.size > MAX_RECEIPT_BYTES) {
        return jsonError("Receipt exceeds maximum 5 MB size limit", 400);
      }
      if (!ALLOWED_MIME_TYPES.has(receipt.type)) {
        return jsonError("Unsupported receipt file type. Use JPG, PNG, WEBP, or PDF.", 400);
      }

      const fileBytes = new Uint8Array(await receipt.arrayBuffer());
      if (!verifyMagicBytes(fileBytes, receipt.type)) {
        return jsonError(
          "Uploaded file signature does not match an authentic JPG, PNG, WEBP, or PDF receipt.",
          400
        );
      }

      const referenceCode = generateReferenceCode();
      const claimSecret = generateRandomHex(24);
      const claimSecretHash = await sha256Hex(claimSecret);
      const ext = getFileExtension(receipt.type, receipt.name);
      const objectPath = `${expenseDate.slice(0, 7)}/${referenceCode}-${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await adminClient.storage
        .from("receipts")
        .upload(objectPath, fileBytes, {
          contentType: receipt.type,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadErr) {
        return jsonError(`Receipt upload failed: ${uploadErr.message}`, 500);
      }

      const { data: inserted, error: insertErr } = await adminClient
        .from("reimbursements")
        .insert({
          reference_code: referenceCode,
          claim_secret_hash: claimSecretHash,
          submitter_user_id: user.id,
          submitter_email: user.email.trim().toLowerCase(),
          full_name: fullName,
          contact_info: contactInfo,
          ministry,
          expense_date: expenseDate,
          amount_cents: amountCents,
          description,
          payout_method: payoutMethod,
          receipt_path: objectPath,
          receipt_mime_type: receipt.type,
          receipt_file_name: cleanText(receipt.name, 140) || `receipt.${ext}`,
          status: "pending_review",
        })
        .select("*")
        .single();

      if (insertErr || !inserted) {
        await adminClient.storage.from("receipts").remove([objectPath]);
        return jsonError(insertErr?.message ?? "Failed to save reimbursement request", 500);
      }

      const safeClaim = await sanitizeClaimRow(adminClient, inserted, true);
      return jsonOk({ claim: safeClaim }, 201);
    }

    // ----------------------------------------------------------------------
    // JSON ACTIONS
    // ----------------------------------------------------------------------
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "my_access_status") {
      const eligibility = await getSubmitterEligibility(
        adminClient,
        user.id,
        user.email,
        Boolean(admin)
      );
      return jsonOk({
        email: user.email,
        isAdmin: Boolean(admin),
        gateMode: eligibility.gateMode,
        hasPinConfigured: eligibility.hasPinConfigured,
        canSubmit: eligibility.canSubmit,
        isBlocked: eligibility.isBlocked,
        isApproved: eligibility.isApproved,
        pinVerified: eligibility.pinVerified,
        maxPer24h: eligibility.maxPer24h,
        remainingToday: eligibility.remainingToday,
      });
    }

    if (action === "verify_pin") {
      const submittedPin = cleanText(body.parishPin, 64);
      const eligibility = await getSubmitterEligibility(
        adminClient,
        user.id,
        user.email,
        Boolean(admin)
      );
      if (eligibility.isBlocked) {
        return jsonError("This account is blocked from submitting reimbursements.", 403);
      }
      if (!eligibility.hasPinConfigured) {
        return jsonError("Trustees have not configured a Parish Submission PIN yet.", 400);
      }
      const candidateHash = await hashParishPin(submittedPin);
      if (candidateHash !== eligibility.pinHash) {
        return jsonError("Incorrect Parish Submission PIN.", 403);
      }
      await adminClient.from("reimbursement_submitters").upsert({
        email: user.email.trim().toLowerCase(),
        user_id: user.id,
        pin_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return jsonOk({ verified: true });
    }

    if (action === "track") {
      const { data: rows, error: trackErr } = await adminClient
        .from("reimbursements")
        .select("*")
        .eq("submitter_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (trackErr) {
        return jsonError(trackErr.message, 500);
      }
      const claims = await Promise.all(
        (rows ?? []).map((row) => sanitizeClaimRow(adminClient, row, true))
      );
      return jsonOk({ claims });
    }

    // Trustee / Super Admin verification required for management & queue actions
    if (!admin || !isTrusteeOrVicar(admin.role)) {
      return jsonError(
        "Forbidden: Only verified Trustees and Super Admin (Vicar) can manage reimbursements",
        403
      );
    }

    if (action === "admin_list") {
      const statusFilter = cleanText(body.status ?? "all", 30);
      let query = adminClient
        .from("reimbursements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (["pending_review", "approved", "paid", "declined"].includes(statusFilter)) {
        query = query.eq("status", statusFilter);
      }

      const { data: rows, error: listErr } = await query;
      if (listErr) {
        return jsonError(listErr.message, 500);
      }

      const claims = await Promise.all(
        (rows ?? []).map((row) => sanitizeClaimRow(adminClient, row, true))
      );
      return jsonOk({ claims });
    }

    if (action === "admin_receipt_url") {
      const id = cleanText(body.id, 64);
      if (!id) return jsonError("Valid reimbursement id required", 400);
      const { data: claimRow, error: claimErr } = await adminClient
        .from("reimbursements")
        .select("id, receipt_path")
        .eq("id", id)
        .maybeSingle();
      if (claimErr || !claimRow || typeof claimRow.receipt_path !== "string") {
        return jsonError("Receipt attachment not found", 404);
      }
      const { data: signed, error: signErr } = await adminClient.storage
        .from("receipts")
        .createSignedUrl(claimRow.receipt_path, 60);
      if (signErr || !signed?.signedUrl) {
        return jsonError(signErr?.message ?? "Failed to sign receipt URL", 500);
      }
      return jsonOk({ signedUrl: signed.signedUrl });
    }

    if (action === "admin_review") {
      const id = cleanText(body.id, 64);
      const nextStatus = cleanText(body.status, 30);
      const trusteeNotes = cleanText(body.trusteeNotes, 800);

      if (!id || !["approved", "paid", "declined"].includes(nextStatus)) {
        return jsonError("Valid reimbursement id and status (approved, paid, declined) required", 400);
      }
      if (nextStatus === "declined" && trusteeNotes.length < 3) {
        return jsonError("A reason note is required when declining a reimbursement request", 400);
      }

      const { data: existing, error: fetchErr } = await adminClient
        .from("reimbursements")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr || !existing) {
        return jsonError("Reimbursement request not found", 404);
      }

      const nowIso = new Date().toISOString();
      const updatePatch: Record<string, unknown> = {
        status: nextStatus,
        trustee_notes: trusteeNotes || existing.trustee_notes || null,
        reviewed_by: admin.user_id,
        reviewed_by_name: admin.full_name,
        reviewed_at: nowIso,
        updated_at: nowIso,
      };
      if (nextStatus === "paid") {
        updatePatch.paid_at = nowIso;
      }

      const { data: updated, error: updateErr } = await adminClient
        .from("reimbursements")
        .update(updatePatch)
        .eq("id", id)
        .select("*")
        .single();

      if (updateErr || !updated) {
        return jsonError(updateErr?.message ?? "Failed to update reimbursement", 500);
      }

      const auditAction =
        nextStatus === "approved"
          ? "REIMBURSEMENT_APPROVED"
          : nextStatus === "paid"
            ? "REIMBURSEMENT_PAID"
            : "REIMBURSEMENT_DECLINED";

      const dollars = (Number(updated.amount_cents) / 100).toFixed(2);
      await adminClient.from("audit_logs").insert({
        actor_user_id: admin.user_id,
        actor_email: admin.email,
        actor_role: admin.role,
        action: auditAction,
        table_name: "reimbursements",
        record_id: updated.reference_code,
        change_summary: `${auditAction} ${updated.reference_code} ($${dollars} - ${updated.full_name})${
          trusteeNotes ? ` • Note: ${trusteeNotes}` : ""
        }`,
      });

      const safeClaim = await sanitizeClaimRow(adminClient, updated, true);
      return jsonOk({ claim: safeClaim });
    }

    if (action === "admin_get_security") {
      const [{ data: cfg }, { data: submitters }] = await Promise.all([
        adminClient.from("reimbursement_security_config").select("*").eq("id", 1).maybeSingle(),
        adminClient
          .from("reimbursement_submitters")
          .select("email, full_name, ministry, is_approved, is_blocked, pin_verified_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(100),
      ]);

      return jsonOk({
        config: {
          gateMode: cfg?.gate_mode ?? "pin_and_login",
          hasPinConfigured: Boolean(cfg?.pin_hash),
          maxSubmissionsPer24h: Number(cfg?.max_submissions_per_24h ?? 3),
          updatedAt: cfg?.updated_at ?? null,
        },
        submitters: submitters ?? [],
      });
    }

    if (action === "admin_update_security") {
      const gateMode = cleanText(body.gateMode, 40);
      const maxPer24h = Number(body.maxSubmissionsPer24h ?? 3);
      const newPin = cleanText(body.newPin, 64);

      if (!ALLOWED_GATE_MODES.has(gateMode)) {
        return jsonError("Invalid gateMode", 400);
      }
      if (!Number.isInteger(maxPer24h) || maxPer24h < 1 || maxPer24h > 25) {
        return jsonError("Daily limit must be between 1 and 25 submissions.", 400);
      }

      const patch: Record<string, unknown> = {
        id: 1,
        gate_mode: gateMode,
        max_submissions_per_24h: maxPer24h,
        updated_by: admin.user_id,
        updated_at: new Date().toISOString(),
      };
      if (newPin.length > 0) {
        if (newPin.length < 4) {
          return jsonError("Parish Submission PIN must be at least 4 characters.", 400);
        }
        patch.pin_hash = await hashParishPin(newPin);
      }

      const { error: cfgErr } = await adminClient
        .from("reimbursement_security_config")
        .upsert(patch);
      if (cfgErr) return jsonError(cfgErr.message, 500);

      await adminClient.from("audit_logs").insert({
        actor_user_id: admin.user_id,
        actor_email: admin.email,
        actor_role: admin.role,
        action: "UPDATE",
        table_name: "reimbursement_security_config",
        record_id: "1",
        change_summary: `Updated reimbursement anti-spam gate: mode=${gateMode}, maxPer24h=${maxPer24h}${
          newPin ? " (rotated Parish PIN)" : ""
        }`,
      });

      return jsonOk({ ok: true });
    }

    if (action === "admin_upsert_submitter") {
      const email = cleanText(body.email, 160).toLowerCase();
      const fullName = cleanText(body.fullName, 120) || null;
      const ministry = cleanText(body.ministry, 100) || null;
      const isApproved = Boolean(body.isApproved);
      const isBlocked = Boolean(body.isBlocked);

      if (!email || !email.includes("@")) {
        return jsonError("Valid email address is required", 400);
      }

      const { data: upserted, error: subErr } = await adminClient
        .from("reimbursement_submitters")
        .upsert({
          email,
          full_name: fullName,
          ministry,
          is_approved: isApproved,
          is_blocked: isBlocked,
          approved_by: admin.user_id,
          updated_at: new Date().toISOString(),
        })
        .select("email, full_name, ministry, is_approved, is_blocked, pin_verified_at, updated_at")
        .single();

      if (subErr || !upserted) {
        return jsonError(subErr?.message ?? "Failed to update submitter access", 500);
      }

      await adminClient.from("audit_logs").insert({
        actor_user_id: admin.user_id,
        actor_email: admin.email,
        actor_role: admin.role,
        action: "UPDATE",
        table_name: "reimbursement_submitters",
        record_id: email,
        change_summary: `Updated submitter ${email}: approved=${isApproved}, blocked=${isBlocked}`,
      });

      return jsonOk({ submitter: upserted });
    }

    if (action === "admin_delete_submitter") {
      const email = cleanText(body.email, 160).toLowerCase();
      if (!email) return jsonError("Email required", 400);

      const { error: delErr } = await adminClient
        .from("reimbursement_submitters")
        .delete()
        .eq("email", email);
      if (delErr) return jsonError(delErr.message, 500);

      return jsonOk({ ok: true });
    }

    return jsonError(`Unsupported action: ${action}`, 400);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Internal server error", 500);
  }
});
