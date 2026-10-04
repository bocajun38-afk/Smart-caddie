import { useCallback, useEffect, useRef, useState } from "react";

import { streamSpeech } from "@/lib/speech";

// Nettoie le texte avant lecture : pas de markdown, pas de symboles qui
// se lisent mal à voix haute.
function spokenText(raw: string) {
  const short = raw.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 520);
  return short
    .replace(/[*_`#>]/g, "")
    .replace(/·/g, ",")
    .replace(/\b(\d{1,3})\s?m\b/g, "$1 mètres")
    .replace(/\s+/g, " ")
    .trim();
}

// Lit une réponse du caddie à voix haute, une lecture à la fois.
// Le composant garde le hook monté : changer d'écran ou de trou arrête la voix.
export function useSpeech() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPlayingId(null);
  }, []);

  const play = useCallback((id: string, text: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPlayingId(id);
    setError(null);
    void streamSpeech("/api/speech", spokenText(text), controller.signal)
      .catch(() => {
        if (controller.signal.aborted) return;
        setError("La voix n'a pas pu être jouée.");
      })
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setPlayingId(null);
        }
      });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { playingId, play, stop, error };
}
