"use client";

import { useEffect, useMemo, useState } from "react";
import { siteConfig, TRI_SPORTS, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import type { GeoSummary } from "@/lib/strava/geo-summary";
import { dateLabel, int } from "@/lib/format";
import { useActivityDialog } from "@/components/ActivityDialog";
import { GeoMap, type MapFocus } from "@/components/GeoMap";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

type Place = GeoSummary["places"][number];

const placeName = (p: Place) =>
  p.name ? `${p.name}${p.countryCode ? `, ${p.countryCode}` : ""}` : `${p.lat.toFixed(2)}°, ${p.lng.toFixed(2)}°`;

export function Geography({ ctx }: { ctx: DashboardContext }) {
  const open = useActivityDialog();
  const [data, setData] = useState<GeoSummary | null>(null);
  const [error, setError] = useState(false);
  const [sport, setSport] = useState<SportKey | "all">("all");
  const [focus, setFocus] = useState<MapFocus | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/geo")
      .then((r) => (r.ok ? (r.json() as Promise<GeoSummary>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map(ctx.all.map((a) => [a.id, a])), [ctx.all]);
  const home = data?.places[0];
  const initial: MapFocus = useMemo(
    () => ({ lat: home?.lat ?? -15, lng: home?.lng ?? -47, zoom: home ? 9 : 3, nonce: 0 }),
    [home],
  );
  const travel = useMemo(
    () =>
      (data?.places ?? [])
        .filter((p) => p.distanceKm > 50)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    [data],
  );
  const top = data?.places.slice(0, 6) ?? [];

  const goTo = (lat: number, lng: number, zoom: number) =>
    setFocus((prev) => ({ lat, lng, zoom, nonce: (prev?.nonce ?? 0) + 1 }));
  const fly = (p: Place, zoom = 10.5) => goTo(p.lat, p.lng, zoom);
  const worldView = () => goTo(15, 0, 1.4);

  const facts = data
    ? [
        { label: "Locais únicos", value: int(data.facts.uniqueLocations) },
        { label: "Países", value: data.facts.countries ? int(data.facts.countries) : "—" },
        { label: "Mais distante", value: `${int(data.facts.furthestKm)} km` },
        { label: "Trajetos no mapa", value: int(data.facts.mappedActivities) },
      ]
    : [];

  return (
    <SectionShell id="geography" title="Geografia" kicker="onde eu treino">
      <Reveal>
        {error ? (
          <p className="card p-8 text-muted">Não consegui carregar o mapa agora. Tente recarregar a página.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[22rem_1fr]">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {(data ? facts : Array.from({ length: 4 }, () => null)).map((f, i) => (
                  <div key={i} className="card p-4">
                    <p className="label">{f ? f.label : "…"}</p>
                    <p className="num mt-2 text-3xl">{f ? f.value : "—"}</p>
                  </div>
                ))}
              </div>

              <div className="card p-5">
                <p className="label">Lugares mais frequentes</p>
                <ul className="mt-3 space-y-1">
                  {top.map((p) => (
                    <li key={`${p.lat}${p.lng}`}>
                      <button
                        onClick={() => fly(p, 10.5)}
                        className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-soft"
                      >
                        <span className="truncate">{placeName(p)}</span>
                        <span className="num text-xl text-muted">{int(p.count)}</span>
                      </button>
                    </li>
                  ))}
                  {data && top.length === 0 && <li className="text-muted">Sem trajetos com GPS ainda.</li>}
                </ul>
              </div>

              {travel.length > 0 && (
                <div className="card p-5">
                  <p className="label">Destaques de viagem</p>
                  <ul className="mt-3 space-y-1">
                    {travel.map((p) => (
                      <li key={`${p.lat}${p.lng}`}>
                        <button
                          onClick={() => fly(p, 10)}
                          className="block w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-soft"
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="truncate">{placeName(p)}</span>
                            <span className="num text-xl text-muted">{int(p.count)}</span>
                          </span>
                          <span className="label mt-0.5 block text-[0.6rem]">
                            {dateLabel(p.firstDate + "T00:00:00", { month: "short", year: "numeric" })}
                            {p.firstDate.slice(0, 7) !== p.lastDate.slice(0, 7) &&
                              ` → ${dateLabel(p.lastDate + "T00:00:00", { month: "short", year: "numeric" })}`}
                            {" · "}
                            {int(p.distanceKm)} km de casa
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="card relative h-[28rem] overflow-hidden sm:h-[34rem] lg:sticky lg:top-40 lg:h-[40rem] lg:self-start">
              {data ? (
                <GeoMap
                  routes={data.routes}
                  sport={sport}
                  year={ctx.period}
                  focus={focus ?? initial}
                  onPick={(id) => {
                    const a = byId.get(id);
                    if (a) open(a);
                  }}
                />
              ) : (
                <div className="grid size-full place-items-center">
                  <p className="label animate-pulse">Carregando mapa…</p>
                </div>
              )}

              {data && (
                <div className="label absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                  <div className="flex rounded-full border border-line bg-bg/85 p-1 backdrop-blur">
                    {(["all", ...TRI_SPORTS] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSport(s)}
                        className={`rounded-full px-3 py-1.5 transition-colors ${sport === s ? "bg-fg text-bg" : "hover:text-fg"}`}
                      >
                        {s === "all" ? "Tudo" : siteConfig.sports[s].label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={worldView}
                    className="rounded-full border border-line bg-bg/85 px-3 py-2 backdrop-blur transition-colors hover:text-fg"
                  >
                    Ver mundo
                  </button>
                </div>
              )}
              {data && (
                <p className="label absolute bottom-3 left-3 rounded-full bg-bg/85 px-3 py-1.5 text-[0.6rem] backdrop-blur">
                  {ctx.period === "all" ? "Todos os anos" : ctx.period} · clique numa rota para ver o treino
                </p>
              )}
            </div>
          </div>
        )}
      </Reveal>
    </SectionShell>
  );
}
