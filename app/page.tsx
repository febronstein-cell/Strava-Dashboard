import { Dashboard } from "@/components/Dashboard";
import { getLabelData } from "@/lib/lab/labeling";
import { getAllData } from "@/lib/strava/get-data";

/** Teto de execução da atualização em segundo plano (60 s vale em qualquer plano da Vercel). */
export const maxDuration = 60;

/** The page waits for the history and the database, so it is not an "instant" navigation: skip that dev-only check. */
export const instant = false;

export default async function Page() {
  // Histórico completo, cacheado: ano corrente a cada 1h, anos passados a cada 1 dia.
  const [{ overview, years }, { labels, titles }] = await Promise.all([getAllData(), getLabelData()]);
  const activities = years.flatMap((y) => y.activities).sort((a, b) => (a.date < b.date ? 1 : -1));

  return <Dashboard overview={overview} activities={activities} labels={labels} titles={titles} />;
}
