import { Link } from "@tanstack/react-router";

import type { HazardAnalysis } from "@/lib/golf-data";

const VERDICT: Record<HazardAnalysis["verdict"], { text: string; cls: string }> = {
  passer: { text: "Ça passe", cls: "bg-ink text-paper" },
  "lay-up": { text: "Lay-up", cls: "bg-accent text-accent-ink" },
  "latéral": { text: "Latéral", cls: "bg-paper text-ink ring-1 ring-ink/15" },
  loin: { text: "Hors portée", cls: "bg-paper text-ink2 ring-1 ring-ink/15" },
};

export function HazardList({ hazards, compact = false }: { hazards: HazardAnalysis[]; compact?: boolean }) {
  if (hazards.length === 0) {
    return (
      <div className="rounded-2xl bg-card px-4 py-3 text-[13px] text-ink2 ring-1 ring-ink/10">
        Aucun obstacle devant vous.{" "}
        <Link to="/parcours" className="underline">Déclarer les obstacles</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {hazards.slice(0, compact ? 2 : 6).map((h) => {
        const v = VERDICT[h.verdict];
        return (
          <div key={h.hazard.id} className="rounded-2xl bg-card px-4 py-3 ring-1 ring-ink/10">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-lg leading-tight">
                {h.hazard.kind} · {h.hazard.side.toLowerCase()}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${v.cls}`}>
                {v.text}
              </span>
            </div>
            <div className="mt-1 flex gap-4 font-mono text-[11px] tracking-[0.1em] text-ink2 uppercase">
              <span>Entrée <b className="font-display text-base text-ink">{h.toFront} m</b></span>
              <span>Carry <b className="font-display text-base text-ink">{h.carry} m</b></span>
            </div>
            {!compact && <p className="mt-1 text-[13px] leading-snug">{h.advice}</p>}
          </div>
        );
      })}
    </div>
  );
}
