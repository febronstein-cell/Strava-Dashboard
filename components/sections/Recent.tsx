"use client";

import { useMemo, useState } from "react";
import { ALL_SPORTS, siteConfig, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import type { Activity } from "@/lib/strava/types";
import { dateLabel, duration, int, km, meters, pace } from "@/lib/format";
import { useActivityDialog } from "@/components/ActivityDialog";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { SportIcon } from "@/components/SportIcon";

const DAY = 86_400_000;
type RangeId = "week" | "lastWeek" | "month" | "d60" | "ytd";

const RANGES: { id: RangeId; label: string }[] = [
  { id: "week", label: "Esta semana" },
  { id: "lastWeek", label: "Semana passada" },
  { id: "month", label: "Este mês" },
  { id: "d60", label: "Últimos 60 dias" },
  { id: "ytd", label: "Ano até hoje" },
];

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function rangeOf(id: RangeId, today: Date): [string, string] {
  const t = today.getTime();
  const todayKey = iso(t);
  const mondayMs = t - ((today.getUTCDay() + 6) % 7) * DAY;
  switch (id) {
    case "week":
      return [iso(mondayMs), todayKey];
    case "lastWeek":
      return [iso(mondayMs - 7 * DAY), iso(mondayMs - DAY)];
    case "month":
      return [todayKey.slice(0, 8) + "01", todayKey];
    case "d60":
      return [iso(t - 59 * DAY), todayKey];
    case "ytd":
      return [todayKey.slice(0, 4) + "-01-01", todayKey];
  }
}

export function Recent({ ctx }: { ctx: DashboardContext }) {
  const open = useActivityDialog();
  const [range, setRange] = useState<RangeId>("week");
  const [showAll, setShowAll] = useState(false);

  const list = useMemo(() => {
    const [from, to] = rangeOf(range, ctx.today);
    return ctx.all.filter((a) => {
      const k = a.date.slice(0, 10);
      return k >= from && k <= to;
    });
  }, [ctx.all, ctx.today, range]);

  const totalSecs = list.reduce((s, a) => s + a.movingTime, 0);
  const tri = list.filter((a) => a.sport !== "strength");
  const totalDist = tri.reduce((s, a) => s + a.distance, 0);
  const breakdown = ALL_SPORTS.map((s) => ({
    sport: s,
    secs: list.filter((a) => a.sport === s).reduce((t, a) => t + a.movingTime, 0),
  })).filter((b) => b.secs > 0);

  const visible = showAll ? list : list.slice(0, 10);

  return (
    <SectionShell id="recent" title="Atividades recentes" kicker="stalkeie à vontade">
      <Reveal>
        <div className="card overflow-hidden">
          <div role="tablist" aria-label="Período" className="label flex gap-1.5 overflow-x-auto border-b border-line px-5 py-4 [scrollbar-width:none] sm:px-7">
            {RANGES.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={range === r.id}
                onClick={() => {
                  setRange(r.id);
                  setShowAll(false);
                }}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 transition-colors ${
                  range === r.id ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 border-b border-line px-5 py-6 sm:grid-cols-[auto_auto_1fr] sm:items-center sm:gap-10 sm:px-7">
            <Summary label="Atividades" value={int(list.length)} />
            <Summary label="Tempo total" value={duration(totalSecs)} />
            <div>
              <p className="label">Distância {km(totalDist, 0)} km · divisão do tempo</p>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-soft">
                {breakdown.map((b) => (
                  <div key={b.sport} style={{ flex: `${b.secs} 1 0%`, background: `var(--${b.sport})` }} />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                {breakdown.map((b) => (
                  <span key={b.sport} className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: `var(--${b.sport})` }} />
                    {siteConfig.sports[b.sport].label} {Math.round((b.secs / totalSecs) * 100)}%{" "}
                    <span className="text-fg">{duration(b.secs)}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {list.length === 0 ? (
            <p className="px-7 py-10 text-muted">Nenhuma atividade neste período.</p>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((a) => (
                <Row key={a.id} a={a} onOpen={() => open(a)} />
              ))}
            </ul>
          )}

          {list.length > 10 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="label w-full border-t border-line px-7 py-4 text-center transition-colors hover:bg-soft hover:text-fg"
            >
              {showAll ? "Mostrar menos" : `Mostrar todas as ${list.length} atividades`}
            </button>
          )}
        </div>
      </Reveal>
    </SectionShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="num mt-1.5 text-5xl">{value}</p>
    </div>
  );
}

function Row({ a, onOpen }: { a: Activity; onOpen: () => void }) {
  const p = pace(a.sport as SportKey, a.distance / a.movingTime);
  return (
    <li>
      <button
        onClick={onOpen}
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-4 text-left transition-colors hover:bg-soft sm:grid-cols-[auto_1fr_6rem_6rem_7rem_5rem] sm:px-7"
      >
        <span style={{ color: `var(--${a.sport})` }} title={siteConfig.sports[a.sport].label}>
          <SportIcon sport={a.sport} className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{a.name}</p>
          <p className="label text-[0.62rem] sm:hidden">
            {siteConfig.sports[a.sport].label} · {dateLabel(a.date)} · {duration(a.movingTime)}
          </p>
        </div>
        <p className="num text-right text-2xl sm:text-3xl">
          {a.sport === "strength" ? (
            duration(a.movingTime)
          ) : (
            <>
              {a.sport === "swim" ? meters(a.distance) : km(a.distance, 1)}
              <span className="ml-1 text-sm text-muted">{a.sport === "swim" ? "m" : "km"}</span>
            </>
          )}
        </p>
        <p className="hidden text-right text-muted sm:block">{a.sport === "strength" ? "" : duration(a.movingTime)}</p>
        <p className="hidden text-right text-muted sm:block">
          {p.value !== "—" && (
            <>
              {p.value} <span className="text-xs">{p.unit}</span>
            </>
          )}
        </p>
        <p className="label hidden text-right sm:block">{dateLabel(a.date)}</p>
      </button>
    </li>
  );
}
