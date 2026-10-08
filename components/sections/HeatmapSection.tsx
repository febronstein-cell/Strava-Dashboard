import { siteConfig } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { Heatmap } from "@/components/Heatmap";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

export function HeatmapSection({ ctx }: { ctx: DashboardContext }) {
  const { streaks } = ctx;
  const chips = [
    { label: "Dias ativos", value: `${streaks.activeDays}/${streaks.totalDays}` },
    { label: "Sequência atual", value: `${streaks.current}d` },
    { label: "Maior sequência", value: `${streaks.longest}d` },
  ];
  return (
    <SectionShell
      id="consistencia"
      index="03"
      title="Consistência"
      aside={
        <dl className="flex gap-6">
          {chips.map((c) => (
            <div key={c.label}>
              <dt className="label">{c.label}</dt>
              <dd className="num mt-1 text-3xl">{c.value}</dd>
            </div>
          ))}
        </dl>
      }
    >
      <Reveal>
        <Heatmap days={ctx.heat} colorBySport={siteConfig.rules.heatmapColorBySport} />
      </Reveal>
    </SectionShell>
  );
}
