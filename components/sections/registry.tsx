import type { ReactNode } from "react";
import type { SectionId } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { About } from "./About";
import { Custom } from "./Custom";
import { Geography } from "./Geography";
import { Hero } from "./Hero";
import { Notable } from "./Notable";
import { Progression } from "./Progression";
import { Races } from "./Races";
import { Recent } from "./Recent";
import { SportCards } from "./SportCards";
import { Stats } from "./Stats";
import { Volume } from "./Volume";

/**
 * Mapa de seções. Para criar uma nova: crie o componente, adicione o id em
 * `SectionId` (site.config.ts), registre aqui e inclua em `siteConfig.sections`.
 */
export const sectionRegistry: Record<SectionId, (ctx: DashboardContext) => ReactNode> = {
  hero: (ctx) => <Hero ctx={ctx} />,
  races: (ctx) => <Races ctx={ctx} />,
  about: () => <About />,
  sports: (ctx) => <SportCards ctx={ctx} />,
  volume: (ctx) => <Volume ctx={ctx} />,
  notable: (ctx) => <Notable ctx={ctx} />,
  stats: (ctx) => <Stats ctx={ctx} />,
  progression: (ctx) => <Progression ctx={ctx} />,
  geography: (ctx) => <Geography ctx={ctx} />,
  recent: (ctx) => <Recent ctx={ctx} />,
  custom: (ctx) => <Custom ctx={ctx} />,
};
