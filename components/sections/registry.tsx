import type { ReactNode } from "react";
import type { SectionId } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { About } from "./About";
import { Custom } from "./Custom";
import { HeatmapSection } from "./HeatmapSection";
import { Hero } from "./Hero";
import { Races } from "./Races";
import { Recent } from "./Recent";
import { Records } from "./Records";
import { SportCards } from "./SportCards";
import { Volume } from "./Volume";

/**
 * Mapa de seções. Para criar uma nova: crie o componente, adicione o id em
 * `SectionId` (site.config.ts), registre aqui e inclua em `siteConfig.sections`.
 */
export const sectionRegistry: Record<SectionId, (ctx: DashboardContext) => ReactNode> = {
  hero: (ctx) => <Hero ctx={ctx} />,
  sports: (ctx) => <SportCards ctx={ctx} />,
  volume: (ctx) => <Volume ctx={ctx} />,
  heatmap: (ctx) => <HeatmapSection ctx={ctx} />,
  records: (ctx) => <Records ctx={ctx} />,
  recent: (ctx) => <Recent ctx={ctx} />,
  about: () => <About />,
  races: () => <Races />,
  custom: (ctx) => <Custom ctx={ctx} />,
};
