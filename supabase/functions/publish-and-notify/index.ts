// Supabase Edge Function: publish-and-notify
// Runtime: Deno (Supabase Edge Functions Free Tier)
// Uses pure Web Crypto W3C Web Push (VAPID) via jsr:@negrel/webpush — $0/month, no credit card.

import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, x-supabase-client-platform, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NotifyRequest {
  bulletinId?: string;
  sendPush: boolean;
  pushTitle?: string;
  pushBody?: string;
  pushUrl?: string;
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
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonError("Invalid or expired session", 401);
    }

    // 2. Verify active admin membership using service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: adminRecord, error: adminErr } = await adminClient
      .from("admin_users")
      .select("user_id, email, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (adminErr || !adminRecord) {
      return jsonError("Forbidden: not an active parish admin", 403);
    }

    const body = (await req.json()) as NotifyRequest;

    // 3. Publish bulletin if bulletinId is supplied
    let targetWeekStart: string | null = null;
    if (body.bulletinId) {
      const { data: updated, error: pubErr } = await userClient
        .from("weekly_bulletins")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.bulletinId)
        .select("id, title, week_start")
        .single();

      if (pubErr || !updated) {
        return jsonError(pubErr?.message ?? "Failed to publish bulletin", 400);
      }
      targetWeekStart = updated.week_start;
    }

    if (!body.sendPush) {
      return jsonOk({ published: true, sent: 0, deactivated: 0 });
    }

    // 4. Configure VAPID Application Server Keys from Supabase Secrets
    const rawVapidKeysJson = Deno.env.get("VAPID_KEYS_JSON")?.trim();
    const rawSubject = (Deno.env.get("VAPID_SUBJECT") ?? "mailto:vicar@stmarysyroclt.org").trim();
    const vapidSubject = rawSubject.startsWith("mailto:") || rawSubject.startsWith("https://")
      ? rawSubject
      : `mailto:${rawSubject}`;

    if (!rawVapidKeysJson) {
      return jsonError("VAPID_KEYS_JSON secret is not configured on Supabase", 500);
    }

    let exportedKeys: webpush.ExportedVapidKeys;
    try {
      exportedKeys = parseVapidKeysJson(rawVapidKeysJson);
    } catch (parseErr) {
      const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("Invalid VAPID_KEYS_JSON format:", detail);
      return jsonError(`VAPID_KEYS_JSON is not valid JSON: ${detail}`, 500);
    }

    if (!exportedKeys || typeof exportedKeys !== "object" || !exportedKeys.publicKey || !exportedKeys.privateKey) {
      console.error("VAPID_KEYS_JSON missing publicKey or privateKey fields");
      return jsonError("VAPID_KEYS_JSON must contain publicKey and privateKey JWK objects", 500);
    }

    const vapidKeys = await webpush.importVapidKeys(exportedKeys);
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: vapidSubject,
      vapidKeys,
    });

    // 5. Fetch active push subscriptions (service_role bypasses private RLS)
    const { data: subs, error: subsErr } = await adminClient
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("is_active", true);

    if (subsErr) {
      return jsonError("Failed to query subscriptions", 500);
    }

    const payload = JSON.stringify({
      title: (body.pushTitle ?? "St. Mary's Parish Update").slice(0, 100),
      body: (body.pushBody ?? "A new weekly schedule and parish bulletin is available.").slice(0, 220),
      url: body.pushUrl ?? (targetWeekStart ? `/?week=${targetWeekStart}` : "/"),
      tag: targetWeekStart ? `bulletin-${targetWeekStart}` : "parish-alert",
    });

    let sentCount = 0;
    const expiredIds: string[] = [];
    const batchSize = 25;

    for (let i = 0; i < (subs?.length ?? 0); i += batchSize) {
      const batch = subs!.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (sub) => {
          const subscriber = appServer.subscribe({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          });
          await subscriber.pushTextMessage(payload, { urgency: "normal", ttl: 86400 });
          return sub.id;
        })
      );

      for (let j = 0; j < results.length; j++) {
        const res = results[j];
        if (res.status === "fulfilled") {
          sentCount++;
        } else {
          const reason = res.reason as { response?: Response } | undefined;
          const status = reason?.response?.status;
          if (status === 404 || status === 410) {
            expiredIds.push(batch[j].id);
          }
        }
      }
    }

    if (expiredIds.length > 0) {
      await adminClient
        .from("push_subscriptions")
        .update({ is_active: false })
        .in("id", expiredIds);
    }

    if (body.bulletinId) {
      await adminClient
        .from("weekly_bulletins")
        .update({ push_sent_at: new Date().toISOString() })
        .eq("id", body.bulletinId);
    }

    // 6. Record immutable PUSH_DISPATCH audit entry
    await adminClient.from("audit_logs").insert({
      actor_user_id: user.id,
      actor_email: adminRecord.email,
      actor_role: adminRecord.role,
      action: "PUSH_DISPATCH",
      table_name: "push_subscriptions",
      record_id: body.bulletinId ?? "urgent-alert",
      change_summary: `Sent push notification to ${sentCount} active devices (${expiredIds.length} expired deactivated)`,
      new_data: { title: body.pushTitle, sentCount, deactivatedCount: expiredIds.length },
    });

    return jsonOk({ published: true, sent: sentCount, deactivated: expiredIds.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    console.error("publish-and-notify error:", err);
    return jsonError(message, 500);
  }
});

function parseVapidKeysJson(rawInput: string): webpush.ExportedVapidKeys {
  let raw = rawInput.trim();
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    raw = raw.slice(1, -1).trim();
  }

  try {
    let parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (parsed && typeof parsed === "object") {
      return parsed as webpush.ExportedVapidKeys;
    }
  } catch {
    // Recover JWK JSON whose inner double quotes were stripped by Windows PowerShell/CMD
  }

  const normalized = raw
    .replace(/([{\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/(:\s*|,\s*|\[\s*)([A-Za-z0-9_-]+)(?=\s*[,\]}])/g, (match, prefix, token) => {
      if (token === "true" || token === "false" || token === "null") {
        return match;
      }
      return `${prefix}"${token}"`;
    });

  return JSON.parse(normalized) as webpush.ExportedVapidKeys;
}

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
