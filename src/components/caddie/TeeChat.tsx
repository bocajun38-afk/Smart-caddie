import { Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buildTeeContext, type useRound } from "@/hooks/use-round";
import type { useSpeech } from "@/hooks/use-speech";
import { streamCaddie, type ChatMessage } from "@/lib/caddie-client";

const SUGGESTIONS = ["Quel est le coup juste au départ ?", "Le bunker est-il vraiment en jeu ?", "Driver ou bois, et pourquoi ?"];

function load(key: string): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

/** Discussion stratégique sur le tee : un historique par trou et par parcours. */
export function TeeChat({
  round,
  speech,
}: {
  round: ReturnType<typeof useRound>;
  speech: ReturnType<typeof useSpeech>;
}) {
  const key = `caddie-tee:${round.course.id}:${round.hole.number}`;
  const keyRef = useRef(key);
  const abortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    keyRef.current = key;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages(load(key));
    setStreaming(false);
    setError(null);
  }, [key]);
  useEffect(() => () => abortRef.current?.abort(), []);

  function persist(next: ChatMessage[], k: string) {
    if (k === keyRef.current) setMessages(next);
    try {
      window.localStorage.setItem(k, JSON.stringify(next.slice(-40)));
    } catch {
      /* stockage indisponible */
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || streaming) return;
    setInput("");
    setError(null);
    const k = key;
    const base: ChatMessage[] = [...messages, { role: "user", content: q }];
    persist(base, k);
    setStreaming(true);
    const c = new AbortController();
    abortRef.current = c;
    let answer = "";
    try {
      await streamCaddie(
        { context: buildTeeContext(round), messages: base },
        (chunk) => {
          answer += chunk;
          if (keyRef.current === k) setMessages([...base, { role: "assistant", content: answer }]);
        },
        c.signal,
      );
      persist([...base, { role: "assistant", content: answer }], k);
    } catch (e) {
      if (c.signal.aborted) {
        if (answer) persist([...base, { role: "assistant", content: answer }], k);
        return;
      }
      if (keyRef.current === k) setError((e as Error).message || "Le caddie n'a pas pu répondre.");
    } finally {
      if (abortRef.current === c) {
        abortRef.current = null;
        setStreaming(false);
      }
    }
  }

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-ink/10">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.2em] text-ink2 uppercase">
          Stratégie au départ · Trou {round.hole.number}
        </span>
        {messages.length > 0 && (
          <button onClick={() => persist([], key)}
            className="font-mono text-[10px] tracking-[0.15em] text-ink2 uppercase underline">
            Effacer
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-ink px-3 py-2 text-[14px] leading-snug text-paper">
              {m.content}
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-1 self-start">
              <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-paper px-3 py-2 text-[14px] leading-snug whitespace-pre-wrap ring-1 ring-ink/10">
                {m.content}
              </div>
              {!(streaming && i === messages.length - 1) && (
                <button
                  onClick={() => (speech.playingId === `tee-${i}` ? speech.stop() : speech.play(`tee-${i}`, m.content))}
                  className="flex w-fit items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] tracking-[0.15em] text-ink2 uppercase ring-1 ring-ink/10"
                >
                  {speech.playingId === `tee-${i}` ? <Square size={11} className="fill-current" /> : <Volume2 size={13} />}
                  {speech.playingId === `tee-${i}` ? "Arrêter" : "Écouter"}
                </button>
              )}
            </div>
          ),
        )}
        {streaming && messages[messages.length - 1]?.role === "user" && (
          <div className="self-start text-[14px] text-ink2">Le caddie étudie le départ…</div>
        )}
        {error && <div className="text-[14px] text-destructive">{error}</div>}
      </div>

      {messages.length === 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => void send(s)}
              className="rounded-full bg-paper px-3 py-1.5 text-[13px] ring-1 ring-ink/15 active:bg-ink/10">
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }}
        className="mt-3 flex items-center gap-2 rounded-xl bg-paper p-1.5 ring-1 ring-ink/15">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Votre question avant de jouer…"
          className="min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-ink2/60" />
        <button type="submit" disabled={streaming || !input.trim()}
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent font-display text-lg text-accent-ink disabled:opacity-40">
          ↑
        </button>
      </form>
    </div>
  );
}
