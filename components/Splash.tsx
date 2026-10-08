import { siteConfig } from "@/site.config";
import { SportIcon } from "./SportIcon";

/**
 * Abertura: um pulso cardíaco desenha a linha, o apelido aparece letra a letra e as
 * três modalidades acendem em sequência (nado → bike → corrida), como na transição
 * de uma prova. Só aparece na primeira visita da sessão (ver script no layout) e
 * funciona só com CSS, então some mesmo se o JavaScript falhar.
 */
export function Splash() {
  return (
    <div className="splash" aria-hidden="true">
      <div className="splash-inner">
        <svg viewBox="0 0 300 60" className="splash-pulse" fill="none">
          <path
            d="M0 30 H70 L82 30 L92 8 L106 52 L118 16 L128 30 H190 L202 30 L212 12 L226 48 L238 30 H300"
            stroke="var(--brand)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
          />
        </svg>

        <p className="splash-title num">{siteConfig.nickname}</p>

        <div className="splash-sports">
          <span style={{ color: "var(--swim)" }}>
            <SportIcon sport="swim" className="size-7" />
          </span>
          <i>›</i>
          <span style={{ color: "var(--ride)" }}>
            <SportIcon sport="ride" className="size-7" />
          </span>
          <i>›</i>
          <span style={{ color: "var(--run)" }}>
            <SportIcon sport="run" className="size-7" />
          </span>
        </div>

        <p className="label mt-6">
          Carregando atividades<span className="splash-dots" />
        </p>
      </div>
    </div>
  );
}
