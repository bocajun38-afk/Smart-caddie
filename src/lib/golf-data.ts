export type LatLng = { lat: number; lng: number };

export const HAZARD_KINDS = ["Eau", "Bunker", "Hors-limites", "Fossé", "Arbres", "Rough épais"] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];
export const HAZARD_SIDES = ["Gauche", "Droite", "En travers", "Devant le green"] as const;
export type HazardSide = (typeof HAZARD_SIDES)[number];

export type Hazard = {
  id: string;
  kind: HazardKind;
  side: HazardSide;
  /** début de l'obstacle, en mètres depuis le départ */
  from: number;
  /** fin de l'obstacle, en mètres depuis le départ */
  to: number;
};

export type Hole = {
  number: number;
  par: number;
  strokeIndex: number;
  /** longueur totale du trou en mètres */
  length: number;
  shape: string;
  hazards: Hazard[];
  green: LatLng;
  tee: LatLng;
  /** Contour cartographié du green, uniquement quand la géométrie est disponible. */
  greenOutline?: LatLng[] | undefined;
  /** Ligne du trou relevée sur la carte, si disponible. */
  line?: LatLng[];
  /** vrai quand les coordonnées du green ont été relevées/saisies par le joueur */
  greenSet?: boolean;
  /** dénivelé du départ au green, en mètres */
  elevation: number;
  notes: string;
};

export type Course = {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  /** altitude du parcours en mètres */
  altitude: number | null;
  slope: number | null;
  rating: number | null;
  teeName: string | null;
  /** true si les coordonnées GPS des trous sont fiables */
  hasGeo: boolean;
  source: "demo" | "api" | "manual" | "osm";
  holes: Hole[];
};

let hazardSeq = 0;
export function hazardId() {
  hazardSeq += 1;
  return `hz-${Date.now().toString(36)}-${hazardSeq}`;
}

export function hazardLabel(h: Hazard): string {
  return `${h.kind} ${h.side.toLowerCase()} (${h.from}–${h.to} m)`;
}

type Spec = Omit<Hole, "green" | "tee" | "number" | "hazards"> & {
  hazards: Array<Omit<Hazard, "id">>;
};

function buildHoles(baseLat: number, baseLng: number, spec: Spec[]): Hole[] {
  return spec.map((h, i) => ({
    ...h,
    hazards: h.hazards.map((z, j) => ({ ...z, id: `demo-${i}-${j}` })),
    number: i + 1,
    tee: { lat: baseLat + i * 0.0032, lng: baseLng + i * 0.0021 },
    green: {
      lat: baseLat + i * 0.0032 + h.length / 111_000,
      lng: baseLng + i * 0.0021 + 0.0006,
    },
  }));
}

const demoSpec: Spec[] = [
  { par: 4, strokeIndex: 7, length: 368, shape: "Droit, fairway large", elevation: 2,
    hazards: [{ kind: "Bunker", side: "Droite", from: 225, to: 245 }, { kind: "Bunker", side: "Devant le green", from: 345, to: 358 }],
    notes: "Green en deux plateaux, drapeau souvent au fond." },
  { par: 3, strokeIndex: 15, length: 162, shape: "Par 3 en surplomb", elevation: -8,
    hazards: [{ kind: "Fossé", side: "En travers", from: 120, to: 145 }],
    notes: "Le vent tourbillonne entre les pins." },
  { par: 5, strokeIndex: 3, length: 487, shape: "Dogleg gauche", elevation: 4,
    hazards: [{ kind: "Eau", side: "Gauche", from: 210, to: 290 }, { kind: "Bunker", side: "Devant le green", from: 460, to: 472 }],
    notes: "Atteignable en deux avec un vent portant." },
  { par: 4, strokeIndex: 11, length: 340, shape: "Court, drivable", elevation: 1,
    hazards: [{ kind: "Bunker", side: "Devant le green", from: 318, to: 328 }],
    notes: "Green très rapide." },
  { par: 4, strokeIndex: 5, length: 402, shape: "Fairway en pente droite-gauche", elevation: 6,
    hazards: [{ kind: "Fossé", side: "En travers", from: 180, to: 190 }, { kind: "Arbres", side: "Gauche", from: 200, to: 320 }],
    notes: "L'approche se joue toujours un club de plus." },
  { par: 3, strokeIndex: 17, length: 138, shape: "Par 3 court protégé", elevation: -3,
    hazards: [{ kind: "Bunker", side: "Gauche", from: 120, to: 135 }, { kind: "Bunker", side: "Droite", from: 118, to: 132 }],
    notes: "Green réceptif, visez le drapeau." },
  { par: 4, strokeIndex: 1, length: 412, shape: "Dogleg droit", elevation: 4,
    hazards: [{ kind: "Eau", side: "Gauche", from: 200, to: 280 }, { kind: "Bunker", side: "Droite", from: 235, to: 255 }, { kind: "Bunker", side: "Devant le green", from: 388, to: 400 }],
    notes: "Le trou le plus difficile du parcours, départ prudent conseillé." },
  { par: 5, strokeIndex: 9, length: 502, shape: "Long par 5 montant", elevation: 12,
    hazards: [{ kind: "Eau", side: "En travers", from: 380, to: 400 }],
    notes: "Layup naturel à 100 m de la rivière." },
  { par: 4, strokeIndex: 13, length: 355, shape: "Retour au clubhouse", elevation: -2,
    hazards: [{ kind: "Bunker", side: "Devant le green", from: 332, to: 345 }],
    notes: "Green large mais peu profond." },
];

export const DEMO_COURSE: Course = {
  id: "demo-valmont",
  name: "Golf du Château de Valmont (démo)",
  city: "Chantilly",
  country: "France",
  lat: 49.1938,
  lng: 2.4681,
  altitude: 60,
  slope: 128,
  rating: 71.2,
  teeName: "Blancs",
  hasGeo: true,
  source: "demo",
  holes: buildHoles(49.1938, 2.4681, demoSpec),
};

/** Construit des trous vierges pour un parcours sans données détaillées. */
export function blankHoles(lat: number, lng: number, specs: Array<{ par: number; strokeIndex: number; length: number }>): Hole[] {
  return specs.map((s, i) => ({
    number: i + 1,
    par: s.par,
    strokeIndex: s.strokeIndex,
    length: s.length,
    shape: "",
    hazards: [],
    elevation: 0,
    notes: "",
    tee: { lat, lng },
    green: { lat, lng },
  }));
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Intersection de l'axe joueur → centre avec le contour réel du green. Aucune largeur n'est supposée. */
export function greenDistances(position: LatLng, hole: Hole): { front: number; center: number; back: number } | null {
  const polygon = hole.greenOutline;
  if (!polygon || polygon.length < 3) return null;
  const latitude = ((position.lat + hole.green.lat) / 2) * Math.PI / 180;
  const scaleX = 111_195 * Math.cos(latitude);
  const scaleY = 111_195;
  const toXY = (p: LatLng) => ({ x: (p.lng - position.lng) * scaleX, y: (p.lat - position.lat) * scaleY });
  const center = toXY(hole.green);
  const radius = Math.hypot(center.x, center.y);
  if (radius < 2) return null; // Sur le green, la précision GPS ne suffit pas à définir un axe fiable.
  const ux = center.x / radius, uy = center.y / radius;
  const intersections: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = toXY(polygon[i]!);
    const b = toXY(polygon[(i + 1) % polygon.length]!);
    const dx = b.x - a.x, dy = b.y - a.y;
    const divisor = ux * dy - uy * dx;
    if (Math.abs(divisor) < 1e-9) continue;
    const t = (a.x * dy - a.y * dx) / divisor;
    const segment = (a.x * uy - a.y * ux) / divisor;
    if (segment >= 0 && segment <= 1 && t >= 0) intersections.push(t);
  }
  const front = intersections.filter((d) => d <= radius).sort((a, b) => b - a)[0];
  const back = intersections.filter((d) => d >= radius).sort((a, b) => a - b)[0];
  if (front == null || back == null || back - front < 2) return null;
  return { front: Math.round(front), center: distanceMeters(position, hole.green), back: Math.round(back) };
}

export function nearestCourse(courses: Course[], pos: LatLng): Course | null {
  let best: Course | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of courses) {
    const d = distanceMeters(pos, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && bestD < 5_000 ? best : null;
}

export function nearestHole(course: Course, pos: LatLng): Hole {
  let best = course.holes[0]!;
  let bestD = Number.POSITIVE_INFINITY;
  for (const hole of course.holes) {
    const d = Math.min(distanceMeters(pos, hole.tee), distanceMeters(pos, hole.green));
    if (d < bestD) {
      bestD = d;
      best = hole;
    }
  }
  return best;
}

export type Club = { name: string; carry: number; enabled: boolean };

export const DEFAULT_CLUBS: Club[] = [
  { name: "Driver", carry: 220, enabled: true },
  { name: "Bois 3", carry: 200, enabled: true },
  { name: "Bois 5", carry: 185, enabled: false },
  { name: "Hybride", carry: 175, enabled: true },
  { name: "Fer 5", carry: 160, enabled: true },
  { name: "Fer 6", carry: 150, enabled: true },
  { name: "Fer 7", carry: 140, enabled: true },
  { name: "Fer 8", carry: 130, enabled: true },
  { name: "Fer 9", carry: 118, enabled: true },
  { name: "Pitching", carry: 105, enabled: true },
  { name: "Gap", carry: 90, enabled: false },
  { name: "Sand", carry: 75, enabled: true },
  { name: "Lob", carry: 55, enabled: false },
];

function bag(clubs: Club[], fromTee: boolean) {
  return clubs
    .filter((c) => c.enabled && c.carry > 0 && (fromTee || c.name !== "Driver"))
    .sort((a, b) => b.carry - a.carry);
}

export function recommendClub(playingDistance: number, clubs: Club[], fromTee = false): string {
  if (playingDistance <= 15) return "Putter";
  const list = bag(clubs, fromTee);
  if (list.length === 0) return "—";
  let best = list[list.length - 1]!;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const club of list) {
    const gap = Math.abs(club.carry - playingDistance);
    if (gap < bestGap) {
      bestGap = gap;
      best = club;
    }
  }
  return best.name;
}

export type HazardAnalysis = {
  hazard: Hazard;
  /** distance jusqu'à l'entrée de l'obstacle */
  toFront: number;
  /** carry nécessaire pour l'effacer */
  carry: number;
  verdict: "passer" | "lay-up" | "latéral" | "loin";
  advice: string;
};

/**
 * Croise les obstacles devant le joueur avec ses distances de clubs.
 * `factor` = facteur de distance de jeu (vent, densité de l'air) : distance réelle × factor.
 */
export function analyzeHazards(
  hole: Hole,
  progress: number,
  clubs: Club[],
  factor: number,
): HazardAnalysis[] {
  const fromTee = progress < 5;
  const list = bag(clubs, fromTee);
  const longest = list[0]?.carry ?? 0;
  return hole.hazards
    .filter((h) => h.to > progress)
    .sort((a, b) => a.from - b.from)
    .map((h) => {
      const toFront = Math.max(0, Math.round(h.from - progress));
      const carry = Math.max(0, Math.round(h.to - progress));
      const needed = carry * factor + 10; // marge de sécurité de 10 m
      const lateral = h.side === "Gauche" || h.side === "Droite";
      if (lateral) {
        const opposite = h.side === "Gauche" ? "droite" : "gauche";
        return {
          hazard: h,
          toFront,
          carry,
          verdict: "latéral" as const,
          advice: `${h.kind} à ${h.side.toLowerCase()} entre ${toFront} et ${carry} m : visez la moitié ${opposite}.`,
        };
      }
      if (toFront * factor > longest + 10) {
        return {
          hazard: h,
          toFront,
          carry,
          verdict: "loin" as const,
          advice: `${h.kind} à ${toFront} m : hors de portée sur ce coup, à surveiller pour le suivant.`,
        };
      }
      const over = [...list].reverse().find((c) => c.carry >= needed);
      if (over && over.carry <= longest) {
        return {
          hazard: h,
          toFront,
          carry,
          verdict: "passer" as const,
          advice: `Carry de ${carry} m pour effacer : ${over.name} passe en sécurité.`,
        };
      }
      const layup = list.find((c) => c.carry * 1 <= (toFront - 10) / factor);
      return {
        hazard: h,
        toFront,
        carry,
        verdict: "lay-up" as const,
        advice: layup
          ? `Carry de ${carry} m hors de portée : lay-up au ${layup.name} pour rester court.`
          : `Carry de ${carry} m hors de portée : jouez court, petit coup de placement.`,
      };
    });
}

/* ---------- Repères de départ ---------- */
export const TEE_BOXES = ["Blancs", "Jaunes", "Bleus", "Rouges"] as const;
export type TeeBox = (typeof TEE_BOXES)[number];
/** Longueur relative aux repères blancs (référence des données du parcours). */
export const TEE_FACTORS: Record<TeeBox, number> = { Blancs: 1, Jaunes: 0.94, Bleus: 0.88, Rouges: 0.82 };

/** Avance le départ selon les repères : obstacles conservés par rapport au green. */
export function applyTee(hole: Hole, tee: TeeBox): Hole {
  const shift = Math.round(hole.length * (1 - TEE_FACTORS[tee]));
  if (shift === 0) return hole;
  return {
    ...hole,
    // Les repères autres que blancs restent estimés : ne pas déplacer visuellement un départ cartographié.
    length: hole.length - shift,
    hazards: hole.hazards
      .map((h) => ({ ...h, from: Math.max(0, h.from - shift), to: h.to - shift }))
      .filter((h) => h.to > 0),
  };
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export type PlaysLike = { raw: number; slope: number; air: number; wind: number; total: number };

/**
 * Distance « joue comme » : dénivelé (1 m de montée ≈ 1 m de plus), densité de l'air
 * (altitude, chaleur, pression) et composante de vent de face/dos selon l'axe du trou.
 */
export function computePlaysLike(
  raw: number,
  elevation: number,
  density: number,
  wind: { speed: number; direction: number } | null,
  bearing: number | null,
): PlaysLike {
  // Règle empirique : ~1 m de dénivelé = 1 m de distance, pondéré selon la pente.
  // En descente la balle roule/vole un peu moins « gagnée » (×0,9) ; pente raide (>8 %) accentue l'effet.
  const grade = raw > 0 ? Math.abs(elevation) / raw : 0;
  const steep = grade > 0.08 ? 1 + Math.min(0.15, (grade - 0.08) * 1.5) : 1;
  const slope = Math.round(elevation * (elevation >= 0 ? 1 : 0.9) * steep);
  const air = Math.round(raw * (density - 1));
  let w = 0;
  if (wind && bearing != null) {
    // direction météo = d'où vient le vent ; vent de face si elle est alignée avec l'axe du coup
    const head = wind.speed * Math.cos(((wind.direction - bearing) * Math.PI) / 180);
    w = Math.round(raw * head * (head > 0 ? 0.006 : 0.003));
  }
  return { raw, slope, air, wind: w, total: Math.max(0, raw + slope + air + w) };
}
