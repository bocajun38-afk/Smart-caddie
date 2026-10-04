import { createFileRoute } from "@tanstack/react-router";

import { BottomNav } from "@/components/caddie/BottomNav";
import { PhoneShell, StatusBar } from "@/components/caddie/PhoneShell";
import { Stepper } from "@/components/caddie/Stepper";
import { useRound } from "@/hooks/use-round";
import { toast } from "sonner";

import { clearCard, deleteRound, roundsStore, saveRound, scoreStore, setHoleScore } from "@/lib/player-store";

export const Route = createFileRoute("/score")({
  head: () => ({
    meta: [
      { title: "Smart Caddie — Carte de score" },
      { name: "description", content: "Saisissez vos coups et putts trou par trou et suivez votre total par rapport au par." },
      { property: "og:title", content: "Smart Caddie — Carte de score" },
      { property: "og:description", content: "Carte de score et statistiques de putts, trou par trou." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScorePage,
});

function rel(n: number) {
  return n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;
}

function ScorePage() {
  const round = useRound();
  const { cards } = scoreStore.useStore();
  const { rounds } = roundsStore.useStore();
  const card = cards[round.course.id] ?? {};
  const hole = round.hole;
  const current = card[hole.number] ?? { strokes: hole.par, putts: 2 };
  const entered = card[hole.number] !== undefined;

  const played = round.course.holes.filter((h) => card[h.number]);
  const strokes = played.reduce((a, h) => a + card[h.number]!.strokes, 0);
  const par = played.reduce((a, h) => a + h.par, 0);
  const putts = played.reduce((a, h) => a + card[h.number]!.putts, 0);

  const halves = [round.course.holes.slice(0, 9), round.course.holes.slice(9, 18)].filter((x) => x.length);

  return (
    <PhoneShell>
      <StatusBar />
      <div className="flex items-end justify-between px-5 pt-2">
        <div>
          <div className="font-mono text-[11px] tracking-[0.2em] text-ink2 uppercase">Total · {played.length} trous</div>
          <div className="font-display text-[72px] leading-none">{played.length ? rel(strokes - par) : "—"}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[11px] tracking-[0.18em] text-ink2 uppercase">Coups / Putts</div>
          <div className="font-display text-3xl leading-none">{strokes} / {putts}</div>
        </div>
      </div>

      <div className="mx-5 mt-4 rounded-3xl bg-ink p-4 text-paper">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-[0.2em] text-paper/70 uppercase">
            Trou {hole.number} · Par {hole.par}
          </span>
          <span className="font-mono text-[11px] tracking-[0.2em] text-accent uppercase">
            {entered ? rel(current.strokes - hole.par) : "Non saisi"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-paper p-3 text-ink">
          <div>
            <div className="mb-2 font-mono text-[10px] tracking-[0.15em] text-ink2 uppercase">Coups</div>
            <Stepper size="lg" value={current.strokes} min={1} max={15} label="coups"
              onChange={(v) => setHoleScore(round.course.id, hole.number, { strokes: v, putts: Math.min(current.putts, v) })} />
          </div>
          <div>
            <div className="mb-2 font-mono text-[10px] tracking-[0.15em] text-ink2 uppercase">Putts</div>
            <Stepper size="lg" value={current.putts} min={0} max={Math.min(8, current.strokes)} label="putts"
              onChange={(v) => setHoleScore(round.course.id, hole.number, { strokes: current.strokes, putts: v })} />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {!entered && (
            <button onClick={() => setHoleScore(round.course.id, hole.number, current)}
              className="h-11 flex-1 rounded-xl bg-paper/10 font-display text-base">
              Valider {hole.par} / 2
            </button>
          )}
          {hole.number < round.course.holes.length && (
            <button onClick={() => { if (!entered) setHoleScore(round.course.id, hole.number, current); round.setHole(hole.number + 1); }}
              className="h-11 flex-1 rounded-xl bg-accent font-display text-base text-accent-ink">
              Trou suivant →
            </button>
          )}
        </div>
      </div>

      {halves.map((holes, idx) => {
        const sub = holes.filter((h) => card[h.number]);
        return (
          <div key={idx} className="mx-5 mt-3 overflow-x-auto rounded-2xl bg-card ring-1 ring-ink/10">
            <table className="w-full text-center font-mono text-[12px]">
              <tbody>
                <tr className="border-b border-ink/10 text-ink2">
                  <th className="px-2 py-1.5 text-left">Trou</th>
                  {holes.map((h) => (
                    <td key={h.number}>
                      <button onClick={() => round.setHole(h.number)}
                        className={h.number === hole.number ? "rounded bg-ink px-1 text-paper" : ""}>{h.number}</button>
                    </td>
                  ))}
                  <th className="px-2">{idx === 0 ? "Aller" : "Retour"}</th>
                </tr>
                <tr className="border-b border-ink/10 text-ink2">
                  <th className="px-2 py-1.5 text-left">Par</th>
                  {holes.map((h) => <td key={h.number}>{h.par}</td>)}
                  <th>{holes.reduce((a, h) => a + h.par, 0)}</th>
                </tr>
                <tr className="border-b border-ink/10 font-display text-base">
                  <th className="px-2 py-1.5 text-left font-mono text-[12px] text-ink2">Score</th>
                  {holes.map((h) => {
                    const s = card[h.number];
                    const d = s ? s.strokes - h.par : 0;
                    return (
                      <td key={h.number} className={s ? (d < 0 ? "text-accent" : d > 0 ? "text-ink" : "text-ink2") : "text-ink2/40"}>
                        {s ? s.strokes : "·"}
                      </td>
                    );
                  })}
                  <th className="font-display">{sub.reduce((a, h) => a + card[h.number]!.strokes, 0) || "—"}</th>
                </tr>
                <tr className="text-ink2">
                  <th className="px-2 py-1.5 text-left">Putts</th>
                  {holes.map((h) => <td key={h.number}>{card[h.number]?.putts ?? "·"}</td>)}
                  <th>{sub.reduce((a, h) => a + card[h.number]!.putts, 0) || "—"}</th>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      {played.length > 0 && (
        <div className="mt-3 flex items-center gap-3 px-5">
          <button
            onClick={() => {
              saveRound({
                courseId: round.course.id,
                courseName: round.course.name,
                tee: round.tee,
                holes: played.length,
                strokes,
                putts,
                par,
                card,
              });
              clearCard(round.course.id);
              round.setHole(1);
              toast.success("Partie enregistrée dans votre historique");
            }}
            className="h-12 flex-1 rounded-xl bg-ink font-display text-lg text-paper"
          >
            Enregistrer la partie
          </button>
          <button
            onClick={() => { if (window.confirm("Effacer la carte de score sans l'enregistrer ?")) clearCard(round.course.id); }}
            className="font-mono text-[10px] tracking-[0.15em] text-ink2 uppercase underline"
          >
            Effacer
          </button>
        </div>
      )}

      {rounds.length > 0 && (
        <div className="mx-5 mt-5">
          <div className="font-mono text-[11px] tracking-[0.2em] text-ink2 uppercase">Parties enregistrées</div>
          <ul className="mt-2 divide-y divide-ink/10 rounded-2xl bg-card ring-1 ring-ink/10">
            {rounds.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium">{r.courseName}</div>
                  <div className="font-mono text-[10px] tracking-[0.1em] text-ink2 uppercase">
                    {new Date(r.date).toLocaleDateString("fr-FR")} · {r.holes} trous · {r.tee} · {r.putts} putts
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-display text-2xl leading-none">{rel(r.strokes - r.par)}</div>
                    <div className="font-mono text-[10px] text-ink2">{r.strokes} coups</div>
                  </div>
                  <button aria-label="Supprimer la partie"
                    onClick={() => { if (window.confirm("Supprimer cette partie ?")) deleteRound(r.id); }}
                    className="font-mono text-[14px] text-ink2">×</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <BottomNav active="score" />
    </PhoneShell>
  );
}
