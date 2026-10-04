import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const getShotElevation = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ position: point, green: point }).parse(data))
  .handler(async ({ data }) => {
    try {
      const lat = `${data.position.lat.toFixed(6)},${data.green.lat.toFixed(6)}`;
      const lng = `${data.position.lng.toFixed(6)},${data.green.lng.toFixed(6)}`;
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { elevation?: Array<number | null> };
      const [from, to] = json.elevation ?? [];
      if (typeof from !== "number" || typeof to !== "number" || !Number.isFinite(from) || !Number.isFinite(to)) return null;
      return Math.round(to - from);
    } catch {
      return null;
    }
  });