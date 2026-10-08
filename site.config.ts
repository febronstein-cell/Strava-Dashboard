/**
 * ============================================================
 *  PONTO CENTRAL DE PERSONALIZAÇÃO
 * ============================================================
 * Quase tudo que dá identidade ao site passa por aqui, sem precisar mexer
 * nos componentes: textos, cores, provas, próxima meta, quais seções aparecem
 * e em que ordem. Cores/tipografia globais ficam em `app/globals.css`
 * (bloco "THEME TOKENS") e as fontes em `app/layout.tsx`.
 */

export type SportKey = "run" | "ride" | "swim" | "strength";

export type SectionId =
  | "hero"
  | "races"
  | "about"
  | "sports"
  | "volume"
  | "notable"
  | "stats"
  | "heart"
  | "progression"
  | "geography"
  | "recent"
  | "custom";

export interface UpcomingRace {
  name: string;
  location?: string;
  /** Data da prova (AAAA-MM-DD). */
  date: string;
  note?: string;
}

export const siteConfig = {
  // ----------------------------------------------------------- identidade
  /** Deixe vazio para usar o nome do perfil no Strava. */
  nameOverride: "",
  /** Nome curto que aparece no topo da página. Vazio = automático. */
  shortName: "TheEnduranceFreak",
  /** Frase curta abaixo do nome no hero. */
  tagline: "Natação · Ciclismo · Corrida",
  /** Texto pequeno acima do nome (eyebrow). */
  eyebrow: "Strava em números",
  /** Apelido/handle (aparece no hero, no rodapé e no título da aba). */
  nickname: "TheEnduranceFreak",
  /** Seu @ (sem o @). Aparece no hero e no rodapé. */
  handle: "bronsteintriathlon",
  /** Assinatura do rodapé. */
  madeBy: "Felipe Bronstein",
  locale: "pt-BR",
  /** Link do perfil no Strava (rodapé). Vazio = montado automaticamente com o seu ID de atleta. */
  stravaProfileUrl: "",

  // ---------------------------------------------------------------- dados
  /** Primeiro ano do histórico. `null` = ano em que sua conta Strava foi criada. */
  startYear: null as number | null,

  // ---------------------------------------------------------------- cores
  /**
   * Rótulos e cores de cada modalidade (viram variáveis CSS --run, --ride...).
   * `brand` é o destaque geral do site; `goal` marca provas e a próxima meta.
   */
  sports: {
    run: { label: "Corrida", color: "#ff5a1f", unitLabel: "ritmo" },
    ride: { label: "Bike", color: "#c6f432", unitLabel: "velocidade" },
    swim: { label: "Natação", color: "#2bd4ff", unitLabel: "ritmo" },
    strength: { label: "Força", color: "#a78bfa", unitLabel: "" },
  } satisfies Record<SportKey, { label: string; color: string; unitLabel: string }>,
  brand: "#1fe08a",
  goalColor: "#ff4d8d",

  // -------------------------------------------------------------- seções
  /** Ordem e visibilidade das seções. Reordene ou troque `enabled`. */
  sections: [
    { id: "hero", enabled: true },
    { id: "races", enabled: true },
    { id: "about", enabled: false },
    { id: "sports", enabled: true },
    { id: "volume", enabled: true },
    { id: "notable", enabled: true },
    { id: "stats", enabled: true },
    { id: "heart", enabled: true },
    { id: "progression", enabled: true },
    { id: "geography", enabled: true },
    { id: "recent", enabled: true },
    { id: "custom", enabled: false },
  ] as { id: SectionId; enabled: boolean }[],

  /** Rótulos do menu de navegação (só seções com título). */
  nav: {
    about: "Sobre",
    races: "Provas",
    sports: "Modalidades",
    volume: "Volume",
    notable: "Destaques",
    stats: "Estatísticas",
    heart: "FC",
    progression: "Progressão",
    geography: "Geografia",
    recent: "Recentes",
  } as Partial<Record<SectionId, string>>,

  // ------------------------------------------------------- próximas provas
  /**
   * Provas futuras, em qualquer ordem. A mais próxima vira o destaque com contagem
   * regressiva; provas que já passaram somem sozinhas.
   */
  upcomingRaces: [
    {
      name: "Ironman 70.3 Florianópolis",
      location: "Florianópolis, SC",
      date: "2026-10-18",
      note: "1,9 km de natação · 90 km de bike · 21,1 km de corrida",
    },
    {
      name: "Troféu Brasil de Triathlon · 4ª etapa",
      location: "Santos, SP · Praia da Aparecida",
      date: "2026-12-13",
      note: "Última etapa do circuito de 2026",
    },
  ] as UpcomingRace[],

  // ----------------------------------------------------------- conteúdo
  about: {
    title: "Sobre",
    /** Seu texto (um parágrafo por linha em branco). */
    body: "",
    /** Cidades, ex.: "Florianópolis · São Paulo". */
    places: "",
  },

  // ---------------------------------------------------------- regras
  rules: {
    /** Distância mínima (m) para uma atividade valer como "melhor ritmo". */
    minDistanceForBestPace: { run: 3000, ride: 10000, swim: 400, strength: Infinity } satisfies Record<SportKey, number>,
    /** Colorir o heatmap pela modalidade dominante do dia. */
    heatmapColorBySport: true,
  },

  // ---------------------------------------------------- frequência cardíaca
  heartRate: {
    /**
     * Zonas em bpm absolutos, aplicadas à FC média de cada atividade.
     * `max` é o limite superior INCLUSIVO da zona (Z1 vai até 150 bpm, Z2 até 167...);
     * a última zona não tem teto.
     */
    zones: [
      { name: "Z1 · Recuperação", max: 150, color: "#2bd4ff" },
      { name: "Z2 · Aeróbica", max: 167, color: "#1fe08a" },
      { name: "Z3 · Tempo", max: 181, color: "#c6f432" },
      { name: "Z4 · Limiar", max: 187, color: "#ffb020" },
      { name: "Z5 · Máximo", max: Infinity, color: "#ff5a1f" },
    ],
    /** Largura de cada barra do histograma (bpm). */
    bin: 5,
  },

  // --------------------------------------------------------- geografia
  geo: {
    /**
     * PRIVACIDADE: para esconder o trecho perto de casa no mapa público, informe
     * o ponto de casa e um raio. Com `home: null` (padrão) nada é escondido.
     * Ex.: home: { lat: -27.59, lng: -48.55 }, radiusKm: 1
     */
    privacy: { home: null as { lat: number; lng: number } | null, radiusKm: 1 },
  },

  /** Créditos do rodapé. */
  credits: {
    builtWith: ["Next.js", "React", "Tailwind CSS", "TypeScript", "Vercel"],
    maps: ["MapLibre GL", "Esri", "© OpenStreetMap"],
    data: ["Strava API", "Nominatim"],
    fonts: ["Big Shoulders", "Geist", "Geist Mono"],
  },
};

export type SiteConfig = typeof siteConfig;
export const TRI_SPORTS: SportKey[] = ["swim", "ride", "run"];
export const ALL_SPORTS: SportKey[] = ["swim", "ride", "run", "strength"];
