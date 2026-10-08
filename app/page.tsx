import { Dashboard } from "@/components/Dashboard";
import { getAllData } from "@/lib/strava/get-data";

/** Teto de execução da atualização em segundo plano (60 s vale em qualquer plano da Vercel). */
export const maxDuration = 60;

export default async function Page() {
  // Histórico completo, cacheado: ano corrente a cada 1h, anos passados a cada 1 dia.
  const { overview, years } = await getAllData();
  const activities = years.flatMap((y) => y.activities).sort((a, b) => (a.date < b.date ? 1 : -1));

  return <Dashboard overview={overview} activities={activities} />;
}
