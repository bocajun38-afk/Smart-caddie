export type Position = { lat: number; lng: number };

export type GeoStatus = "idle" | "locating" | "ready" | "weak" | "denied" | "unavailable";

type RoundState = {
  position: Position | null;
  /** précision GPS en mètres */
  accuracy: number | null;
  geoStatus: GeoStatus;
  /** incrémenté pour relancer la demande d'autorisation GPS */
  geoAttempt: number;
  courseId: string | null;
  holeNumber: number | null;
  /** distance jouée depuis le départ, en mètres (simulée si pas de GPS précis) */
  shotProgress: number;
};

let state: RoundState = {
  position: null,
  accuracy: null,
  geoStatus: "idle",
  geoAttempt: 0,
  courseId: null,
  holeNumber: null,
  shotProgress: 0,
};

const listeners = new Set<() => void>();

export function subscribeRound(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRoundState() {
  return state;
}

export function setRoundState(patch: Partial<RoundState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Relance la demande d'autorisation et le suivi GPS. */
export function retryGps() {
  setRoundState({ geoStatus: "idle", geoAttempt: state.geoAttempt + 1 });
}

const serverSnapshot: RoundState = { ...state };
export function getRoundServerSnapshot() {
  return serverSnapshot;
}
