/**
 * ============================================================
 *  PONTO CENTRAL DE PERSONALIZAÇÃO
 * ============================================================
 * Quase tudo que dá identidade ao site passa por aqui, sem precisar mexer
 * nos componentes: textos, cores por modalidade, quais seções aparecem e em
 * que ordem. Cores/tipografia globais ficam em `app/globals.css` (bloco
 * "THEME TOKENS") e as fontes em `app/layout.tsx`.
 *
 * Para criar uma seção nova, só nossa: veja `components/sections/Custom.tsx`
 * e registre-a em `components/sections/registry.tsx`.
 */

export type SportKey = "run" | "ride" | "swim";

export type SectionId =
  | "hero"
  | "sports"
  | "volume"
  | "heatmap"
  | "records"
  | "recent"
  // Seções nossas (espaços reservados, desligados por padrão):
  | "about"
  | "races"
  | "custom";

export const siteConfig = {
  /** Deixe vazio para usar o nome do perfil no Strava. */
  nameOverride: "",
  /** Frase curta abaixo do nome no hero. */
  tagline: "Natação · Ciclismo · Corrida",
  /** Texto pequeno acima do nome (eyebrow). */
  eyebrow: "Strava em números",
  locale: "pt-BR",
  /** Ano exibido. `null` = ano corrente. */
  year: null as number | null,
  /** Link do perfil no Strava (aparece no rodapé/hero). Opcional. */
  stravaProfileUrl: "",

  /** Rótulos e cores de cada modalidade. As cores viram variáveis CSS. */
  sports: {
    run: { label: "Corrida", color: "#ff5a1f", unitLabel: "ritmo" },
    ride: { label: "Bike", color: "#c6f432", unitLabel: "velocidade" },
    swim: { label: "Natação", color: "#2bd4ff", unitLabel: "ritmo" },
  } satisfies Record<SportKey, { label: string; color: string; unitLabel: string }>,

  /**
   * Ordem e visibilidade das seções na página.
   * Reordene as linhas ou troque `enabled` para montar o layout.
   */
  sections: [
    { id: "hero", enabled: true },
    { id: "sports", enabled: true },
    { id: "volume", enabled: true },
    { id: "heatmap", enabled: true },
    { id: "records", enabled: true },
    { id: "recent", enabled: true },
    // --- espaços reservados para o que formos criar juntos ---
    { id: "about", enabled: false },
    { id: "races", enabled: false },
    { id: "custom", enabled: false },
  ] as { id: SectionId; enabled: boolean }[],

  /** Regras de negócio ajustáveis. */
  rules: {
    /** Distância mínima (m) para uma atividade valer como "melhor ritmo". */
    minDistanceForBestPace: { run: 3000, ride: 10000, swim: 400 } satisfies Record<SportKey, number>,
    /** Quantas atividades mostrar na lista. */
    recentCount: 10,
    /** Colorir o heatmap pela modalidade dominante do dia. */
    heatmapColorBySport: true,
  },

  /** Conteúdo das seções "nossas" (preencha quando formos personalizar). */
  about: {
    title: "Sobre mim",
    body: "",
  },
  races: [] as { name: string; date: string; distance?: string; note?: string }[],
};

export type SiteConfig = typeof siteConfig;
