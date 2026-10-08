import type { DashboardContext } from "@/lib/dashboard";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

/**
 * ESPAÇO RESERVADO: seção livre para o que formos criar juntos.
 * Ideias: meta do ano (progresso até X km), provas-alvo com contagem
 * regressiva, equipamentos (tênis/bike/km rodados), comparação com o ano
 * anterior, zonas de FC, "treino do mês", mapa de rotas, etc.
 *
 * Para ligar: em `site.config.ts` troque `{ id: "custom", enabled: false }`
 * por `enabled: true`. Tudo que está em `ctx` (totais, séries, heatmap...)
 * já chega pronto aqui.
 */
export function Custom({ ctx }: { ctx: DashboardContext }) {
  return (
    <SectionShell id="custom" index="06" title="Em construção">
      <Reveal>
        <div className="card border-dashed p-8 text-muted">
          Seção reservada. Você tem {ctx.totals.count} atividades em {ctx.year} para contar uma história aqui.
        </div>
      </Reveal>
    </SectionShell>
  );
}
