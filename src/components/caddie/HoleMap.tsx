import { ClientOnly, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import type { Course, Hole, LatLng } from "@/lib/golf-data";

const LiveMap = lazy(() => import("./HoleMap.client"));

export type HoleMapProps = {
  hole: Hole;
  course: Course;
  position: LatLng | null;
  gpsActive: boolean;
};

function MapPlaceholder() {
  return <div className="grid h-[210px] place-items-center bg-muted text-sm text-ink2">Chargement de la carte…</div>;
}

export function HoleMap(props: HoleMapProps) {
  if (props.course.source === "demo" || (!props.course.hasGeo && !props.hole.greenSet)) {
    return (
      <div className="grid min-h-[180px] place-items-center border border-border bg-muted px-6 text-center">
        <p className="text-sm text-ink2">
          Pas de carte réelle pour ce trou. <Link to="/parcours" className="font-semibold text-ink underline">Choisir un golf et charger son tracé</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-border bg-muted">
      <ClientOnly fallback={<MapPlaceholder />}>
        <Suspense fallback={<MapPlaceholder />}>
          <LiveMap {...props} />
        </Suspense>
      </ClientOnly>
    </div>
  );
}