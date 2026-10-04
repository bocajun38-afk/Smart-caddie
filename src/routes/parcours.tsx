import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { BottomNav } from "@/components/caddie/BottomNav";
import { PhoneShell, StatusBar } from "@/components/caddie/PhoneShell";
import { Stepper } from "@/components/caddie/Stepper";
import { useCourses, useRound } from "@/hooks/use-round";
import {
  getCourseDetail,
  searchCourses,
  type CourseDetail,
  type CourseSummary,
} from "@/lib/courses.functions";
import {
  HAZARD_KINDS,
  HAZARD_SIDES,
  blankHoles,
  distanceMeters,
  hazardId,
  type Course,
  type Hazard,
  type Hole,
} from "@/lib/golf-data";
import { getOsmLayout, type OsmHole } from "@/lib/osm-layout.functions";
import { removeCourse, saveCourse } from "@/lib/player-store";
import { retryGps } from "@/lib/round-store";
import { fetchElevation } from "@/lib/weather";

export const Route = createFileRoute("/parcours")({
  head: () => ({
    meta: [
      { title: "Smart Caddie — Configuration du parcours" },
      { name: "description", content: "Choisissez votre golf dans la base mondiale et réglez par, longueurs et obstacles de chaque trou." },
      { property: "og:title", content: "Smart Caddie — Configuration du parcours" },
      { property: "og:description", content: "Recherche mondiale de parcours et réglage trou par trou." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CoursePage,
});

/** Remplace les trous d'un parcours par le tracé réel relevé sur OpenStreetMap. */
function applyLayout(course: Course, layout: OsmHole[]): Course {
  const holes: Hole[] = layout.map((o, i) => {
    const prev = course.holes.find((h) => h.number === o.number);
    return {
      number: o.number,
      par: o.par,
      strokeIndex: o.strokeIndex ?? prev?.strokeIndex ?? i + 1,
      length: o.length,
      shape: prev?.shape ?? "",
      notes: prev?.notes ?? "",
      elevation: o.elevation,
      tee: o.tee,
      green: o.green,
      greenOutline: o.greenOutline,
      line: o.line,
      greenSet: true,
      hazards: o.hazards.map((z) => ({ ...z, id: hazardId() })),
    };
  });
  return { ...course, holes, hasGeo: true };
}

const label = "font-mono text-[10px] tracking-[0.15em] text-ink2 uppercase";

function CoursePage() {
  const round = useRound();
  const courses = useCourses();
  const search = useServerFn(searchCourses);
  const detail = useServerFn(getCourseDetail);
  const layoutFn = useServerFn(getOsmLayout);
  const [layoutMsg, setLayoutMsg] = useState<string | null>(null);

  async function fetchLayout(lat: number, lng: number) {
    return layoutFn({ data: { lat, lng } }).catch(() => ({
      holes: [] as OsmHole[],
      error: "Le service de cartes ne répond pas, réessayez.",
    }));
  }

  async function loadRealLayout() {
    const cur = round.course;
    if (!cur.lat && !cur.lng) return;
    setBusy(true);
    setLayoutMsg("Récupération du tracé réel…");
    const r = await fetchLayout(cur.lat, cur.lng);
    if (r.holes.length >= 9) {
      saveCourse(applyLayout(cur, r.holes));
      round.setHole(1);
      const est = r.holes.some((h) => h.parEstimated);
      setLayoutMsg(`${r.holes.length} trous chargés avec leurs vraies positions de départ et de green.${est ? " Par estimé d'après la longueur : vérifiez-le sur votre carte." : ""}`);
    } else {
      setLayoutMsg(r.error ?? "Tracé incomplet sur la carte : relevez les greens manuellement.");
    }
    setBusy(false);
  }

  const [q, setQ] = useState("");
  const [results, setResults] = useState<CourseSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<CourseDetail | null>(null);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setPicked(null);
    const r = await search({ data: { q } }).catch(() => ({ courses: [], error: "Recherche impossible." }));
    setResults(r.courses);
    setError(r.error ?? (r.courses.length ? null : "Aucun parcours trouvé."));
    setBusy(false);
  }

  async function pick(r: CourseSummary) {
    setBusy(true);
    setError(null);
    if (r.source === "osm") {
      // Parcours trouvé via OpenStreetMap : position réelle, trous à régler.
      const lat = r.lat ?? round.position?.lat ?? 0;
      const lng = r.lng ?? round.position?.lng ?? 0;
      const altitude = r.lat != null && r.lng != null ? await fetchElevation(r.lat, r.lng) : null;
      const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
      const len = (p: number) => (p === 3 ? 150 : p === 5 ? 470 : 360);
      let course: Course = {
        id: `osm-${Math.abs(r.id)}`,
        name: r.name,
        city: r.city,
        country: r.country,
        lat, lng, altitude, slope: null, rating: null,
        teeName: null, hasGeo: false, source: "manual",
        holes: blankHoles(lat, lng, pars.map((p, i) => ({ par: p, strokeIndex: i + 1, length: len(p) }))),
      };
      const layout = r.lat != null && r.lng != null ? await fetchLayout(r.lat, r.lng) : null;
      if (layout && layout.holes.length >= 9) {
        course = applyLayout(course, layout.holes);
        setLayoutMsg(`${layout.holes.length} trous chargés avec leurs vraies positions de départ et de green.${layout.holes.some((h) => h.parEstimated) ? " Par estimé d'après la longueur : vérifiez-le sur votre carte." : ""}`);
      } else {
        setLayoutMsg(layout?.error ?? "Tracé réel indisponible : trous standards à régler.");
      }
      saveCourse(course);
      round.setCourse(course.id);
      setResults([]);
      setQ("");
      setBusy(false);
      return;
    }
    const d = await detail({ data: { id: r.id } }).catch(() => ({ course: null, error: "Parcours indisponible." }));
    if (!d.course || d.course.tees.length === 0) setError(d.error ?? "Ce parcours n'a pas de données de trous.");
    else setPicked(d.course);
    setBusy(false);
  }

  async function chooseTee(teeIdx: number) {
    if (!picked) return;
    const tee = picked.tees[teeIdx]!;
    const lat = picked.lat ?? 0;
    const lng = picked.lng ?? 0;
    const altitude = picked.lat != null && picked.lng != null ? await fetchElevation(lat, lng) : null;
    const course: Course = {
      id: `api-${picked.id}`,
      name: picked.name,
      city: picked.city,
      country: picked.country,
      lat,
      lng,
      altitude,
      slope: tee.slope,
      rating: tee.rating,
      teeName: tee.name,
      hasGeo: false,
      source: "api",
      holes: blankHoles(lat, lng, tee.holes),
    };
    saveCourse(course);
    round.setCourse(course.id);
    setPicked(null);
    setResults([]);
    setQ("");
  }

  function createManual() {
    const pos = round.position;
    const lat = pos?.lat ?? 0;
    const lng = pos?.lng ?? 0;
    const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    const len = (p: number) => (p === 3 ? 150 : p === 5 ? 470 : 360);
    const course: Course = {
      id: `manual-${Date.now()}`,
      name: q.trim() || "Mon golf",
      city: "", country: "", lat, lng, altitude: null, slope: null, rating: null,
      teeName: null, hasGeo: false, source: "manual",
      holes: blankHoles(lat, lng, pars.map((p, i) => ({ par: p, strokeIndex: i + 1, length: len(p) }))),
    };
    saveCourse(course);
    round.setCourse(course.id);
    setError(null);
    setResults([]);
    setQ("");
  }

  const gpsText = {
    idle: "En attente de signal GPS…", locating: "En attente de signal GPS…",
    ready: `GPS actif ✓ précision ±${round.accuracy} m`,
    weak: `Signal GPS faible (±${round.accuracy} m) — placez-vous à découvert`,
    denied: "GPS refusé — autorisez la position précise pour ce site dans les réglages du téléphone, puis touchez « Activer le GPS ».",
    unavailable: "GPS indisponible sur cet appareil.",
  }[round.geoStatus];
  const gpsOk = round.geoStatus === "ready" || round.geoStatus === "weak";

  const c = round.course;

  return (
    <PhoneShell>
      <StatusBar />
      <div className="flex items-center justify-between px-5 pt-2">
        <h1 className="font-display text-4xl leading-none">Parcours</h1>
        <Link to="/bienvenue" className="rounded-full bg-card px-3 py-1.5 font-mono text-[10px] tracking-[0.15em] uppercase ring-1 ring-ink/10">
          Mes clubs
        </Link>
      </div>

      <form onSubmit={runSearch} className="mt-3 px-5">
        <div className="flex gap-2 rounded-2xl bg-card p-2 ring-1 ring-ink/15">
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={80}
            placeholder="Rechercher un golf dans le monde…"
            className="min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-ink2/60" />
          <button disabled={busy} className="rounded-xl bg-ink px-4 font-display text-paper disabled:opacity-40">
            {busy ? "…" : "OK"}
          </button>
        </div>
      </form>

      <div className="mx-5 mt-2 flex items-center gap-2">
        <span className={`size-2.5 shrink-0 rounded-full ${round.geoStatus === "ready" ? "bg-primary" : gpsOk ? "bg-accent" : "bg-destructive"}`} />
        <p className="flex-1 font-mono text-[11px] text-ink2">{gpsText}</p>
        {!gpsOk && round.geoStatus !== "unavailable" && (
          <button onClick={retryGps} className="rounded-full bg-ink px-3 py-1 font-mono text-[10px] tracking-[0.15em] text-paper uppercase">
            Activer le GPS
          </button>
        )}
      </div>

      {error && <p className="mx-5 mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
      {error && q.trim().length >= 2 && (
        <div className="mx-5 mt-2 rounded-2xl bg-card p-3 ring-1 ring-ink/10">
          <p className="text-[13px] text-ink2">Votre golf n'est pas dans la base mondiale ? Créez-le : 18 trous standards, à ajuster ensuite trou par trou ci-dessous.</p>
          <button onClick={createManual} className="mt-2 h-11 w-full rounded-xl bg-accent font-display text-accent-ink">
            Créer « {q.trim()} »
          </button>
        </div>
      )}

      {picked ? (
        <div className="mx-5 mt-3 rounded-2xl bg-card p-3 ring-1 ring-ink/10">
          <div className="font-display text-xl">{picked.name}</div>
          <div className={label}>Choisissez votre départ</div>
          <div className="mt-2 flex flex-col gap-1.5">
            {picked.tees.map((t, i) => (
              <button key={i} onClick={() => void chooseTee(i)}
                className="flex justify-between rounded-xl bg-paper px-3 py-2 text-left ring-1 ring-ink/10">
                <span className="font-display">{t.name} <span className="text-ink2">· {t.gender}</span></span>
                <span className="font-mono text-[11px] text-ink2">
                  {t.holes.length} trous · {t.holes.reduce((a, h) => a + h.length, 0)} m{t.slope ? ` · slope ${t.slope}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : results.length > 0 ? (
        <div className="mx-5 mt-3 flex flex-col gap-1.5">
          {results.map((r) => (
            <button key={r.id} onClick={() => void pick(r)}
              className="rounded-xl bg-card px-3 py-2 text-left ring-1 ring-ink/10">
              <div className="font-display text-lg leading-tight">{r.name}</div>
              <div className="font-mono text-[11px] text-ink2">
                {[r.city, r.country].filter(Boolean).join(", ")}
                {r.source === "osm" ? " · via OpenStreetMap, tracé réel" : ""}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mx-5 mt-4">
        <div className={label}>Parcours actif</div>
        <select value={c.id} onChange={(e) => round.setCourse(e.target.value)}
          className="mt-1 w-full rounded-xl bg-card px-3 py-2.5 font-display text-lg ring-1 ring-ink/15">
          {courses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[
            ["Slope", c.slope ?? "—"],
            ["Rating", c.rating ?? "—"],
            ["Altitude", c.altitude != null ? `${c.altitude} m` : "—"],
            ["Départ", c.teeName ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-card p-2 ring-1 ring-ink/10">
              <div className={label}>{k}</div>
              <div className="font-display text-base leading-tight">{v}</div>
            </div>
          ))}
        </div>
        {c.source !== "demo" && (c.lat !== 0 || c.lng !== 0) && (
          <button onClick={() => void loadRealLayout()} disabled={busy}
            className="mt-2 h-11 w-full rounded-xl bg-ink font-display text-paper disabled:opacity-40">
            {busy ? "…" : "Charger le tracé réel des trous (carte)"}
          </button>
        )}
        {layoutMsg && <p className="mt-2 rounded-xl bg-card px-3 py-2 text-[13px] ring-1 ring-ink/10">{layoutMsg}</p>}
      </div>

      {courses.filter((x) => x.source !== "demo").length > 0 && (
        <div className="mx-5 mt-4">
          <div className={label}>Mes parcours enregistrés</div>
          <div className="mt-1 flex flex-col gap-1.5">
            {courses.filter((x) => x.source !== "demo").map((x) => (
              <div key={x.id} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 ring-1 ring-ink/10">
                <button onClick={() => round.setCourse(x.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-display text-base leading-tight">
                    {x.name}{x.id === c.id ? " ✓" : ""}
                  </div>
                  <div className="font-mono text-[10px] text-ink2">{x.holes.length} trous{x.hasGeo ? " · tracé réel" : ""}</div>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Retirer « ${x.name} » de la liste ? Sa carte de score en cours sera effacée.`)) {
                      removeCourse(x.id);
                      if (x.id === c.id) round.setCourse("demo-valmont");
                    }
                  }}
                  className="shrink-0 rounded-full bg-destructive/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.15em] text-destructive uppercase">
                  Retirer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <HoleEditor key={`${c.id}-${round.hole.number}`} course={c} hole={round.hole} onSelect={round.setHole}
        position={round.position} accuracy={round.accuracy} />

      <BottomNav active="course" />
    </PhoneShell>
  );
}

function HoleEditor({ course, hole, onSelect, position, accuracy }: {
  course: Course; hole: Hole; onSelect: (n: number) => void;
  position: { lat: number; lng: number } | null; accuracy: number | null;
}) {
  const [coords, setCoords] = useState({
    lat: hole.greenSet ? String(hole.green.lat) : "",
    lng: hole.greenSet ? String(hole.green.lng) : "",
  });
  const [h, setH] = useState<Hole>(hole);
  const [saved, setSaved] = useState(false);

  const patch = (p: Partial<Hole>) => { setSaved(false); setH((x) => ({ ...x, ...p })); };
  const patchHazard = (id: string, p: Partial<Hazard>) =>
    patch({ hazards: h.hazards.map((z) => (z.id === id ? { ...z, ...p } : z)) });

  function save() {
    saveCourse({ ...course, holes: course.holes.map((x) => (x.number === h.number ? h : x)) });
    setSaved(true);
  }

  return (
    <div className="mx-5 mt-4 rounded-3xl bg-card p-4 ring-1 ring-ink/10">
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-2">
        {course.holes.map((x) => (
          <button key={x.number} onClick={() => onSelect(x.number)}
            className={x.number === hole.number ? "size-8 shrink-0 rounded-lg bg-ink font-display text-paper" : "size-8 shrink-0 rounded-lg bg-paper font-display text-ink2 ring-1 ring-ink/10"}>
            {x.number}
          </button>
        ))}
      </div>

      <div className="font-display text-2xl">Trou {h.number}</div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div><div className={label}>Par</div><Stepper value={h.par} min={3} max={6} label="par" onChange={(v) => patch({ par: v })} /></div>
        <div><div className={label}>Stroke index</div><Stepper value={h.strokeIndex} min={1} max={18} label="index" onChange={(v) => patch({ strokeIndex: v })} /></div>
        <div><div className={label}>Longueur (m)</div><Stepper value={h.length} min={50} max={700} step={5} label="longueur" onChange={(v) => patch({ length: v })} /></div>
        <div><div className={label}>Dénivelé (m)</div><Stepper value={h.elevation} min={-60} max={60} label="dénivelé" onChange={(v) => patch({ elevation: v })} /></div>
      </div>
      <div className="mt-3">
        <div className={label}>Forme du trou</div>
        <input value={h.shape} maxLength={80} onChange={(e) => patch({ shape: e.target.value })} placeholder="Ex : dogleg droit"
          className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-[14px] ring-1 ring-ink/10 outline-none" />
      </div>

      <div className="mt-4 rounded-2xl bg-paper p-3 ring-1 ring-ink/10">
        <div className={label}>Coordonnées du centre du green</div>
        <p className="mt-1 text-[12px] text-ink2">
          {h.greenSet ? "Distance calculée par GPS depuis votre position réelle." : "Non renseignées : la distance est estimée à partir de la longueur du trou."}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["lat", "lng"] as const).map((k) => (
            <label key={k} className="block">
              <span className={label}>{k === "lat" ? "Latitude" : "Longitude"}</span>
              <input inputMode="decimal" value={coords[k]}
                onChange={(e) => {
                  const next = { ...coords, [k]: e.target.value.replace(",", ".") };
                  setCoords(next);
                  const lat = Number(next.lat), lng = Number(next.lng);
                  if (next.lat && next.lng && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !Number.isNaN(lat) && !Number.isNaN(lng))
                    patch({ green: { lat, lng }, greenSet: true, greenOutline: undefined });
                }}
                placeholder={k === "lat" ? "45.1234567" : "5.7123456"}
                className="mt-1 w-full rounded-lg bg-card px-2 py-1.5 font-mono text-[13px] ring-1 ring-ink/10 outline-none" />
            </label>
          ))}
        </div>
        <button disabled={!position}
          onClick={() => {
            if (!position) return;
            setCoords({ lat: position.lat.toFixed(7), lng: position.lng.toFixed(7) });
            patch({ green: { ...position }, greenSet: true, greenOutline: undefined });
          }}
          className="mt-2 h-11 w-full rounded-xl bg-ink font-display text-paper disabled:opacity-40">
          {position ? `Je suis au centre du green — relever (±${accuracy ?? "?"} m)` : "En attente de signal GPS"}
        </button>
        {h.greenSet && position && (
          <p className="mt-2 font-mono text-[11px] text-ink2">
            Distance actuelle au green : {Math.round(distanceMeters(position, h.green))} m
          </p>
        )}
        {h.greenSet && (
          <button onClick={() => { setCoords({ lat: "", lng: "" }); patch({ greenSet: false, greenOutline: undefined }); }}
            className="mt-1 font-mono text-[10px] tracking-[0.15em] text-ink2 uppercase underline">Effacer les coordonnées</button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className={label}>Obstacles (distance depuis le départ)</div>
        <button onClick={() => patch({ hazards: [...h.hazards, { id: hazardId(), kind: "Bunker", side: "Devant le green", from: Math.max(0, h.length - 25), to: Math.max(10, h.length - 12) }] })}
          className="rounded-full bg-ink px-3 py-1 font-mono text-[10px] tracking-[0.15em] text-paper uppercase">+ Ajouter</button>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {h.hazards.length === 0 && <p className="text-[13px] text-ink2">Aucun obstacle déclaré.</p>}
        {h.hazards.map((z) => (
          <div key={z.id} className="rounded-2xl bg-paper p-3 ring-1 ring-ink/10">
            <div className="flex gap-2">
              <select value={z.kind} onChange={(e) => patchHazard(z.id, { kind: e.target.value as Hazard["kind"] })}
                className="flex-1 rounded-lg bg-card px-2 py-1.5 font-display ring-1 ring-ink/10">
                {HAZARD_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
              <select value={z.side} onChange={(e) => patchHazard(z.id, { side: e.target.value as Hazard["side"] })}
                className="flex-1 rounded-lg bg-card px-2 py-1.5 font-display ring-1 ring-ink/10">
                {HAZARD_SIDES.map((k) => <option key={k}>{k}</option>)}
              </select>
              <button aria-label="Supprimer l'obstacle" onClick={() => patch({ hazards: h.hazards.filter((x) => x.id !== z.id) })}
                className="px-2 font-display text-xl text-ink2">×</button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><div className={label}>Début</div><Stepper value={z.from} min={0} max={h.length} step={5} label="début" onChange={(v) => patchHazard(z.id, { from: v, to: Math.max(v, z.to) })} /></div>
              <div><div className={label}>Fin</div><Stepper value={z.to} min={z.from} max={h.length + 20} step={5} label="fin" onChange={(v) => patchHazard(z.id, { to: v })} /></div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={save} className="mt-4 h-12 w-full rounded-2xl bg-accent font-display text-lg text-accent-ink">
        {saved ? "Enregistré ✓" : "Enregistrer le trou"}
      </button>
    </div>
  );
}
