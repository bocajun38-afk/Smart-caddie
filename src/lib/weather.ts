export type Weather = {
  temperature: number;
  humidity: number;
  /** pression au sol, hPa */
  pressure: number;
  windSpeed: number;
  windGusts: number;
  windDirection: number;
  windLabel: string;
  /** vent moyen sur les 30 derniers jours (km/h), null si indisponible */
  avgWind: number | null;
  avgWindLabel: string | null;
};

const DIRS: string[] = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];

export function compass(deg: number): string {
  return DIRS[Math.round(deg / 22.5) % 16] ?? "N";
}

async function fetchAvgWind(lat: number, lng: number): Promise<{ speed: number; dir: number } | null> {
  try {
    const end = new Date(Date.now() - 3 * 86_400_000);
    const start = new Date(end.getTime() - 30 * 86_400_000);
    const d = (x: Date) => x.toISOString().slice(0, 10);
    const res = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${d(start)}&end_date=${d(end)}&daily=wind_speed_10m_max,wind_direction_10m_dominant&wind_speed_unit=kmh`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      daily?: { wind_speed_10m_max?: (number | null)[]; wind_direction_10m_dominant?: (number | null)[] };
    };
    const speeds = (json.daily?.wind_speed_10m_max ?? []).filter((v): v is number => v != null);
    const dirs = (json.daily?.wind_direction_10m_dominant ?? []).filter((v): v is number => v != null);
    if (speeds.length === 0) return null;
    // le max journalier surestime le vent moyen pendant une partie : ~65 %
    const speed = (speeds.reduce((a, b) => a + b, 0) / speeds.length) * 0.65;
    let x = 0;
    let y = 0;
    for (const dd of dirs) {
      x += Math.cos((dd * Math.PI) / 180);
      y += Math.sin((dd * Math.PI) / 180);
    }
    const dir = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    return { speed: Math.round(speed), dir: Math.round(dir) };
  } catch {
    return null;
  }
}

export async function fetchWeather(lat: number, lng: number): Promise<Weather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kmh`;
  const [res, avg] = await Promise.all([fetch(url), fetchAvgWind(lat, lng)]);
  if (!res.ok) throw new Error("weather_unavailable");
  const json = (await res.json()) as {
    current: {
      temperature_2m: number;
      relative_humidity_2m: number;
      surface_pressure: number;
      wind_speed_10m: number;
      wind_gusts_10m: number;
      wind_direction_10m: number;
    };
  };
  const c = json.current;
  const direction = Math.round(c.wind_direction_10m);
  return {
    temperature: Math.round(c.temperature_2m),
    humidity: Math.round(c.relative_humidity_2m),
    pressure: Math.round(c.surface_pressure),
    windSpeed: Math.round(c.wind_speed_10m),
    windGusts: Math.round(c.wind_gusts_10m),
    windDirection: direction,
    windLabel: compass(direction),
    avgWind: avg?.speed ?? null,
    avgWindLabel: avg ? compass(avg.dir) : null,
  };
}

/**
 * Facteur multiplicatif sur la distance à jouer selon la densité de l'air.
 * Air moins dense (altitude, chaleur) = la balle va plus loin = distance à jouer plus courte.
 */
export function airDensityFactor(w: Weather): number {
  const ratio = (w.pressure / 1013.25) * (288.15 / (w.temperature + 273.15));
  // l'humidité allège légèrement l'air
  const humid = 1 - (w.humidity / 100) * 0.005;
  return 1 + (ratio * humid - 1) * 0.5;
}

export async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { elevation?: number[] };
    const v = json.elevation?.[0];
    return typeof v === "number" ? Math.round(v) : null;
  } catch {
    return null;
  }
}
