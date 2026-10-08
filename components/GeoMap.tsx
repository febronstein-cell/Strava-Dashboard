"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { siteConfig, type SportKey } from "@/site.config";
import { decodePolyline } from "@/lib/geo";
import type { GeoActivity } from "@/lib/strava/types";

export interface MapFocus {
  lat: number;
  lng: number;
  zoom: number;
  /** muda a cada pedido para reaplicar o mesmo destino */
  nonce: number;
}

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
const ATTRIBUTION = "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors";
/** Mapa-base (cinza escuro/claro) + camada de nomes, ambos da Esri, sem chave de API. */
const esri = (name: string) => ({
  type: "raster" as const,
  tiles: [`${ESRI}/${name}/MapServer/tile/{z}/{y}/{x}`],
  tileSize: 256,
  maxzoom: 16,
  attribution: ATTRIBUTION,
});

/** Mapa com os trajetos. Filtra por modalidade/ano e voa até o `focus`. */
export function GeoMap({
  routes,
  sport,
  year,
  focus,
  onPick,
}: {
  routes: GeoActivity[];
  sport: SportKey | "all";
  year: number | "all";
  focus: MapFocus;
  onPick: (activityId: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const onPickRef = useRef(onPick);
  const initialFocus = useRef(focus);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // cria o mapa uma única vez
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | undefined;

    (async () => {
      const { Map, setWorkerUrl } = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      // o worker é servido como arquivo estático (ver scripts/copy-maplibre-worker.mjs)
      setWorkerUrl(new URL("/maplibre/maplibre-gl-worker.mjs", window.location.origin).href);

      const f = initialFocus.current;
      const map = new Map({
        container: container.current,
        center: [f.lng, f.lat],
        zoom: f.zoom,
        attributionControl: { compact: true },
        cooperativeGestures: true,
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + rolagem para dar zoom no mapa",
          "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + rolagem para dar zoom no mapa",
          "CooperativeGesturesHandler.MobileHelpText": "Use dois dedos para mover o mapa",
        },
        style: {
          version: 8,
          sources: {
            dark: esri("World_Dark_Gray_Base"),
            darkRef: esri("World_Dark_Gray_Reference"),
            light: esri("World_Light_Gray_Base"),
            lightRef: esri("World_Light_Gray_Reference"),
          },
          layers: [
            { id: "dark", type: "raster", source: "dark" },
            { id: "darkRef", type: "raster", source: "darkRef" },
            { id: "light", type: "raster", source: "light", layout: { visibility: "none" } },
            { id: "lightRef", type: "raster", source: "lightRef", layout: { visibility: "none" } },
          ],
        },
      });
      mapRef.current = map;

      const applyTheme = () => {
        const light = document.documentElement.dataset.theme === "light";
        for (const id of ["dark", "darkRef"]) map.setLayoutProperty(id, "visibility", light ? "none" : "visible");
        for (const id of ["light", "lightRef"]) map.setLayoutProperty(id, "visibility", light ? "visible" : "none");
      };

      map.on("load", () => {
        applyTheme();
        const colors = siteConfig.sports;
        map.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "routes-line",
          type: "line",
          source: "routes",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": [
              "match",
              ["get", "sport"],
              "run",
              colors.run.color,
              "ride",
              colors.ride.color,
              "swim",
              colors.swim.color,
              "#ffffff",
            ],
            "line-opacity": 0.6,
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 10, 1.6, 14, 3],
          },
        });
        // camada invisível mais larga, só para facilitar o clique
        map.addLayer({
          id: "routes-hit",
          type: "line",
          source: "routes",
          paint: { "line-color": "#000", "line-opacity": 0, "line-width": 14 },
        });
        map.on("click", "routes-hit", (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id !== undefined) onPickRef.current(Number(id));
        });
        map.on("mouseenter", "routes-hit", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "routes-hit", () => (map.getCanvas().style.cursor = ""));
        readyRef.current = true;
      });

      observer = new MutationObserver(() => map.isStyleLoaded() && applyTheme());
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      readyRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // carrega os trajetos (e reaplica quando o mapa terminar de iniciar)
  useEffect(() => {
    const load = () => {
      const map = mapRef.current;
      if (!map || !readyRef.current) return;
      const src = map.getSource("routes") as { setData: (d: unknown) => void } | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: routes.map((r) => ({
          type: "Feature",
          properties: { id: r.id, sport: r.sport, year: r.year },
          geometry: { type: "LineString", coordinates: decodePolyline(r.line).map(([la, ln]) => [ln, la]) },
        })),
      });
    };
    load();
    const map = mapRef.current;
    // se o mapa ainda está iniciando, espera o sinal
    const t = setInterval(() => {
      if (readyRef.current) {
        load();
        clearInterval(t);
      }
    }, 200);
    void map;
    return () => clearInterval(t);
  }, [routes]);

  // filtros
  useEffect(() => {
    const apply = () => {
      const map = mapRef.current;
      if (!map || !readyRef.current) return false;
      const filter: unknown[] = ["all"];
      if (sport !== "all") filter.push(["==", ["get", "sport"], sport]);
      if (year !== "all") filter.push(["==", ["get", "year"], year]);
      for (const id of ["routes-line", "routes-hit"]) map.setFilter(id, filter.length > 1 ? (filter as never) : null);
      return true;
    };
    if (apply()) return;
    const t = setInterval(() => apply() && clearInterval(t), 200);
    return () => clearInterval(t);
  }, [sport, year]);

  // voar até um lugar
  useEffect(() => {
    mapRef.current?.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, duration: 1400 });
  }, [focus]);

  return <div ref={container} className="size-full" />;
}
