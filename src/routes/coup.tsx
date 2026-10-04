import { createFileRoute } from "@tanstack/react-router";
import { ArrowUp, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BottomNav } from "@/components/caddie/BottomNav";
import { HazardList } from "@/components/caddie/HazardList";
import { HoleMap } from "@/components/caddie/HoleMap";
import { PhoneShell, StatusBar } from "@/components/caddie/PhoneShell";
import { Button } from "@/components/ui/button";
import { buildContext, useRound } from "@/hooks/use-round";
import { useSpeech } from "@/hooks/use-speech";
import { streamCaddie, type ChatMessage } from "@/lib/caddie-client";

const STORAGE_PREFIX = "caddie-conversation";
const keyFor = (courseId: string, hole: number) => `${STORAGE_PREFIX}:${courseId}:${hole}`;

export const Route = createFileRoute("/coup")({
  head: () => ({
    meta: [
      { title: "Smart Caddie — Coup par coup" },
      {
        name: "description",
        content:
          "Distance restante, club recommandé, zone visée et justification de l'IA. Discutez avec votre caddie pour ajuster votre choix de club.",
      },
      { property: "og:title", content: "Smart Caddie — Coup par coup" },
      {
        property: "og:description",
        content:
          "Club recommandé en temps réel selon le vent et le terrain, avec un caddie IA à qui parler.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShotPage,
});

function loadMessages(key: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function ShotPage() {
  const round = useRound();
  const speech = useSpeech();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<"A" | "B">("A");
  const [mapOpen, setMapOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const chatKey = keyFor(round.course.id, round.hole.number);
  const chatKeyRef = useRef(chatKey);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    chatKeyRef.current = chatKey;
    abortRef.current?.abort();
    abortRef.current = null;
    speech.stop();
    setMessages(loadMessages(chatKey));
    setError(null);
    setStreaming(false);
    setInput("");
    setSelectedOption("A");
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  function persist(next: ChatMessage[], key: string = chatKeyRef.current) {
    if (key === chatKeyRef.current) setMessages(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next.slice(-60)));
    } catch {
      /* stockage indisponible */
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming) return;
    setInput("");
    setError(null);
    const base: ChatMessage[] = [...messages, { role: "user", content: question }];
    const key = chatKey;
    persist(base, key);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    let answer = "";
    try {
      await streamCaddie(
        { context: buildContext(round), messages: base },
        (chunk) => {
          answer += chunk;
          if (chatKeyRef.current === key)
            setMessages([...base, { role: "assistant", content: answer }]);
        },
        controller.signal,
      );
      persist([...base, { role: "assistant", content: answer }], key);
    } catch (e) {
      if (controller.signal.aborted) {
        if (answer) persist([...base, { role: "assistant", content: answer }], key);
        return;
      }
      if (chatKeyRef.current === key)
        setError((e as Error).message || "Le caddie n'a pas pu répondre.");
      persist(base, key);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setStreaming(false);
        inputRef.current?.focus();
      }
    }
  }

  function reset() {
    persist([]);
    setError(null);
    inputRef.current?.focus();
  }

  const layup = round.hazards.find((h) => h.verdict === "lay-up" && h.toFront < round.remaining);
  const lateral = round.hazards.find((h) => h.verdict === "latéral" && h.toFront < 250);
  const target = layup
    ? `Lay-up à ${Math.max(0, layup.toFront - 10)} m`
    : lateral
      ? `Moitié ${lateral.hazard.side === "Gauche" ? "droite" : "gauche"}`
      : round.remaining > 220
        ? "Milieu de fairway"
        : "Centre du green";
  const mainHazard = round.hazards.find((h) => h.verdict !== "loin");
  const latestAdvice = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const optionA = latestAdvice.match(/Option A\s*:\s*([\s\S]*?)(?=\s*Option B\s*:|$)/i)?.[1]?.trim().replace(/[.;\s]+$/, "");
  const optionB = latestAdvice.match(/Option B\s*:\s*([\s\S]*?)(?=$)/i)?.[1]?.trim().replace(/[.;\s]+$/, "");
  const saferClub = [...round.clubs].filter((c) => c.enabled && c.carry < (round.clubs.find((x) => x.name === round.club)?.carry ?? Infinity)).sort((a, b) => b.carry - a.carry)[0]?.name;
  const fallbackA = round.hole.par === 3 ? `${round.club} · centre du green` : `${round.club} · ${target.toLowerCase()}`;
  const fallbackB = round.hole.par === 3
    ? `${round.club} · autre zone du green`
    : mainHazard && saferClub ? `${saferClub} · placement avant ${mainHazard.hazard.kind.toLowerCase()}` : `${round.club} · milieu de piste`;
  const greenAnnouncement = round.greenRange
    ? `Trou ${round.hole.number}. Entrée du green à ${round.greenRange.front} mètres, milieu à ${round.greenRange.center} mètres, fond à ${round.greenRange.back} mètres. Distance corrigée au milieu : ${round.playingDistance} mètres.`
    : `Trou ${round.hole.number}. ${round.gpsActive ? "Milieu du green" : "Milieu du green estimé"} à ${round.remaining} mètres. Entrée et fond non disponibles : contour du green non cartographié.`;

  return (
    <PhoneShell>
      <StatusBar />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-5 pt-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase text-muted-foreground">{round.course.name}</p>
          <h1 className="font-display text-2xl font-bold">Trou {round.hole.number} <span className="text-muted-foreground">· Par {round.hole.par}</span></h1>
        </div>
        <span className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">{round.gpsActive ? "GPS actif" : "Distance estimée"}</span>
      </div>

      {round.course.source !== "demo" && (round.course.hasGeo || round.hole.greenSet) && (
        <div className="mx-5 mt-4 overflow-hidden rounded-md border border-border bg-muted">
          <Button type="button" variant="ghost" onClick={() => setMapOpen((v) => !v)} aria-expanded={mapOpen} className="h-12 w-full justify-between rounded-none px-4 font-bold">
            Carte du trou <span>{mapOpen ? "−" : "+"}</span>
          </Button>
          {mapOpen && <div className="[&_[role=application]]:!h-[210px]"><HoleMap hole={round.hole} course={round.course} position={round.position} gpsActive={round.gpsActive} /></div>}
        </div>
      )}

      <div className="mx-5 mt-3 rounded-md bg-primary px-5 py-5 text-primary-foreground">
        <div className="text-xs font-bold uppercase text-primary-foreground/75">Distance de jeu · Plays-like</div>
        <div className="flex items-baseline gap-2 font-display font-bold leading-none tabular-nums">
          <span className="tick text-[clamp(72px,20vw,108px)]">{round.playingDistance}</span>
          <span className="text-3xl">m</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-primary-foreground/25 pt-3 text-sm font-semibold">
          <span>Distance brute {round.remaining} m</span>
          <span className="text-gold">{round.shotElevation == null ? "Pente inconnue" : round.shotElevation > 0 ? `Montée ↗ +${round.shotElevation} m` : round.shotElevation < 0 ? `Descente ↘ ${round.shotElevation} m` : "À plat →"}</span>
        </div>
      </div>

      {mainHazard && <div className="mx-5 mt-3 inline-flex w-fit max-w-[calc(100%-2.5rem)] items-center gap-2 rounded-md bg-gold px-3 py-2 text-sm font-bold text-primary"><span aria-hidden="true">!</span><span className="truncate">{mainHazard.hazard.kind} · {mainHazard.hazard.side.toLowerCase()} · {mainHazard.toFront} m</span></div>}

      <section className="mx-5 mt-4" aria-label="Choix de jeu">
        <div className="mb-2 text-xs font-bold uppercase text-muted-foreground">{latestAdvice ? "Conseil du caddie" : "Options indicatives"} · {round.club}</div>
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Comparer les options de jeu">
          {(["A", "B"] as const).map((option) => (
            <Button key={option} type="button" role="tab" aria-selected={selectedOption === option} onClick={() => setSelectedOption(option)}
              variant={selectedOption === option ? "default" : "secondary"}
              className={`h-auto min-h-20 min-w-0 flex-col items-start whitespace-normal rounded-md px-3 py-3 text-left ${selectedOption === option ? "bg-primary text-primary-foreground" : "bg-background text-foreground ring-1 ring-border hover:bg-muted"}`}>
              <span className={`text-xs font-bold uppercase ${selectedOption === option ? "text-gold" : "text-muted-foreground"}`}>Option {option} · {option === "A" ? "Attaque" : round.hole.par === 3 ? "Autre zone" : "Sécurité"}</span>
              <span className="w-full text-base font-bold leading-tight">{option === "A" ? (optionA || fallbackA) : (optionB || fallbackB)}</span>
            </Button>
          ))}
        </div>
        <div role="tabpanel" className="mt-2 border-l-4 border-accent bg-muted px-4 py-3 text-sm font-medium leading-snug">
          {selectedOption === "A" ? (optionA || fallbackA) : (optionB || fallbackB)}
        </div>
      </section>

      <div className="mx-5 mt-3 border-y border-border py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-ink2 uppercase">Distances au green · brut</span>
          <Button type="button" variant="ghost" onClick={() => speech.playingId === "green" ? speech.stop() : speech.play("green", greenAnnouncement)}
            className="min-h-11 gap-1 px-2 text-xs font-semibold text-ink" aria-label={speech.playingId === "green" ? "Arrêter l'annonce des distances" : "Annoncer les distances au green"}>
            {speech.playingId === "green" ? <Square size={13} /> : <Volume2 size={15} />}
            {speech.playingId === "green" ? "Arrêter" : "Annoncer"}
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-3 text-center">
          {([ ["Entrée", round.greenRange?.front], ["Milieu", round.remaining], ["Fond", round.greenRange?.back] ] as const).map(([name, value]) => (
            <div key={name}>
              <div className="font-mono text-[10px] text-ink2 uppercase">{name}</div>
              <div className="font-display text-2xl">{value == null ? "—" : `${value} m`}</div>
            </div>
          ))}
        </div>
        {!round.greenRange && <p className="mt-1 text-center text-xs text-ink2">Contour du green indisponible : entrée et fond non mesurés.</p>}
        {!round.gpsActive && <p className="mt-1 text-center text-xs text-ink2">Sans position GPS : distance au milieu estimée, entrée et fond non vérifiés.</p>}
      </div>

      <div className="mx-5 mt-2 grid grid-cols-4 divide-x divide-border rounded-md bg-card text-center ring-1 ring-border">
        {[
          ["Brut", round.playsLike.raw],
          ["Pente", round.slopeKnown ? round.playsLike.slope : null],
          ["Air/Alt.", round.playsLike.air],
          ["Vent", round.playsLike.wind],
        ].map(([label, v], i) => (
          <div key={label as string} className="px-1 py-2">
            <div className="font-mono text-[9px] tracking-[0.12em] text-ink2 uppercase">{label}</div>
            <div className="font-display text-base leading-tight">
              {v == null ? "—" : i === 0 ? `${v} m` : `${(v as number) > 0 ? "+" : ""}${v} m`}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 px-5">
        <HazardList hazards={round.hazards} compact />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 px-5">
        <Button
          onClick={() => { round.advanceShot(); speech.stop(); }}
          className="h-12 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground"
        >
          Coup joué
        </Button>
        {messages.length > 0 && (
          <Button variant="ghost"
            onClick={reset}
            className="font-mono text-[10px] tracking-[0.15em] text-ink2 uppercase underline"
          >
            Effacer la discussion
          </Button>
        )}
      </div>

      <div className="mt-3 flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto px-5">
        {messages.length === 0 && !streaming && (
          <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-card px-3.5 py-2.5 text-[14px] leading-snug ring-1 ring-ink/10">
            Trou {round.hole.number} · par {round.hole.par} · {round.remaining} m du green.
            Demandez-moi ce que vous voulez : club, stratégie, obstacles, lecture du vent.
          </div>
        )}
        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div
                key={i}
                className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[14px] leading-snug whitespace-pre-wrap text-paper"
              >
                {m.content}
              </div>
            );
          }
          const isLast = i === messages.length - 1;
          const speaking = speech.playingId === `msg-${i}`;
          // Pas de bouton pendant que le caddie écrit sa réponse.
          const canSpeak = !(streaming && isLast);
          return (
            <div key={i} className="flex flex-col gap-1 self-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-card px-3.5 py-2.5 text-[14px] leading-snug whitespace-pre-wrap ring-1 ring-ink/10">
                {m.content}
              </div>
              {canSpeak && (
                <Button variant="ghost"
                  onClick={() => (speaking ? speech.stop() : speech.play(`msg-${i}`, m.content))}
                  className="flex min-h-11 w-fit items-center gap-1.5 rounded-md px-2 font-mono text-[10px] text-ink2 uppercase ring-1 ring-border"
                >
                  {speaking ? <Square size={11} className="fill-current" /> : <Volume2 size={13} />}
                  {speaking ? "Arrêter" : "Écouter"}
                </Button>
              )}
            </div>
          );
        })}
        {speech.error && (
          <div className="self-start font-mono text-[10px] tracking-[0.1em] text-ink2 uppercase">
            {speech.error}
          </div>
        )}
        {streaming && messages[messages.length - 1]?.role === "user" && (
          <div className="max-w-[80%] self-start rounded-2xl rounded-bl-md bg-card px-3.5 py-2.5 text-[14px] text-ink2 ring-1 ring-ink/10">
            Le caddie réfléchit…
          </div>
        )}
        {error && (
          <div className="max-w-[85%] self-start rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-[14px] text-destructive">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="px-4 pt-3 pb-3"
      >
        <div className="flex items-center gap-2 rounded-2xl bg-card p-2 ring-1 ring-ink/15">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-ink2/60"
            placeholder="Posez une question…"
          />
          <Button
            type="submit"
            disabled={streaming || input.trim().length === 0}
            aria-label="Envoyer la question"
            className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground disabled:opacity-40"
          >
            <ArrowUp size={20} />
          </Button>
        </div>
      </form>

      <BottomNav active="shot" />
    </PhoneShell>
  );
}
