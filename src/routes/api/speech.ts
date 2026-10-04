import { createFileRoute } from "@tanstack/react-router";

import { requestSpeech } from "@/lib/speech.server";

// POST /api/speech — synthèse vocale du caddie.
// Le texte vient du client ; la clé Lovable AI reste côté serveur.
// Réponse : flux SSE d'échantillons audio (jamais mis en mémoire tampon).
export const Route = createFileRoute("/api/speech")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) return new Response(null, { status: 499 });

        const payload = (await request.json().catch(() => null)) as { text?: unknown } | null;
        const text = typeof payload?.text === "string" ? payload.text : "";
        // Le texte à lire est court (une réponse du caddie) ; on borne quand même.
        if (!text.trim()) return new Response("Texte manquant", { status: 400 });
        const clipped = text.slice(0, 4000);

        try {
          const upstream = await requestSpeech(clipped, request.signal);
          if (!upstream.ok) {
            return new Response(upstream.body, {
              status: upstream.status,
              headers: {
                "Content-Type": upstream.headers.get("content-type") ?? "text/plain",
                "Cache-Control": "no-cache",
              },
            });
          }
          return new Response(upstream.body, {
            headers: {
              "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
              "Cache-Control": "no-cache",
            },
          });
        } catch (e) {
          if (request.signal.aborted || (e as Error).name === "AbortError") {
            return new Response(null, { status: 499 });
          }
          return new Response("Synthèse vocale indisponible", { status: 502 });
        }
      },
    },
  },
});
