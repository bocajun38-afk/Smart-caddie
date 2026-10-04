import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  DEMO_COURSE,
  analyzeHazards,
  applyTee,
  bearingDeg,
  computePlaysLike,
  distanceMeters,
  greenDistances,
  hazardLabel,
  nearestCourse,
  nearestHole,
  recommendClub,
  type Course,
  type Hole,
} from "@/lib/golf-data";
import { coursesStore, profileStore, settingsStore } from "@/lib/player-store";
import {
  getRoundServerSnapshot,
  getRoundState,
  setRoundState,
  subscribeRound,
} from "@/lib/round-store";
import { airDensityFactor, fetchWeather, type Weather } from "@/lib/weather";
import { getShotElevation } from "@/lib/elevation.functions";
import { getOsmLayout } from "@/lib/osm-layout.functions";

export function useCourses(): Course[] {
  const { items } = coursesStore.useStore();
  return [...Object.values(items), DEMO_COURSE];
}

export function useRound() {
  const state = useSyncExternalStore(subscribeRound, getRoundState, getRoundServerSnapshot);
  const courses = useCourses();
  const { clubs } = profileStore.useStore();
  const { tee } = settingsStore.useStore();

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setRoundState({ geoStatus: "unavailable" });
      return;
    }
    if (getRoundState().geoStatus === "idle") setRoundState({ geoStatus: "locating" });
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const accuracy = Math.round(pos.coords.accuracy);
        const all = [...Object.values(coursesStore.get().items), DEMO_COURSE];
        const course = nearestCourse(all, position);
        const current = getRoundState();
        setRoundState({
          position,
          accuracy,
          geoStatus: accuracy <= 30 ? "ready" : "weak",
          courseId: current.courseId ?? course?.id ?? null,
          holeNumber:
            current.holeNumber ?? (course?.hasGeo ? nearestHole(course, position).number : null),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setRoundState({ geoStatus: "denied" });
        else if (!getRoundState().position) setRoundState({ geoStatus: "locating" });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [state.geoAttempt]);

  const course: Course =
    courses.find((c) => c.id === state.courseId) ?? courses[0] ?? DEMO_COURSE;
  const baseHole: Hole =
    course.holes.find((h) => h.number === state.holeNumber) ?? course.holes[0]!;
  const hole = applyTee(baseHole, tee);

  const hasLiveFix = (state.geoStatus === "ready" || state.geoStatus === "weak") && state.position;
  const gpsRemaining =
    (course.hasGeo || hole.greenSet) && hasLiveFix && state.position
      ? Math.round(distanceMeters(state.position, hole.green))
      : null;
  const gpsActive = gpsRemaining !== null && (hole.greenSet || gpsRemaining <= hole.length + 120);
  const layoutFn = useServerFn(getOsmLayout);
  const greenLayout = useQuery({
    queryKey: ["green-outline-layout", course.id, course.lat, course.lng],
    queryFn: () => layoutFn({ data: { lat: course.lat, lng: course.lng } }),
    enabled: course.source !== "demo" && course.hasGeo && !hole.greenOutline?.length,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const mappedOutline = greenLayout.data?.holes.find((h) => h.number === hole.number)?.greenOutline;
  // A manually adjusted center invalidates the old mapped boundary.
  const outline = mappedOutline && !hole.greenOutline?.length && distanceMeters(hole.green, greenLayout.data?.holes.find((h) => h.number === hole.number)?.green ?? hole.green) < 3
    ? mappedOutline : hole.greenOutline;
  const greenRange = gpsActive && state.position
    ? greenDistances(state.position, { ...hole, greenOutline: outline }) : null;

  const shotElevationFn = useServerFn(getShotElevation);
  const liveElevation = useQuery({
    queryKey: ["shot-elevation", Math.round((state.position?.lat ?? 0) * 10000), Math.round((state.position?.lng ?? 0) * 10000), hole.green.lat, hole.green.lng],
    queryFn: () => shotElevationFn({ data: { position: state.position ?? hole.tee, green: hole.green } }),
    enabled: gpsActive && state.position !== null,
    staleTime: 60_000,
    retry: false,
  });

  const remaining = Math.max(
    0,
    gpsActive && gpsRemaining !== null ? gpsRemaining : hole.length - state.shotProgress,
  );
  const progress = Math.max(0, hole.length - remaining);

  const weather = useQuery<Weather>({
    queryKey: ["weather", Math.round(course.lat * 100), Math.round(course.lng * 100)],
    queryFn: () => fetchWeather(course.lat, course.lng),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const w = weather.data;
  const density = w ? airDensityFactor(w) : 1;
  const shotStart = gpsActive && state.position ? state.position : hole.tee;
  const bearing = distanceMeters(shotStart, hole.green) > 30 ? bearingDeg(shotStart, hole.green) : null;
  const wind = w ? { speed: w.windSpeed, direction: w.windDirection } : null;
  const slopeKnown = gpsActive ? liveElevation.data != null : hole.elevation !== 0;
  const shotElevation = gpsActive ? liveElevation.data ?? 0 : hole.elevation;
  const playsLike = computePlaysLike(remaining, shotElevation, density, wind, bearing);
  const teeBearing = distanceMeters(hole.tee, hole.green) > 30 ? bearingDeg(hole.tee, hole.green) : null;
  const holePlaysLike = computePlaysLike(hole.length, hole.elevation, density, wind, teeBearing);
  const playingDistance = playsLike.total;
  const factor = remaining > 0 ? playingDistance / remaining : 1;
  const club = recommendClub(playingDistance, clubs, progress < 5);
  const hazards = analyzeHazards(hole, progress, clubs, factor);
  const teeFactor = hole.length > 0 ? holePlaysLike.total / hole.length : 1;
  const teeHazards = analyzeHazards(hole, 0, clubs, teeFactor);

  const setHole = useCallback(
    (number: number) => setRoundState({ holeNumber: number, shotProgress: 0 }),
    [],
  );
  const setCourse = useCallback(
    (id: string) => setRoundState({ courseId: id, holeNumber: 1, shotProgress: 0 }),
    [],
  );
  const advanceShot = useCallback(() => {
    const current = getRoundState();
    const chosen = clubs.find((c) => c.name === club);
    const step = chosen ? chosen.carry : 150;
    setRoundState({ shotProgress: Math.min(hole.length, current.shotProgress + step) });
  }, [clubs, club, hole.length]);

  return {
    ...state,
    course,
    hole,
    remaining,
    gpsActive,
    greenRange,
    progress,
    tee,
    playsLike,
    slopeKnown,
    shotElevation: slopeKnown ? shotElevation : null,
    holePlaysLike,
    teeHazards,
    playingDistance,
    club,
    clubs,
    hazards,
    weather: w ?? null,
    weatherLoading: weather.isLoading,
    setHole,
    setCourse,
    advanceShot,
  };
}

export function buildContext(r: ReturnType<typeof useRound>): string {
  const c = r.course;
  return [
    `Parcours : ${c.name} (${c.city}, ${c.country})${c.altitude != null ? `, altitude ${c.altitude} m` : ""}${c.slope ? `, slope ${c.slope}` : ""}${c.rating ? `, rating ${c.rating}` : ""}`,
    `Trou ${r.hole.number} — par ${r.hole.par}, stroke index ${r.hole.strokeIndex}, ${r.hole.length} m`,
    `Configuration : ${r.hole.shape || "non précisée"}. ${r.hole.notes}`,
    `Obstacles (distances depuis le départ) : ${r.hole.hazards.map(hazardLabel).join(", ") || "aucun déclaré"}`,
    r.hole.par === 3
      ? "TYPE DE TROU : PAR 3 — aucun lay-up ; options = centre du green (sécurité) ou attaque du drapeau."
      : `TYPE DE TROU : PAR ${r.hole.par} — options attaque / coup direct ou sécurité / lay-up si obstacle majeur.`,
    (() => {
      const near = r.hole.hazards.filter((h) => h.to >= r.hole.length - 40);
      return near.length
        ? `Obstacles cartographiés autour du green (moins de 40 m) : ${near.map(hazardLabel).join(" ; ")}.`
        : "Aucun obstacle cartographié autour du green.";
    })(),
    `Dénivelé départ-green enregistré : ${r.hole.elevation} m${r.gpsActive ? " (ne pas utiliser pour estimer la pente du coup actuel)" : ""}`,
    `Dénivelé position actuelle-green : ${r.shotElevation == null ? "inconnu, ne pas présumer terrain plat" : `${r.shotElevation} m`}`,
    `Distance restante jusqu'au green : ${r.remaining} m (distance de jeu corrigée : ${r.playingDistance} m)`,
    r.greenRange
      ? `Green, distances brutes depuis ${r.gpsActive ? "le GPS du joueur" : "le tee cartographié"} : entrée ${r.greenRange.front} m, milieu ${r.greenRange.center} m, fond ${r.greenRange.back} m. Pour choisir un club, compare le carry nécessaire à l'entrée et au fond ; la distance corrigée actuelle se rapporte au milieu du green.`
      : "Seul le milieu du green est connu : contour non cartographié ou position de coup non fiable. Ne donne aucun chiffre pour l'entrée ou le fond.",
    r.hazards.length
      ? `Analyse des obstacles devant le joueur : ${r.hazards.map((h) => `${h.hazard.kind} ${h.hazard.side.toLowerCase()} à ${h.toFront} m, carry ${h.carry} m → ${h.verdict} (${h.advice})`).join(" ; ")}`
      : "Plus d'obstacle déclaré devant le joueur.",
    r.weather
      ? `Météo : ${r.weather.temperature} °C, humidité ${r.weather.humidity} %, pression ${r.weather.pressure} hPa, vent ${r.weather.windSpeed} km/h ${r.weather.windLabel} (rafales ${r.weather.windGusts} km/h)${r.weather.avgWind != null ? `, vent moyen du lieu ${r.weather.avgWind} km/h ${r.weather.avgWindLabel}` : ""}`
      : "Météo : indisponible",
    `Distances de vol du joueur : ${r.clubs.filter((x) => x.enabled).map((x) => `${x.name} ${x.carry} m`).join(", ")}`,
    `Club calculé par l'application : ${r.club}`,
    `Repères de départ : ${r.tee}`,
    `Distance corrigée (plays-like) : ${r.playsLike.total} m = brut ${r.playsLike.raw} m, dénivelé ${r.slopeKnown ? `${r.playsLike.slope} m` : "inconnu, exclu du calcul"}, air/altitude ${r.playsLike.air} m, vent ${r.playsLike.wind} m${r.slopeKnown ? "" : ". Ne pas présenter la distance corrigée comme exacte"}`,
  ].join("\n");
}

/** Contexte « sur le tee » : avant le premier coup, quelle que soit la position actuelle. */
export function buildTeeContext(r: ReturnType<typeof useRound>): string {
  const p = r.holePlaysLike;
  const driver = r.clubs.find((club) => club.enabled && club.name === "Driver");
  const driverCarry = driver?.carry ?? 0;
  const driverZone = driverCarry > 0 ? `${Math.max(0, driverCarry - 20)} à ${driverCarry + 20} m` : "non renseignée";
  const hazardsInDriverZone = driverCarry > 0
    ? r.hole.hazards.filter((hazard) => hazard.to >= driverCarry - 20 && hazard.from <= driverCarry + 20)
    : [];
  return [
    buildContext(r),
    "",
    "SITUATION : le joueur est sur le tee de départ, avant de jouer son premier coup. Ignore la distance restante ci-dessus.",
    `Longueur depuis les repères ${r.tee} : ${r.hole.length} m, joue comme ${p.total} m (dénivelé ${p.slope} m, air ${p.air} m, vent ${p.wind} m).`,
    r.teeHazards.length
      ? `Obstacles vus du tee : ${r.teeHazards.map((h) => `${h.hazard.kind} ${h.hazard.side.toLowerCase()} à ${h.toFront} m, carry ${h.carry} m → ${h.verdict}`).join(" ; ")}`
      : "Aucun obstacle déclaré.",
    `Driver du joueur : carry ${driverCarry || "non renseigné"} m ; zone de retombée indicative ${driverZone}.`,
    hazardsInDriverZone.length
      ? `Obstacles croisant la zone de retombée du Driver : ${hazardsInDriverZone.map(hazardLabel).join(" ; ")}. Évalue leur côté et la possibilité de les franchir avant d'écarter le Driver.`
      : "Aucun obstacle déclaré dans la zone de retombée indicative du Driver : ne recommande pas un lay-up par prudence abstraite.",
    r.hole.par === 3
      ? "Conseil de départ PAR 3 en 2 ou 3 phrases Flash Argumenté : danger cartographié pertinent s'il existe, Plays-like, puis Option A centre du green et Option B autre zone du green ou drapeau si sa position est connue, avec club et raison courte. Jamais de lay-up. N'évoque pas les données absentes."
      : "Conseil de départ PAR 4/5 en 2 ou 3 phrases Flash Argumenté : zone de mise en jeu et danger majeur pertinent s'il existe, longueur corrigée depuis le tee, puis Option A attaque et Option B sécurité avec club et zone visée. Lay-up seulement si danger réellement en jeu. N'évoque pas les données absentes ni de météo superflue.",
  ].join("\n");
}
