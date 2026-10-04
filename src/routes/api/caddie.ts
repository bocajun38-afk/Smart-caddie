import { createFileRoute } from "@tanstack/react-router";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM = `Tu es un caddie de golf professionnel français, bienveillant et direct. Parle avec complicité, comme à voix basse sur le fairway. Garde les noms anglais du golf et les noms exacts des clubs (Driver, Putter, Pitching, Fer 7, etc.) ; ne les traduis jamais.
Pour TOUT conseil de coup, y compris lecture du trou et chat, adopte le format « Flash Argumenté » : 2 ou 3 phrases maximum, naturelles, sans puces, sans titre, sans roman technique ni liste de mots secs. Les libellés « Option A : » et « Option B : » peuvent partager la dernière phrase, séparés par un point-virgule. Donne le club, la zone visée et une micro-justification concrète ; tranche pour la meilleure option quand c'est utile. Pas de météo superflue : tiens compte du vent et de l'air dans le calcul mais n'en parle que si leur effet change réellement le choix. Ne te plains JAMAIS des données absentes : omets silencieusement ce qui n'est pas connu, sans inventer de danger, de distance, de pente, de contour de green ou de position de drapeau. Ne présente pas une pente inconnue comme mesurée.
PAR 3 — attaque de green uniquement, jamais de lay-up : phrase 1, danger principal documenté autour du green et sa distance si connue (sinon commence directement par la distance) ; phrase 2, distance corrigée Plays-like et pente seulement si mesurée ; phrase 3, Option A : club et centre du green pour la sécurité, avec raison courte ; Option B : club et attaque du drapeau si sa position est connue, sinon une autre zone du green, avec raison courte. Choisis le carry à partir des distances entrée/milieu/fond quand elles sont connues, sans réciter tous les chiffres inutilement.
PAR 4 / PAR 5 — stratégie en deux temps : phrase 1, zone de mise en jeu et danger majeur documenté si pertinent ; phrase 2, distance restante corrigée Plays-like (ou longueur depuis le tee si le coup n'est pas encore joué), avec montée/descente seulement si mesurée ; phrase 3, Option A : club et zone d'attaque directe avec raison courte ; Option B : club et zone de sécurité ou lay-up avec raison courte. Ne recommande un lay-up que si un obstacle majeur est réellement en jeu ; ne rejette pas le Driver pour un bunker hors de sa zone de retombée. Si le green est à portée sur un par 4/5, les deux options peuvent viser le green (centre contre drapeau), sans lay-up forcé.
La configuration du green n'entre dans la réponse que par un danger cartographié pertinent. Si aucun danger n'est connu, passe directement à la zone cible ou à la distance ; ne dis pas « aucun danger connu » ou « donnée manquante ». Réponds à la question du joueur sans ajouter des détails hors sujet ; développe uniquement s'il demande explicitement plus de détails.`;

export const Route = createFileRoute("/api/caddie")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response("Le caddie IA n'est pas configuré.", { status: 500 });
        }

        let body: { context?: string; messages?: ChatMessage[] };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Requête invalide.", { status: 400 });
        }

        const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
        if (messages.length === 0) {
          return new Response("Aucun message.", { status: 400 });
        }

        const input = [
          { role: "system" as const, content: SYSTEM },
          ...(body.context
            ? [{ role: "system" as const, content: `Situation actuelle :\n${body.context}` }]
            : []),
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ];

        // Contrôleur propre : l'annulation côté client ne doit jamais remonter en erreur serveur.
        const upstreamAbort = new AbortController();
        const onAbort = () => upstreamAbort.abort();
        request.signal.addEventListener("abort", onAbort, { once: true });

        let upstream: Response;
        try {
          upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: "openai/gpt-6-astra",
              input,
              stream: true,
              store: false,
              reasoning: { effort: "low" },
            }),
            signal: upstreamAbort.signal,
          });
        } catch (error) {
          // Le client a quitté l'écran ou annulé : ce n'est pas une panne serveur.
          if (upstreamAbort.signal.aborted || (error as Error)?.name === "AbortError") {
            return new Response(null, { status: 499 });
          }
          console.error("caddie fetch error", error);
          return new Response("Le caddie IA est indisponible.", { status: 502 });
        }

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          if (upstream.status === 429) {
            return new Response("Trop de demandes, réessayez dans un instant.", { status: 429 });
          }
          if (upstream.status === 402) {
            return new Response("Crédits IA épuisés.", { status: 402 });
          }
          console.error("caddie upstream error", upstream.status, detail);
          return new Response("Le caddie IA est indisponible.", { status: 502 });
        }

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const reader = upstream.body!.getReader();
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.startsWith("data:")) continue;
                  const payload = line.slice(5).trim();
                  if (!payload || payload === "[DONE]") continue;
                  try {
                    const event = JSON.parse(payload) as {
                      type?: string;
                      delta?: string;
                    };
                    if (event.type === "response.output_text.delta" && event.delta) {
                      controller.enqueue(encoder.encode(event.delta));
                    }
                  } catch {
                    /* ignore partial frames */
                  }
                }
              }
            } catch (error) {
              if (!upstreamAbort.signal.aborted && (error as Error)?.name !== "AbortError") {
                console.error("caddie stream error", error);
              }
            } finally {
              request.signal.removeEventListener("abort", onAbort);
              try {
                controller.close();
              } catch {
                /* flux déjà fermé */
              }
            }
          },
          cancel() {
            upstreamAbort.abort();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
