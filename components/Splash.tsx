import { siteConfig } from "@/site.config";
import { SportIcon } from "./SportIcon";

/**
 * Tela de carregamento: o ícone troca de modalidade (nado → bike → corrida)
 * e some sozinha. Só aparece na primeira visita da sessão (ver script no layout).
 * Funciona só com CSS, então some mesmo se o JavaScript falhar.
 */
export function Splash() {
  return (
    <div className="splash" aria-hidden="true">
      <div className="splash-inner">
        <div className="splash-icons">
          <span style={{ color: "var(--swim)" }}>
            <SportIcon sport="swim" className="size-14" />
          </span>
          <span style={{ color: "var(--ride)" }}>
            <SportIcon sport="ride" className="size-14" />
          </span>
          <span style={{ color: "var(--run)" }}>
            <SportIcon sport="run" className="size-14" />
          </span>
        </div>
        <p className="label mt-8">Carregando atividades</p>
        <div className="splash-bar" />
        <p className="label mt-6 text-[0.6rem]">{siteConfig.eyebrow}</p>
      </div>
    </div>
  );
}
