import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type CourseSummary = {
  id: number;
  name: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  source: "api" | "osm";
};

export type CourseTee = {
  name: string;
  gender: "homme" | "femme";
  slope: number | null;
  rating: number | null;
  holes: Array<{ par: number; strokeIndex: number; length: number }>;
};

export type CourseDetail = CourseSummary & { tees: CourseTee[] };

type ApiHole = { par?: number; yardage?: number; handicap?: number };
type ApiTee = {
  tee_name?: string;
  course_rating?: number;
  slope_rating?: number;
  holes?: ApiHole[];
};
type ApiCourse = {
  id: number;
  club_name?: string;
  course_name?: string;
  location?: { city?: string; country?: string; latitude?: number; longitude?: number };
  tees?: { male?: ApiTee[]; female?: ApiTee[] };
};

async function api(path: string): Promise<unknown> {
  const key = process.env["GOLF_COURSE_API_KEY"];
  if (!key) throw new Error("no_key");
  const res = await fetch(`https://api.golfcourseapi.com${path}`, {
    headers: { Authorization: `Key ${key}` },
  });
  if (res.status === 401) throw new Error("bad_key");
  if (res.status === 429) throw new Error("rate_limit");
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  return res.json();
}

function summary(c: ApiCourse): CourseSummary {
  const club = c.club_name ?? "";
  const course = c.course_name ?? "";
  const name = course && course !== club ? `${club} — ${course}` : club || course || "Parcours";
  return {
    id: c.id,
    name,
    city: c.location?.city ?? "",
    country: c.location?.country ?? "",
    lat: c.location?.latitude ?? null,
    lng: c.location?.longitude ?? null,
    source: "api",
  };
}

// Secours OpenStreetMap : la base GolfCourseAPI couvre surtout les USA/UK.
// Nominatim connaît les golfs français (leisure=golf_course).
type OsmResult = {
  osm_id: number;
  name?: string;
  type?: string;
  class?: string;
  lat?: string;
  lon?: string;
  address?: { city?: string; town?: string; village?: string; municipality?: string; country?: string };
  display_name?: string;
};

async function osmSearch(q: string): Promise<CourseSummary[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=15&addressdetails=1` +
    `&countrycodes=fr&q=${encodeURIComponent(`golf ${q}`)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "SmartCaddie/1.0 (golf caddie app)", Accept: "application/json" },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as OsmResult[];
  return json
    .filter((r) => r.type === "golf_course" || r.class === "leisure")
    .slice(0, 10)
    .map((r) => ({
      id: -Math.abs(r.osm_id),
      name: r.name ?? r.display_name?.split(",")[0] ?? "Golf",
      city: r.address?.city ?? r.address?.town ?? r.address?.village ?? r.address?.municipality ?? "",
      country: r.address?.country ?? "France",
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lon != null ? Number(r.lon) : null,
      source: "osm" as const,
    }));
}

function errorMessage(e: unknown): string {
  const m = (e as Error)?.message;
  if (m === "no_key" || m === "bad_key") return "La clé GolfCourseAPI est absente ou refusée.";
  if (m === "rate_limit") return "Trop de recherches, réessayez dans un instant.";
  return "La base mondiale des parcours est indisponible.";
}

export const searchCourses = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const json = (await api(`/v1/search?search_query=${encodeURIComponent(data.q)}`)) as {
        courses?: ApiCourse[];
      };
      const courses = (json.courses ?? []).slice(0, 25).map(summary);
      if (courses.length > 0) return { courses, error: null as string | null };
      const osm = await osmSearch(data.q);
      return { courses: osm, error: null as string | null };
    } catch (e) {
      console.error("searchCourses", e);
      try {
        const osm = await osmSearch(data.q);
        if (osm.length > 0) return { courses: osm, error: null as string | null };
      } catch (e2) {
        console.error("osmSearch", e2);
      }
      return { courses: [] as CourseSummary[], error: errorMessage(e) };
    }
  });

export const getCourseDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const json = (await api(`/v1/courses/${data.id}`)) as { course?: ApiCourse } & ApiCourse;
      const c: ApiCourse = json.course ?? json;
      const mapTee = (t: ApiTee, gender: "homme" | "femme"): CourseTee => ({
        name: t.tee_name ?? "Départ",
        gender,
        slope: t.slope_rating ?? null,
        rating: t.course_rating ?? null,
        holes: (t.holes ?? []).map((h, i) => ({
          par: h.par ?? 4,
          strokeIndex: h.handicap ?? i + 1,
          length: Math.round((h.yardage ?? 0) * 0.9144),
        })),
      });
      const tees = [
        ...(c.tees?.male ?? []).map((t) => mapTee(t, "homme")),
        ...(c.tees?.female ?? []).map((t) => mapTee(t, "femme")),
      ].filter((t) => t.holes.length > 0);
      const detail: CourseDetail = { ...summary(c), tees };
      return { course: detail, error: null as string | null };
    } catch (e) {
      console.error("getCourseDetail", e);
      return { course: null, error: errorMessage(e) };
    }
  });
