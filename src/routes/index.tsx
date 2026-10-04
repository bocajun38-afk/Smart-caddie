import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { BottomNav } from "@/components/caddie/BottomNav";
import { PhoneShell, StatusBar } from "@/components/caddie/PhoneShell";
import { useRound } from "@/hooks/use-round";
import { TEE_BOXES, TEE_FACTORS, type TeeBox } from "@/lib/golf-data";
import { profileStore, roundsStore, scoreStore, settingsStore } from "@/lib/player-store";
import { setRoundState } from "@/lib/round-store";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Caddie — Votre parcours du jour" },
      {
        name: "description",
        content:
          "Résumé de votre parcours, météo du golf, dernier score et choix des repères avant de lancer la partie avec votre caddie IA.",
      },
      { property: "og:title", content: "Smart Caddie — Votre parcours du jour" },
      {
        property: "og:description",
        content: "Parcours, météo, dernier score et repères de départ : tout pour lancer votre partie.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

const TEE_DOT: Record<TeeBox, string> = {
  Blancs: "bg-paper ring-2 ring-ink/30",
  Jaunes: "bg-sand ring-2 ring-ink/20",
  Bleus: "bg-water",
  Rouges: "bg-accent",
};

function rel(n: number) {
  return n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;
}

function HomePage() {
  const round = useRound();
  const navigate = useNavigate();
  const { tee } = settingsStore.useStore();
  const { cards } = scoreStore.useStore();
  const { rounds } = roundsStore.useStore();

  useEffect(() => {
    if (!profileStore.get().onboarded) void navigate({ to: "/bienvenue" });
  }, [navigate]);

  const c = round.course;
  const f = TEE_FACTORS[tee];
  const totalLength = Math.round(c.holes.reduce((a, h) => a + h.length * f, 0));
  const totalPar = c.holes.reduce((a, h) => a + h.par, 0);
  const card = cards[c.id] ?? {};
  const inProgress = c.holes.filter((h) => card[h.number]);
  const live = inProgress.length
    ? {
        label: `En cours · ${inProgress.length} trous`,
        score: rel(inProgress.reduce((a, h) => a + card[h.number]!.strokes - h.par, 0)),
        sub: c.name,
      }
    : null;
  const last = rounds[0];
  const w = round.weather;

  function start() {
    setRoundState({ courseId: c.id, holeNumber: 1, shotProgress: 0 });
    void navigate({ to: "/trou" });
  }

  return (
    <PhoneShell>
      <StatusBar />

      <div className="px-5 pt-2">
        <div className="font-mono text-[11px] tracking-[0.2em] text-ink2 uppercase">Parcours sélectionné</div>
        <h1 className="mt-2 font-display text-[34px] font-bold leading-[1.05] text-balance">{c.name}</h1>
        <div className="mt-1 text-[14px] text-ink2">
          {[c.city, c.country].filter(Boolean).join(", ")}
          {" · "}
          <Link to="/parcours" className="underline">changer</Link>
        </div>
      </div>

      <div className="mx-5 mt-4 grid grid-cols-4 divide-x divide-border rounded-md bg-muted ring-1 ring-border">
        {[
          ["Trous", c.holes.length],
          ["Par", totalPar],
          ["Mètres", totalLength],
          ["Alt.", c.altitude != null ? `${c.altitude}` : "—"],
        ].map(([l, v]) => (
          <div key={l as string} className="px-2 py-3 text-center">
            <div className="font-mono text-[9px] tracking-[0.15em] text-ink2 uppercase">{l}</div>
            <div className="mt-1 font-display text-2xl leading-none">{v}</div>
          </div>
        ))}
      </div>

      <div className="mx-5 mt-3 rounded-md bg-primary p-4 text-primary-foreground">
        <div className="font-mono text-[10px] tracking-[0.2em] text-primary-foreground/70 uppercase">Météo au golf</div>
        {w ? (
          <div className="mt-2 flex items-end justify-between">
            <div className="font-display text-[56px] leading-none">{w.temperature}°</div>
            <div className="text-right font-mono text-[12px] leading-relaxed tracking-[0.05em] uppercase">
              <div>Vent {w.windSpeed} km/h {w.windLabel}</div>
              <div>Rafales {w.windGusts} km/h</div>
              <div>Humidité {w.humidity}% · {w.pressure} hPa</div>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-[15px] text-primary-foreground/80">
            {round.weatherLoading ? "Chargement de la météo…" : "Météo indisponible"}
          </div>
        )}
      </div>

      <div className="mx-5 mt-3">
        <div className="font-mono text-[11px] tracking-[0.2em] text-ink2 uppercase">Repères de départ</div>
        <div className="mt-2 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Repères de départ">
          {TEE_BOXES.map((t) => (
            <Button
              key={t}
              variant={t === tee ? "default" : "secondary"}
              role="radio"
              aria-checked={t === tee}
              onClick={() => settingsStore.set({ tee: t })}
              className={
                t === tee
                   ? "flex h-14 flex-col items-center justify-center gap-1 rounded-md bg-primary font-display text-base text-primary-foreground"
                   : "flex h-14 flex-col items-center justify-center gap-1 rounded-md bg-card font-display text-base text-foreground ring-1 ring-border"
              }
            >
              <span className={`size-3 shrink-0 rounded-full ${TEE_DOT[t]}`} />
              {t}
            </Button>
          ))}
        </div>
      </div>

      <div className="mx-5 mt-3">
        <Link to="/score" className="flex items-center justify-between rounded-md bg-card p-4 ring-1 ring-border">
          <div className="min-w-0">
            <div className="font-mono text-[10px] tracking-[0.2em] text-ink2 uppercase">
              {live ? live.label : "Dernier score"}
            </div>
            <div className="truncate text-[14px]">
              {live ? live.sub : last ? `${last.courseName} · ${new Date(last.date).toLocaleDateString("fr-FR")}` : "Aucune partie enregistrée"}
            </div>
          </div>
          <div className="font-display text-4xl leading-none">
            {live ? live.score : last ? rel(last.strokes - last.par) : "—"}
          </div>
        </Link>
      </div>

      <div className="mx-5 mt-4">
        <Button onClick={start}
          className="h-16 w-full rounded-md bg-accent font-display text-xl font-bold text-accent-foreground active:scale-[0.99]">
          Lancer la partie →
        </Button>
        {live && (
          <button onClick={() => navigate({ to: "/trou" })}
            className="mt-2 w-full font-mono text-[11px] tracking-[0.15em] text-ink2 uppercase underline">
            Reprendre au trou {round.hole.number}
          </button>
        )}
      </div>

      <BottomNav active="home" />
    </PhoneShell>
  );
}
