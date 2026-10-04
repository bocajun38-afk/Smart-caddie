import { DEFAULT_CLUBS, type Club, type Course, type TeeBox } from "./golf-data";
import { createLocalStore } from "./local-store";

export const profileStore = createLocalStore<{ onboarded: boolean; clubs: Club[] }>(
  "caddie-profile",
  { onboarded: false, clubs: DEFAULT_CLUBS },
);

/** Parcours configurés par le joueur, indexés par id. */
export const coursesStore = createLocalStore<{ items: Record<string, Course> }>(
  "caddie-courses",
  { items: {} },
);

export type HoleScore = { strokes: number; putts: number };
/** Carte de score : courseId -> numéro de trou -> score */
export const scoreStore = createLocalStore<{ cards: Record<string, Record<string, HoleScore>> }>(
  "caddie-scores",
  { cards: {} },
);

export function saveCourse(course: Course) {
  coursesStore.set((s) => ({ items: { ...s.items, [course.id]: course } }));
}

/** Retire un parcours de la liste, avec sa carte de score en cours. */
export function removeCourse(id: string) {
  coursesStore.set((s) => {
    const items = { ...s.items };
    delete items[id];
    return { items };
  });
  clearCard(id);
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith(`caddie-tee:${id}:`)) window.localStorage.removeItem(k);
    }
  } catch {
    /* stockage indisponible */
  }
}

export function setHoleScore(courseId: string, hole: number, score: HoleScore) {
  scoreStore.set((s) => ({
    cards: { ...s.cards, [courseId]: { ...(s.cards[courseId] ?? {}), [hole]: score } },
  }));
}

export function clearCard(courseId: string) {
  scoreStore.set((s) => {
    const cards = { ...s.cards };
    delete cards[courseId];
    return { cards };
  });
}

/** Réglages de partie : repères de départ choisis. */
export const settingsStore = createLocalStore<{ tee: TeeBox }>("caddie-settings", { tee: "Blancs" });

export type SavedRound = {
  id: string;
  courseId: string;
  courseName: string;
  date: string;
  tee: TeeBox;
  holes: number;
  strokes: number;
  putts: number;
  par: number;
  card: Record<string, HoleScore>;
};
/** Parties enregistrées, la plus récente en premier. */
export const roundsStore = createLocalStore<{ rounds: SavedRound[] }>("caddie-rounds", { rounds: [] });

export function saveRound(r: Omit<SavedRound, "id" | "date">) {
  roundsStore.set((s) => ({
    rounds: [{ ...r, id: `r-${Date.now().toString(36)}`, date: new Date().toISOString() }, ...s.rounds].slice(0, 50),
  }));
}

export function deleteRound(id: string) {
  roundsStore.set((s) => ({ rounds: s.rounds.filter((r) => r.id !== id) }));
}
