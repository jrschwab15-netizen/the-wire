// Sends pending alerts as web push. Called by the database (pg_net) with a shared secret.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

function adminKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const k = JSON.parse(raw)["default"];
      if (k) return k;
    } catch (_) { /* fall through */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

const sb = createClient(Deno.env.get("SUPABASE_URL")!, adminKey(), { auth: { persistSession: false } });
let cfg: Record<string, string> | null = null;

Deno.serve(async (req: Request) => {
  try {
    if (!cfg) {
      const { data, error } = await sb.rpc("push_config");
      if (error || !data) return Response.json({ error: "config" }, { status: 500 });
      cfg = data as Record<string, string>;
      webpush.setVapidDetails("https://thewire-sport.com", cfg.vapid_public_key, cfg.vapid_private_key);
    }
    if (req.headers.get("x-hook-secret") !== cfg.push_hook_secret) return new Response("forbidden", { status: 403 });

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // claim the batch first so a second call can't send the same alert twice
    const { data: notes, error } = await sb.from("notifications").update({ pushed_at: new Date().toISOString() })
      .is("pushed_at", null).gt("created_at", since).select("id,player_id,game_id,kind,body").limit(500);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!notes || !notes.length) return Response.json({ sent: 0 });

    const ids = [...new Set(notes.map((n) => n.player_id))];
    const { data: subs } = await sb.from("push_subscriptions").select("id,player_id,endpoint,p256dh,auth").in("player_id", ids);
    let sent = 0;
    const dead: number[] = [];
    await Promise.all(notes.flatMap((n) => (subs || []).filter((s) => s.player_id === n.player_id).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.kind === "ping" ? "Play tonight" : "The Wire", body: n.body, game: n.game_id, tag: "n" + n.id }),
          { TTL: 3600 },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
      }
    })));
    if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);
    return Response.json({ sent, alerts: notes.length });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
