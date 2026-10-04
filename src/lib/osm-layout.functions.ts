import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Tracé réel d'un parcours depuis OpenStreetMap (Overpass) : trous (golf=hole),
 * greens, bunkers et obstacles d'eau. Les distances sont mesurées sur la carte.
 */

type Pt = { lat: number; lng: number };
export type OsmHazard = {
  kind: "Eau" | "Bunker";
  side: "Gauche" | "Droite" | "En travers" | "Devant le green";
  from: number;
  to: number;
};
export type OsmHole = {
  number: number;
  par: number;
  parEstimated: boolean;
  strokeIndex: number | null;
  length: number;
  elevation: number;
  tee: Pt;
  green: Pt;
  greenOutline?: Pt[] | undefined;
  hazards: OsmHazard[];
  line: Pt[];
};

type El = {
  type: "way" | "node" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function overpass(query: string): Promise<El[]> {
  let lastErr: unknown = null;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "SmartCaddie/1.0 (golf caddie app)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(25_000),
      });
      const text = await res.text();
      if (!res.ok || !text.trim().startsWith("{")) {
        lastErr = new Error(`overpass_${res.status}`);
        continue;
      }
      return ((JSON.parse(text) as { elements?: El[] }).elements ?? []);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("overpass_failed");
}

const R = 6_371_000;
function dist(a: Pt, b: Pt) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function centroid(pts: Pt[]): Pt {
  const n = pts.length || 1;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / n, lng: pts.reduce((s, p) => s + p.lng, 0) / n };
}
const geo = (e: El): Pt[] => (e.geometry ?? []).map((g) => ({ lat: g.lat, lng: g.lon }));

/** Projette p sur la ligne du trou : distance le long du trou + décalage latéral signé (+ = gauche). */
function project(line: Pt[], p: Pt) {
  const o = line[0]!;
  const kx = (Math.PI / 180) * R * Math.cos((o.lat * Math.PI) / 180);
  const ky = (Math.PI / 180) * R;
  const xy = (q: Pt) => ({ x: (q.lng - o.lng) * kx, y: (q.lat - o.lat) * ky });
  const P = xy(p);
  let best = { along: 0, offset: Number.POSITIVE_INFINITY };
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const A = xy(line[i]!);
    const B = xy(line[i + 1]!);
    const dx = B.x - A.x, dy = B.y - A.y;
    const L = Math.hypot(dx, dy) || 1;
    const t = Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / (L * L)));
    const cx = A.x + t * dx, cy = A.y + t * dy;
    const d = Math.hypot(P.x - cx, P.y - cy);
    if (d < Math.abs(best.offset)) {
      const cross = dx * (P.y - A.y) - dy * (P.x - A.x);
      best = { along: acc + t * L, offset: cross >= 0 ? d : -d };
    }
    acc += L;
  }
  return best;
}

// La ligne OSM relie le centre du départ au centre du green : elle mesure
// souvent 5 à 10 % de moins que la carte de score (départs reculés, doglegs).
// Seuils abaissés en conséquence pour ne pas classer des par 5 en par 4.
function estimatePar(length: number) {
  if (length <= 215) return 3;
  if (length <= 395) return 4;
  return 5;
}

async function elevations(points: Pt[]): Promise<Array<number | null>> {
  if (points.length === 0) return [];
  try {
    const lat = points.map((p) => p.lat.toFixed(6)).join(",");
    const lng = points.map((p) => p.lng.toFixed(6)).join(",");
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return points.map(() => null);
    const json = (await res.json()) as { elevation?: number[] };
    return points.map((_, i) => (typeof json.elevation?.[i] === "number" ? json.elevation[i]! : null));
  } catch {
    return points.map(() => null);
  }
}

export const getOsmLayout = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(d),
  )
  .handler(async ({ data }) => {
    const center = { lat: data.lat, lng: data.lng };
    const dLat = 0.0135; // ~1,5 km
    const dLng = 0.0135 / Math.max(0.2, Math.cos((data.lat * Math.PI) / 180));
    const bbox = `${data.lat - dLat},${data.lng - dLng},${data.lat + dLat},${data.lng + dLng}`;
    const query = `[out:json][timeout:25];(
      way["golf"="hole"](${bbox});
      way["golf"="green"](${bbox});
      way["golf"="bunker"](${bbox});
      way["golf"="water_hazard"](${bbox});
      way["golf"="lateral_water_hazard"](${bbox});
      way["natural"="water"](${bbox});
    );out geom tags;`;

    let els: El[];
    try {
      els = await overpass(query);
    } catch (e) {
      console.error("getOsmLayout", e);
      return { holes: [] as OsmHole[], error: "Le service de cartes OpenStreetMap ne répond pas, réessayez dans un instant." };
    }

    // Trous : un seul par numéro, le plus proche du centre du golf.
    const byNum = new Map<number, { line: Pt[]; tags: Record<string, string>; d: number }>();
    for (const e of els) {
      if (e.tags?.["golf"] !== "hole") continue;
      const num = parseInt(e.tags["ref"] ?? "", 10);
      const line = geo(e);
      if (!Number.isFinite(num) || num < 1 || num > 27 || line.length < 2) continue;
      const d = dist(center, centroid(line));
      const prev = byNum.get(num);
      if (!prev || d < prev.d) byNum.set(num, { line, tags: e.tags, d });
    }
    if (byNum.size === 0) {
      return { holes: [] as OsmHole[], error: "Le tracé des trous de ce golf n'est pas encore cartographié sur OpenStreetMap." };
    }

    const greens = els.filter((e) => e.tags?.["golf"] === "green" && (e.geometry?.length ?? 0) >= 3)
      .map((e) => ({ center: centroid(geo(e)), outline: geo(e) }));
    const hazardEls = els
      .filter((e) => e.tags?.["golf"] !== "hole" && e.tags?.["golf"] !== "green" && (e.geometry?.length ?? 0) > 2)
      .map((e) => ({ kind: (e.tags?.["golf"] === "bunker" ? "Bunker" : "Eau") as OsmHazard["kind"], pts: geo(e) }));

    const holes = [...byNum.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, { line, tags }]) => {
        let length = 0;
        for (let i = 0; i < line.length - 1; i++) length += dist(line[i]!, line[i + 1]!);
        length = Math.round(length);
        const end = line[line.length - 1]!;
        const nearGreen = greens
          .map((g) => ({ g, d: dist(g.center, end) }))
          .sort((a, b) => a.d - b.d)[0];
        const matchedGreen = nearGreen && nearGreen.d < 45 ? nearGreen.g : null;
        const green = matchedGreen?.center ?? end;
        const parTag = parseInt(tags["par"] ?? "", 10);
        const hcp = parseInt(tags["handicap"] ?? "", 10);
        return {
          number,
          par: Number.isFinite(parTag) ? parTag : estimatePar(length),
          parEstimated: !Number.isFinite(parTag),
          strokeIndex: Number.isFinite(hcp) ? hcp : null,
          length,
          elevation: 0,
          tee: line[0]!,
          green: { lat: green.lat, lng: green.lng },
          greenOutline: matchedGreen?.outline,
          hazards: [] as OsmHazard[],
          line,
        };
      });

    // Rattache chaque obstacle au trou dont il est le plus proche.
    for (const hz of hazardEls) {
      let best: { hole: (typeof holes)[number]; proj: ReturnType<typeof project>[] ; off: number } | null = null;
      for (const hole of holes) {
        const projs = hz.pts.map((p) => project(hole.line, p));
        const off = Math.min(...projs.map((p) => Math.abs(p.offset)));
        if (!best || off < best.off) best = { hole, proj: projs, off };
      }
      if (!best) continue;
      const limit = hz.kind === "Bunker" ? 35 : 50;
      if (best.off > limit) continue;
      const along = best.proj.map((p) => p.along);
      const from = Math.round(Math.min(...along));
      const to = Math.round(Math.max(...along));
      // Ignore ce qui est derrière le green ou collé au départ.
      if (to < 30 || from >= best.hole.length - 2) continue;
      const offs = best.proj.map((p) => p.offset);
      const mid = (from + to) / 2;
      const side: OsmHazard["side"] =
        mid > best.hole.length - 40
          ? "Devant le green"
          : Math.min(...offs) < -8 && Math.max(...offs) > 8
            ? "En travers"
            : offs.reduce((s, o) => s + o, 0) > 0
              ? "Gauche"
              : "Droite";
      best.hole.hazards.push({ kind: hz.kind, side, from: Math.max(0, from), to: Math.max(from, to) });
    }

    // Dénivelé réel départ → green.
    const elev = await elevations(holes.flatMap((h) => [h.tee, h.green]));
    holes.forEach((h, i) => {
      const a = elev[i * 2], b = elev[i * 2 + 1];
      if (a != null && b != null) h.elevation = Math.round(b - a);
      h.hazards.sort((x, y) => x.from - y.from);
    });

    const result: OsmHole[] = holes;
    return { holes: result, error: null as string | null };
  });
