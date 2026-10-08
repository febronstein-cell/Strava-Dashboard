import { siteConfig } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { CountUp } from "@/components/CountUp";
import { Reveal } from "@/components/Reveal";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Hero({ ctx }: { ctx: DashboardContext }) {
  const { data, totals, year } = ctx;
  const name = siteConfig.nameOverride || data.athlete.name;
  const stats = [
    { label: "Distância", value: totals.distance / 1000, decimals: 0, unit: "km" },
    { label: "Tempo em movimento", value: totals.movingTime / 3600, decimals: 0, unit: "h" },
    { label: "Elevação", value: totals.elevation, decimals: 0, unit: "m" },
    { label: "Atividades", value: totals.count, decimals: 0, unit: "" },
  ];

  return (
    <header className="relative overflow-hidden">
      {/* Brilho de fundo nas cores das três modalidades */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[60rem] -translate-x-1/2 opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(40% 60% at 25% 50%, var(--swim), transparent), radial-gradient(40% 60% at 50% 50%, var(--ride), transparent), radial-gradient(40% 60% at 75% 50%, var(--run), transparent)",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-14 pt-6 sm:px-8 sm:pb-24">
        <nav className="flex items-center justify-between">
          <span className="label">
            {siteConfig.eyebrow} · {year}
          </span>
          <ThemeToggle />
        </nav>

        <div className="mt-16 sm:mt-28">
          <Reveal>
            <p className="label mb-4">{siteConfig.tagline}</p>
            <h1 className="num text-[clamp(3.5rem,13vw,10.5rem)] uppercase">{name}</h1>
          </Reveal>

          <dl className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 sm:mt-20 lg:grid-cols-4">
            {stats.map((s, i) => (
              <Reveal key={s.label} delay={120 + i * 90}>
                <div className="border-t border-line pt-4">
                  <dt className="label">{s.label}</dt>
                  <dd className="mt-3 flex items-baseline gap-2">
                    <CountUp value={s.value} decimals={s.decimals} className="num text-6xl sm:text-7xl" />
                    {s.unit && <span className="num text-2xl text-muted">{s.unit}</span>}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>

          {data.source === "demo" && (
            <p className="label mt-10 inline-block rounded-full border border-line px-3 py-1.5">
              Dados de demonstração · conecte o Strava para ver os seus
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
