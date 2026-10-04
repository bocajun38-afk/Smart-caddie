import type { Hazard, Hole } from "@/lib/golf-data";

type Pt = { x: number; y: number };

const W = 200;
const H = 320;

function dogleg(shape: string): number {
  const s = shape.toLowerCase();
  if (s.includes("gauche")) return -1;
  if (s.includes("droit") && s.includes("dogleg")) return 1;
  if (s.includes("droite")) return 1;
  return 0;
}

/** Schéma du trou : fairway, dogleg, obstacles, repères de distance et position du joueur. */
export function HoleLayout({ hole, progress }: { hole: Hole; progress: number }) {
  const bend = dogleg(hole.shape);
  const tee: Pt = { x: W / 2 - bend * 20, y: H - 26 };
  const green: Pt = { x: W / 2 + bend * 45, y: 36 };
  const ctrl: Pt = { x: W / 2 - bend * 45, y: H * 0.38 };
  const par3 = hole.par === 3;

  const at = (t: number): Pt => {
    const u = Math.min(1, Math.max(0, t));
    const a = (1 - u) ** 2;
    const b = 2 * (1 - u) * u;
    const c = u ** 2;
    return { x: a * tee.x + b * ctrl.x + c * green.x, y: a * tee.y + b * ctrl.y + c * green.y };
  };
  const normal = (t: number): Pt => {
    const d1 = at(t - 0.01);
    const d2 = at(t + 0.01);
    const dx = d2.x - d1.x;
    const dy = d2.y - d1.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l };
  };
  const len = Math.max(1, hole.length);
  const tOf = (m: number) => m / len;

  const fairwayStart = par3 ? 0.9 : 0.35;
  const segment = (from: number, to: number, offset: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = from + ((to - from) * i) / 8;
      const p = at(t);
      const n = normal(t);
      pts.push(`${(p.x + n.x * offset).toFixed(1)},${(p.y + n.y * offset).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const fairwayPts = (() => {
    const left: string[] = [];
    const right: string[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = fairwayStart + ((0.93 - fairwayStart) * i) / 16;
      const p = at(t);
      const n = normal(t);
      const w = 24;
      left.push(`${(p.x - n.x * w).toFixed(1)},${(p.y - n.y * w).toFixed(1)}`);
      right.unshift(`${(p.x + n.x * w).toFixed(1)},${(p.y + n.y * w).toFixed(1)}`);
    }
    return [...left, ...right].join(" ");
  })();

  const hazardColor = (h: Hazard) =>
    h.kind === "Eau" || h.kind === "Fossé"
      ? "fill-water stroke-water"
      : h.kind === "Bunker"
        ? "fill-sand stroke-sand"
        : h.kind === "Arbres" || h.kind === "Rough épais"
          ? "fill-trees stroke-trees"
          : "fill-none stroke-ink";

  const markers = [100, 150, 200].filter((m) => m < hole.length - 20);
  const player = at(tOf(progress));

  return (
    <div className="relative overflow-hidden rounded-2xl bg-rough ring-1 ring-ink/10">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-[300px] w-full" role="img"
        aria-label={`Schéma du trou ${hole.number}`}>
        {/* fairway */}
        <polygon points={fairwayPts} className="fill-fairway" strokeLinejoin="round" />
        {/* ligne de jeu */}
        <polyline points={segment(0, 1, 0)} className="fill-none stroke-paper" strokeWidth={1}
          strokeDasharray="3 4" opacity={0.9} />

        {/* obstacles */}
        {hole.hazards.map((h) => {
          const t1 = tOf(h.from);
          const t2 = Math.max(t1 + 0.02, tOf(h.to));
          const cls = hazardColor(h);
          const dashed = h.kind === "Hors-limites";
          if (h.side === "Gauche" || h.side === "Droite") {
            const off = (h.side === "Gauche" ? -1 : 1) * 33;
            return (
              <polyline key={h.id} points={segment(t1, t2, off)} className={`fill-none ${cls.split(" ")[1]}`}
                strokeWidth={dashed ? 2 : 9} strokeLinecap="round" strokeDasharray={dashed ? "4 3" : undefined} />
            );
          }
          if (h.side === "Devant le green") {
            const p = at(Math.min(0.97, (t1 + t2) / 2));
            return <ellipse key={h.id} cx={p.x} cy={p.y + 4} rx={14} ry={5} className={cls} />;
          }
          return null;
        })}
        {hole.hazards
          .filter((h) => h.side === "En travers")
          .map((h) => {
            const t = (tOf(h.from) + tOf(h.to)) / 2;
            const p = at(t);
            const n = normal(t);
            const cls = hazardColor(h).split(" ")[1];
            return (
              <line key={`x-${h.id}`} x1={p.x - n.x * 30} y1={p.y - n.y * 30} x2={p.x + n.x * 30}
                y2={p.y + n.y * 30} className={cls} strokeWidth={Math.max(4, (tOf(h.to) - tOf(h.from)) * H)}
                strokeLinecap="round" opacity={0.9} />
            );
          })}

        {/* repères de distance au green */}
        {markers.map((m) => {
          const t = tOf(hole.length - m);
          const p = at(t);
          const n = normal(t);
          return (
            <g key={m}>
              <line x1={p.x - n.x * 24} y1={p.y - n.y * 24} x2={p.x + n.x * 24} y2={p.y + n.y * 24}
                className="stroke-paper" strokeWidth={1} />
              <text x={p.x + n.x * 42} y={p.y + n.y * 42 + 3} textAnchor="middle"
                className="fill-ink font-mono" fontSize={8}>{m}</text>
            </g>
          );
        })}

        {/* green + drapeau */}
        <circle cx={green.x} cy={green.y} r={15} className="fill-fairway stroke-paper" strokeWidth={1.5} />
        <line x1={green.x} y1={green.y} x2={green.x} y2={green.y - 18} className="stroke-ink" strokeWidth={1.2} />
        <path d={`M${green.x} ${green.y - 18} l9 3 l-9 3z`} className="fill-accent" />

        {/* départ */}
        <rect x={tee.x - 8} y={tee.y - 4} width={16} height={8} rx={2} className="fill-ink" />

        {/* joueur */}
        {progress > 2 && (
          <g>
            <circle cx={player.x} cy={player.y} r={7} className="fill-accent" opacity={0.3} />
            <circle cx={player.x} cy={player.y} r={4} className="fill-accent stroke-paper" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5 font-mono text-[9px] tracking-[0.1em] text-ink uppercase">
        <span className="flex items-center gap-1 rounded-full bg-paper/90 px-1.5 py-0.5"><i className="size-2 rounded-full bg-water" />Eau</span>
        <span className="flex items-center gap-1 rounded-full bg-paper/90 px-1.5 py-0.5"><i className="size-2 rounded-full bg-sand ring-1 ring-ink/20" />Bunker</span>
        <span className="flex items-center gap-1 rounded-full bg-paper/90 px-1.5 py-0.5"><i className="size-2 rounded-full bg-trees" />Arbres</span>
      </div>
      {hole.shape && (
        <div className="absolute top-2 left-2 rounded-full bg-ink px-2.5 py-1 font-mono text-[10px] tracking-[0.15em] text-paper uppercase">
          {hole.shape}
        </div>
      )}
    </div>
  );
}
