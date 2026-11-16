// Supabase Edge Function: reimbursements
// Handles:
// 1. Parishioner bill/receipt submission (`multipart/form-data`) into private `receipts` bucket
// 2. Privacy-safe claim tracking via SHA-256 claimSecret OR (referenceCode + contactInfo) + 5-min signed receipt URLs
// 3. Verified Trustee / Super Admin (Vicar) queue listing & approval/paid/decline workflow + audit logs

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

function normalizeContact(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : trimmed;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
    ...(includeContact ? { contact_info: row.contact_info } : {}),
    ministry: row.ministry,
    expense_date: row.expense_date,
    amount_cents: row.amount_cents,
    description: row.description,
    payout_method: row.payout_method,
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

async function verifyTrusteeAdmin(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
  adminClient: ReturnType<typeof createClient>
) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: jsonError("Missing Authorization header", 401), admin: null };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) {
    return { error: jsonError("Invalid or expired session", 401), admin: null };
  }

  const { data: adminRow } = await adminClient
    .from("admin_users")
    .select("user_id, email, full_name, role, is_active")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!adminRow || !isTrusteeOrVicar(adminRow.role)) {
    return {
      error: jsonError("Forbidden: Only verified Trustees and Super Admin (Vicar) can manage reimbursements", 403),
      admin: null,
    };
  }

  return { error: null, admin: adminRow };
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

      const fullName = cleanText(form.get("fullName"), 120);
      const contactInfo = cleanText(form.get("contactInfo"), 160);
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

      let receiptPath: string | null = null;
      let receiptMimeType: string | null = null;
      let receiptFileName: string | null = null;

      if (!(receipt instanceof File) || receipt.size === 0) {
        return jsonError("Receipt image (JPG/PNG/WEBP) or PDF attachment is required", 400);
      }
      if (receipt.size > MAX_RECEIPT_BYTES) {
        return jsonError("Receipt exceeds maximum 5 MB size limit", 400);
      }
      if (!ALLOWED_MIME_TYPES.has(receipt.type)) {
        return jsonError("Unsupported receipt file type. Use JPG, PNG, WEBP, or PDF.", 400);
      }

      const referenceCode = generateReferenceCode();
      const claimSecret = generateRandomHex(24);
      const claimSecretHash = await sha256Hex(claimSecret);

      const ext = getFileExtension(receipt.type, receipt.name);
      const objectPath = `${expenseDate.slice(0, 7)}/${referenceCode}-${crypto.randomUUID()}.${ext}`;
      const fileBytes = new Uint8Array(await receipt.arrayBuffer());

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

      receiptPath = objectPath;
      receiptMimeType = receipt.type;
      receiptFileName = cleanText(receipt.name, 140) || `receipt.${ext}`;

      const { data: inserted, error: insertErr } = await adminClient
        .from("reimbursements")
        .insert({
          reference_code: referenceCode,
          claim_secret_hash: claimSecretHash,
          full_name: fullName,
          contact_info: contactInfo,
          ministry,
          expense_date: expenseDate,
          amount_cents: amountCents,
          description,
          payout_method: payoutMethod,
          receipt_path: receiptPath,
          receipt_mime_type: receiptMimeType,
          receipt_file_name: receiptFileName,
          status: "pending_review",
        })
        .select("*")
        .single();

      if (insertErr || !inserted) {
        await adminClient.storage.from("receipts").remove([receiptPath]);
        return jsonError(insertErr?.message ?? "Failed to save reimbursement request", 500);
      }

      const safeClaim = await sanitizeClaimRow(adminClient, inserted, true);
      return jsonOk({ claim: safeClaim, claimSecret }, 201);
    }

    // ----------------------------------------------------------------------
    // JSON ACTIONS: track | admin_list | admin_review
    // ----------------------------------------------------------------------
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "track") {
      const results: Array<Record<string, unknown>> = [];
      const seenCodes = new Set<string>();

      // 1. Device-saved claims with secret token verification
      const savedClaims = Array.isArray(body.claims) ? body.claims.slice(0, 20) : [];
      if (savedClaims.length > 0) {
        const codes = savedClaims
          .map((c) => cleanText((c as Record<string, unknown>).referenceCode, 30).toUpperCase())
          .filter(Boolean);

        if (codes.length > 0) {
          const { data: rows } = await adminClient
            .from("reimbursements")
            .select("*")
            .in("reference_code", codes)
            .order("created_at", { ascending: false });

          for (const item of savedClaims) {
            const ref = cleanText((item as Record<string, unknown>).referenceCode, 30).toUpperCase();
            const secret = cleanText((item as Record<string, unknown>).claimSecret, 128);
            if (!ref || !secret || seenCodes.has(ref)) continue;

            const row = (rows ?? []).find((r) => r.reference_code === ref);
            if (!row) continue;

            const candidateHash = await sha256Hex(secret);
            if (candidateHash === row.claim_secret_hash) {
              seenCodes.add(ref);
              results.push(await sanitizeClaimRow(adminClient, row, false));
            }
          }
        }
      }

      // 2. Manual cross-device lookup via (Reference Code + Contact Phone/Email)
      const lookup = body.lookup as { referenceCode?: string; contactInfo?: string } | undefined;
      if (lookup?.referenceCode && lookup?.contactInfo) {
        const ref = cleanText(lookup.referenceCode, 30).toUpperCase();
        const contactNorm = normalizeContact(cleanText(lookup.contactInfo, 160));
        if (ref && contactNorm.length >= 5 && !seenCodes.has(ref)) {
          const { data: row } = await adminClient
            .from("reimbursements")
            .select("*")
            .eq("reference_code", ref)
            .maybeSingle();

          if (!row) {
            return jsonError("No matching reimbursement found for that reference code and contact.", 404);
          }

          if (normalizeContact(String(row.contact_info ?? "")) !== contactNorm) {
            return jsonError("Reference code and contact phone/email did not match.", 403);
          }

          seenCodes.add(ref);
          results.push(await sanitizeClaimRow(adminClient, row, false));
        }
      }

      return jsonOk({ claims: results });
    }

    // Trustee / Super Admin verification required for remaining actions
    const { error: authResp, admin } = await verifyTrusteeAdmin(
      req,
      supabaseUrl,
      supabaseAnonKey,
      adminClient
    );
    if (authResp || !admin) return authResp!;

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

    return jsonError(`Unsupported action: ${action}`, 400);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Internal server error", 500);
  }
});
