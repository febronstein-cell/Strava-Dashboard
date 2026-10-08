import { siteConfig } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { dateLabel, duration, km, meters, pace } from "@/lib/format";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { SportIcon } from "@/components/SportIcon";

export function Recent({ ctx }: { ctx: DashboardContext }) {
  const list = ctx.data.activities.slice(0, siteConfig.rules.recentCount);
  return (
    <SectionShell id="recentes" index="05" title="Últimas atividades">
      <Reveal>
        <ul className="card divide-y divide-line overflow-hidden">
          {list.map((a) => {
            const p = pace(a.sport, a.distance / a.movingTime);
            return (
              <li
                key={a.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-soft sm:grid-cols-[auto_1fr_6rem_6rem_7rem_5rem] sm:px-7"
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
                  {a.sport === "swim" ? meters(a.distance) : km(a.distance, 1)}
                  <span className="ml-1 text-sm text-muted">{a.sport === "swim" ? "m" : "km"}</span>
                </p>
                <p className="hidden text-right text-muted sm:block">{duration(a.movingTime)}</p>
                <p className="hidden text-right text-muted sm:block">
                  {p.value} <span className="text-xs">{p.unit}</span>
                </p>
                <p className="label hidden text-right sm:block">{dateLabel(a.date)}</p>
              </li>
            );
          })}
        </ul>
      </Reveal>
    </SectionShell>
  );
}
