/**
 * Edge Function: verify user session (server-side) + return sync hints.
 *
 * Deploy:
 *   supabase functions deploy session --project-ref xikribjyvqrilgbaxdel
 *
 * Secrets are injected on Supabase Edge automatically when linked:
 *   SUPABASE_URL, SUPABASE_ANON_KEY / publishable, SUPABASE_SERVICE_ROLE_KEY / secret
 *
 * Client must send: Authorization: Bearer <user_access_token>
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    // Prefer secret for admin counts; fall back to publishable + user JWT for RLS
    const secret =
      Deno.env.get("SUPABASE_SECRET_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "";
    const publishable =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      "";

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Bearer token" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // User-scoped client (respects RLS)
    const userClient = createClient(url, publishable || secret, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: userErr?.message || "Invalid session" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const uid = userData.user.id;

    const [{ count: quizCount }, { count: srsCount }, { count: dueCount }] = await Promise.all([
      userClient
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .is("deleted_at", null),
      userClient
        .from("srs_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .is("deleted_at", null),
      userClient
        .from("srs_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .is("deleted_at", null)
        .lte("next_review", new Date().toISOString()),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: uid,
          email: userData.user.email,
        },
        sync: {
          quizzes: quizCount ?? 0,
          srs_cards: srsCount ?? 0,
          srs_due: dueCount ?? 0,
          server_time: new Date().toISOString(),
        },
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
