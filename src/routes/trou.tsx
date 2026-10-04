import { createFileRoute } from "@tanstack/react-router";
import { Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { BottomNav } from "@/components/caddie/BottomNav";
import { HoleMap } from "@/components/caddie/HoleMap";
import { TeeChat } from "@/components/caddie/TeeChat";
import { HazardList } from "@/components/caddie/HazardList";
import { HoleSwitcher } from "@/components/caddie/HoleSwitcher";
import { PhoneShell, StatusBar } from "@/components/caddie/PhoneShell";
import { buildTeeContext, useRound } from "@/hooks/use-round";
import { useSpeech } from "@/hooks/use-speech";
import { streamCaddie } from "@/lib/caddie-client";
import { getOsmLayout } from "@/lib/osm-layout.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/trou")({
  head: () => ({
    meta: [
      { title: "Smart Caddie — Schéma et stratégie du trou" },
      {
        name: "description",
        content:
          "Votre caddie intelligent : détection GPS du parcours et du trou, par, stroke index, distance, météo et lecture du trou par l'IA.",
      },
      { property: "og:title", content: "Smart Caddie — Schéma et stratégie du trou" },
      {
        property: "og:description",
        content:
          "Détection GPS du parcours et du trou, météo locale et lecture du trou rédigée par l'IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HolePage,
});

// Lectures de trou déjà générées (par trou + météo) : pas de nouvelle requête au retour sur l'écran.
const summaryCache = new Map<string, string>();

function HolePage() {
  const round = useRound();
  const speech = useSpeech();
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const requested = useRef<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const layoutFn = useServerFn(getOsmLayout);
  const mapLayout = useQuery({
    queryKey: ["hole-map-layout", round.course.id, round.course.lat, round.course.lng],
    queryFn: () => layoutFn({ data: { lat: round.course.lat, lng: round.course.lng } }),
    enabled: round.course.hasGeo && round.course.source !== "demo" && !round.hole.line?.length,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const mappedHole = mapLayout.data?.holes.find((h) => h.number === round.hole.number);
  const mapHole = mappedHole?.line?.length ? { ...round.hole, line: mappedHole.line } : round.hole;
  useEffect(() => setDetailsOpen(false), [round.course.id, round.hole.number]);

  const key = `flash-${round.course.id}-${round.hole.number}-${round.hole.hazards.length}-${round.weather?.windSpeed ?? "na"}`;

  useEffect(() => {
    if (requested.current === key) return;
    const cached = summaryCache.get(key);
    if (cached) {
      requested.current = key;
      setSummary(cached);
      setError(null);
      return;
    }
    let active = true;
    // Petit délai : évite de lancer puis annuler aussitôt une requête
    // (remontage StrictMode, météo qui arrive juste après le premier rendu).
    const timer = setTimeout(() => {
      requested.current = key;
      setSummary("");
      setError(null);
      let text = "";
      streamCaddie(
        {
          context: buildTeeContext(round),
          messages: [
            {
              role: "user",
              content:
                "Lis ce départ au format Flash Argumenté, en 2 ou 3 phrases maximum. Par 3 : danger autour du green s'il est documenté, distance Plays-like, puis Option A centre du green et Option B attaque d'une autre zone du green (drapeau seulement si sa position est connue), avec clubs et raisons courtes. Par 4/5 : ligne de mise en jeu et danger majeur pertinent, longueur Plays-like depuis le tee, puis Option A attaque et Option B sécurité avec clubs, zones et raisons courtes. N'ajoute ni météo superflue ni commentaire sur les données absentes.",
            },
          ],
        },
        (chunk) => {
          text += chunk;
          if (active) setSummary((s) => s + chunk);
        },
      )
        .then(() => {
          if (text) summaryCache.set(key, text);
        })
        .catch((e: Error) => {
          if (active) setError(e.message || "Lecture du trou indisponible.");
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      active = false;
      if (requested.current === key) requested.current = null;
      speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const geoLabel =
    round.geoStatus === "ready"
      ? `GPS actif ±${round.accuracy} m`
      : round.geoStatus === "weak"
        ? `Signal GPS faible ±${round.accuracy} m`
        : round.geoStatus === "locating" || round.geoStatus === "idle"
          ? "En attente de signal GPS"
          : round.geoStatus === "denied"
            ? "GPS refusé"
            : "GPS indisponible";

  // Glisser horizontal pour changer de trou (la carte garde son propre panoramique).
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const holeCount = round.course.holes.length;
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const next = dx < 0 ? round.hole.number + 1 : round.hole.number - 1;
    if (next >= 1 && next <= holeCount) round.setHole(next);
  };

  return (
    <PhoneShell>
      <StatusBar />

      <div className="px-5 pt-2" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-ink font-display text-sm text-paper">
              C
            </span>
            <span className="min-w-0 truncate text-xs font-bold uppercase text-ink2">
              {round.course.name}
            </span>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase text-ink2">
            {geoLabel}
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-xs font-bold uppercase text-ink2">
              Trou {round.hole.number} · Par {round.hole.par} · Repères {round.tee}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="tick font-display text-[72px] font-bold leading-none">
                {round.hole.length}
              </span>
              <span className="font-display text-2xl text-ink2">m</span>
            </div>
            <div className="mt-1 font-body text-[14px] font-semibold text-ink2">
              Joue comme <strong className="text-accent">{round.holePlaysLike.total} m</strong>{!round.course.hasGeo && <span className="text-xs font-normal"> · pente non vérifiée</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] tracking-[0.18em] text-ink2 uppercase">SI</div>
            <div className="font-display text-4xl leading-none">{round.hole.strokeIndex}</div>
          </div>
        </div>

        <div className="mt-3">
          <HoleSwitcher
            course={round.course}
            current={round.hole.number}
            onSelect={round.setHole}
          />
        </div>
      </div>

      <div className="mx-5 mt-4 flex items-center gap-4 border-y border-border py-2.5 text-[13px] font-semibold">
        <span>Vent {round.weather ? `${round.weather.windSpeed} km/h ${round.weather.windLabel}` : "—"}</span>
        <span className="text-ink2">{round.weather ? `${round.weather.temperature}°C` : "Météo —"}</span>
      </div>

      <div className="mt-4 px-5">
        <HoleMap hole={mapHole} course={round.course} position={round.position} gpsActive={round.gpsActive} />
      </div>

      <div className="mt-4 px-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="rise rounded-md border-l-4 border-accent bg-primary px-4 py-4 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent" />
              <span className="font-mono text-[10px] tracking-[0.2em] text-primary-foreground/70 uppercase">
                Lecture du trou
              </span>
            </div>
            {!error && summary && (
              <button
                onClick={() =>
                  speech.playingId === "trou" ? speech.stop() : speech.play("trou", summary)
                }
                className="flex min-h-11 items-center gap-1.5 rounded-md bg-primary-foreground/15 px-3 font-mono text-[10px] text-primary-foreground uppercase active:bg-primary-foreground/20"
              >
                {speech.playingId === "trou" ? (
                  <Square size={10} className="fill-current" />
                ) : (
                  <Volume2 size={12} />
                )}
                {speech.playingId === "trou" ? "Arrêter" : "Écouter"}
              </button>
            )}
          </div>
          <p className="mt-2 text-[16px] leading-relaxed text-pretty">
            {error ?? summary ?? ""}
            {!error && !summary && "Le caddie analyse le trou…"}
          </p>
        </div>
      </div>

      <div className="mt-3 px-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Button variant="ghost" className="w-full justify-between border-b border-border px-0 text-sm font-semibold" onClick={() => setDetailsOpen((v) => !v)} aria-expanded={detailsOpen}>
          {detailsOpen ? "Masquer les détails" : "Voir les obstacles et la météo"}
          <span aria-hidden="true">{detailsOpen ? "−" : "+"}</span>
        </Button>
        {detailsOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-ink2">Dénivelé départ-green {round.hole.elevation > 0 ? "+" : ""}{round.hole.elevation} m · Humidité {round.weather ? `${round.weather.humidity}%` : "—"} · Pression {round.weather ? `${round.weather.pressure} hPa` : "—"}</p>
            <HazardList hazards={round.hazards} />
          </div>
        )}
      </div>

      <div className="mt-4 px-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <TeeChat round={round} speech={speech} />
      </div>

      <div className="mt-3 px-5 text-center font-mono text-[10px] tracking-[0.15em] text-ink2 uppercase">
        ← Glisser pour changer de trou →
      </div>

      <BottomNav active="hole" />
    </PhoneShell>
  );
}
