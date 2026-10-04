import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { LocateFixed, Minus, Plus } from "lucide-react";

import type { HoleMapProps } from "./HoleMap";
import { Button } from "@/components/ui/button";

const planTiles = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const satelliteTiles = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export default function LiveMap({ hole, position, gpsActive }: HoleMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const gpsRef = useRef<L.CircleMarker | null>(null);
  const [mode, setMode] = useState<"plan" | "satellite">("plan");

  const fitHole = () => {
    const map = mapRef.current;
    if (!map) return;
    const points = hole.line?.length && hole.line.length > 1 ? hole.line : [hole.tee, hole.green];
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    if (bounds.getNorthEast().distanceTo(bounds.getSouthWest()) < 30) map.setView([hole.green.lat, hole.green.lng], 18);
    else map.fitBounds(bounds.pad(0.1), { padding: [16, 16], maxZoom: 19 });
  };

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
    });
    mapRef.current = map;
    map.attributionControl.setPrefix(false);
    return () => { mapRef.current = null; map.remove(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    tileRef.current = L.tileLayer(mode === "plan" ? planTiles : satelliteTiles, {
      maxZoom: 19,
      attribution: mode === "plan" ? "© OpenStreetMap contributors" : "Imagery © Esri, Maxar, Earthstar Geographics; tracé © OpenStreetMap",
    }).addTo(map);
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const overlay = L.layerGroup().addTo(map);
    const line = hole.line?.length && hole.line.length > 1 ? hole.line : [hole.tee, hole.green];
    const path = line.map((p) => L.latLng(p.lat, p.lng));
    const bounds = L.latLngBounds(path);

    // A tee/green line is only a reference when the full mapped hole shape is unavailable.
    L.polyline(path, { color: "#0A0F0C", weight: 7, opacity: 0.9 }).addTo(overlay);
    L.polyline(path, { color: "#F4F6F0", weight: 3, opacity: 0.95, ...(hole.line?.length ? {} : { dashArray: "8 7" }) }).addTo(overlay);

    L.circleMarker([hole.tee.lat, hole.tee.lng], {
      radius: 8, color: "#F4F6F0", weight: 3, fillColor: "#0A0F0C", fillOpacity: 1,
    }).addTo(overlay).bindTooltip("Départ cartographié");
    L.circleMarker([hole.green.lat, hole.green.lng], {
      radius: 10, color: "#F4F6F0", weight: 3, fillColor: "#FF4D1C", fillOpacity: 1,
    }).addTo(overlay).bindTooltip("Centre du green");
    // Reframe only on a hole change; GPS updates must not cancel the golfer's pan/zoom.
    if (bounds.getNorthEast().distanceTo(bounds.getSouthWest()) < 30) map.setView([hole.green.lat, hole.green.lng], 18, { animate: false });
    else map.fitBounds(bounds.pad(0.1), { padding: [16, 16], maxZoom: 19, animate: false });
    return () => { map.removeLayer(overlay); };
  }, [hole.number, hole.tee, hole.green, hole.line]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    gpsRef.current?.remove();
    gpsRef.current = gpsActive && position ? L.circleMarker([position.lat, position.lng], {
      radius: 9, color: "#F4F6F0", weight: 3, fillColor: "#2D8AFF", fillOpacity: 1,
    }).addTo(map).bindTooltip("Votre position GPS") : null;
    return () => { gpsRef.current?.remove(); gpsRef.current = null; };
  }, [position, gpsActive]);

  return (
    <div className="relative">
       <div ref={container} className="h-[260px] w-full" role="application" aria-label={`Carte interactive du trou ${hole.number}`} />
      <div className="absolute left-3 top-3 z-[500] flex gap-1 bg-paper p-1 shadow-sm">
        <Button type="button" size="sm" variant={mode === "plan" ? "default" : "ghost"} onClick={() => setMode("plan")}>Plan</Button>
        <Button type="button" size="sm" variant={mode === "satellite" ? "default" : "ghost"} onClick={() => setMode("satellite")}>Satellite</Button>
      </div>
      <div className="absolute right-3 top-3 z-[500] flex flex-col gap-1">
        <Button type="button" variant="secondary" size="icon" aria-label="Zoom avant" title="Zoom avant" onClick={() => mapRef.current?.zoomIn()}><Plus /></Button>
        <Button type="button" variant="secondary" size="icon" aria-label="Zoom arrière" title="Zoom arrière" onClick={() => mapRef.current?.zoomOut()}><Minus /></Button>
        <Button type="button" variant="secondary" size="icon" aria-label="Recentrer le trou" title="Recentrer le trou" onClick={fitHole}><LocateFixed /></Button>
      </div>
      <div className="border-t border-border bg-paper px-3 py-2 text-xs font-medium text-ink">
        <span>● Départ</span> <span className="mx-1.5 text-ink2">·</span> <span className="text-accent">●</span> Green{gpsActive ? " · ● Vous" : ""}
        {!hole.line?.length && <span className="block text-ink2">Ligne indicative : tracé non disponible.</span>}
      </div>
    </div>
  );
}