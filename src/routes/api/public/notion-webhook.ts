import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/notion-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));

        // Notion sends a verification token on initial setup
        if (body?.verification_token) {
          console.log("Notion webhook verification token:", body.verification_token);
          return Response.json({ verification_token: body.verification_token });
        }

        // Touch sync_state so the UI can detect activity
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("sync_state")
            .update({ last_sync: new Date().toISOString() })
            .eq("id", 1);
        } catch (e) {
          console.error("sync_state touch failed", e);
        }

        return Response.json({ ok: true });
      },
      GET: async () =>
        new Response("Notion webhook endpoint. POST only.", { status: 200 }),
    },
  },
});