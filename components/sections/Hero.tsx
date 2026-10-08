import { siteConfig } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { hoursInt, int, km } from "@/lib/format";
import { CountUp } from "@/components/CountUp";
import { Reveal } from "@/components/Reveal";

const EARTH_KM = 40_075;
const EVEREST_M = 8_849;
const ISS_ORBIT_MIN = 92.9;

const one = (n: number) => new Intl.NumberFormat(siteConfig.locale, { maximumFractionDigits: 1 }).format(n);

export function Hero({ ctx }: { ctx: DashboardContext }) {
  const { overview, totals, allTotals, acts } = ctx;
  const name = siteConfig.nameOverride || overview.athlete.name;
  const activeDays = new Set(acts.map((a) => a.date.slice(0, 10))).size;

  const stats = [
    {
      label: "Distância",
      value: totals.distance / 1000,
      unit: "km",
      note: `${one(totals.distance / 1000 / EARTH_KM)}× a volta na Terra`,
    },
    {
      label: "Tempo em movimento",
      value: totals.movingTime / 3600,
      unit: "h",
      note: `${int((totals.movingTime / 60) / ISS_ORBIT_MIN)} órbitas da ISS`,
    },
    {
      label: "Elevação",
      value: totals.elevation,
      unit: "m",
      note: `${one(totals.elevation / EVEREST_M)}× o Everest`,
    },
    {
      label: "Atividades",
      value: totals.count,
      unit: "",
      note: `${int(activeDays)} dias com treino`,
    },
  ];

  return (
    <header id="hero" className="relative overflow-hidden">
      {/* Brilho de fundo nas cores das três modalidades */}
      <div
        aria-hidden
        className="parallax-glow pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[60rem] opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(40% 60% at 25% 50%, var(--swim), transparent), radial-gradient(40% 60% at 50% 50%, var(--ride), transparent), radial-gradient(40% 60% at 75% 50%, var(--run), transparent)",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-10 pt-16 sm:px-8 sm:pb-20 sm:pt-24">
        <Reveal>
          <p className="label mb-4">
            {siteConfig.tagline} · <span className="text-brand">{ctx.periodLabel}</span>
          </p>
          <h1 className="parallax-name num text-[clamp(3.5rem,13vw,10.5rem)] uppercase">{name}</h1>
          {siteConfig.nickname && (
            <p className="num mt-4 flex flex-wrap items-baseline gap-x-4 text-3xl sm:text-5xl">
              <span className="text-brand">{siteConfig.nickname}</span>
              {siteConfig.handle && <span className="text-muted">@{siteConfig.handle}</span>}
            </p>
          )}
        </Reveal>

        <dl className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 sm:mt-20 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={120 + i * 90}>
              <div className="border-t border-line pt-4">
                <dt className="label">{s.label}</dt>
                <dd className="mt-3 flex items-baseline gap-2">
                  <CountUp value={s.value} className="num text-6xl sm:text-7xl" />
                  {s.unit && <span className="num text-2xl text-muted">{s.unit}</span>}
                </dd>
                <p className="mt-3 text-sm text-muted">{s.note}</p>
              </div>
            </Reveal>
          ))}
        </dl>

        <Reveal delay={500}>
          <p className="label mt-10 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>Desde {ctx.firstYear}</span>
            <span className="text-fg">{km(allTotals.distance, 0)} km</span>
            <span className="text-fg">{hoursInt(allTotals.movingTime)} h</span>
            <span className="text-fg">{int(allTotals.count)} atividades</span>
            {ctx.isDemo && (
              <span className="rounded-full border border-line px-3 py-1.5">
                Dados de demonstração · conecte o Strava para ver os seus
              </span>
            )}
          </p>
        </Reveal>
      </div>
    </header>
  );
}
