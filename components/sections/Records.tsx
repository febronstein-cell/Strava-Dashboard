import { siteConfig, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import type { Activity } from "@/lib/strava/types";
import { bestPace, maxBy } from "@/lib/stats";
import { dateLabel, int, km, pace } from "@/lib/format";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

interface Rec {
  label: string;
  sport: SportKey;
  value: string;
  unit: string;
  activity: Activity;
}

export function Records({ ctx }: { ctx: DashboardContext }) {
  const acts = ctx.data.activities;
  const recs: Rec[] = [];

  const add = (label: string, sport: SportKey, a: Activity | null, fmt: (a: Activity) => { value: string; unit: string }) => {
    if (a) recs.push({ label, sport, activity: a, ...fmt(a) });
  };

  add("Maior corrida", "run", maxBy(acts, (a) => a.distance, "run"), (a) => ({ value: km(a.distance, 1), unit: "km" }));
  add("Maior pedal", "ride", maxBy(acts, (a) => a.distance, "ride"), (a) => ({ value: km(a.distance, 1), unit: "km" }));
  add("Maior nado", "swim", maxBy(acts, (a) => a.distance, "swim"), (a) => ({ value: km(a.distance, 2), unit: "km" }));

  const climb = maxBy(acts, (a) => a.elevation);
  add("Maior elevação", climb?.sport ?? "ride", climb, (a) => ({ value: int(a.elevation), unit: "m" }));

  for (const sport of ["run", "ride", "swim"] as SportKey[]) {
    const best = bestPace(acts, sport);
    const label = sport === "ride" ? "Maior velocidade média" : `Melhor ritmo · ${siteConfig.sports[sport].label.toLowerCase()}`;
    add(label, sport, best, (a) => pace(sport, a.distance / a.movingTime));
  }

  return (
    <SectionShell id="recordes" index="04" title="Recordes">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {recs.map((r, i) => (
          <Reveal key={r.label} delay={(i % 4) * 80}>
            <article className="card h-full p-4 sm:p-5">
              <p className="label flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: `var(--${r.sport})` }} />
                {r.label}
              </p>
              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="num text-5xl sm:text-6xl" style={{ color: `var(--${r.sport})` }}>
                  {r.value}
                </span>
                <span className="num text-xl text-muted">{r.unit}</span>
              </p>
              <p className="mt-5 truncate text-sm">{r.activity.name}</p>
              <p className="mt-0.5 text-sm text-muted">{dateLabel(r.activity.date, { day: "2-digit", month: "short", year: "numeric" })}</p>
            </article>
          </Reveal>
        ))}
      </div>
      <p className="label mt-6 text-[0.62rem]">
        Ritmo/velocidade só contam atividades acima de {km(siteConfig.rules.minDistanceForBestPace.run, 0)} km (corrida),{" "}
        {km(siteConfig.rules.minDistanceForBestPace.ride, 0)} km (bike) e {int(siteConfig.rules.minDistanceForBestPace.swim)} m (natação).
      </p>
    </SectionShell>
  );
}
