import type { Metadata } from "next";
import { siteConfig } from "@/site.config";
import { LabApp } from "@/components/lab/LabApp";
import { getLabData } from "@/lib/lab/get-lab";
import { getLabels } from "@/lib/lab/labeling";
import { getSeason } from "@/lib/season-data";
import { getAllData } from "@/lib/strava/get-data";

export const maxDuration = 60;

/** The page waits for the history and the database, so it is not an "instant" navigation: skip that dev-only check. */
export const instant = false;

export const metadata: Metadata = {
  title: `Lab · ${siteConfig.nickname}`,
  description: "Thresholds, training load, progression and race builds.",
  robots: { index: false, follow: false },
};

export default async function LabPage() {
  const [{ overview, years }, lab, labels, season] = await Promise.all([getAllData(), getLabData(), getLabels(), getSeason()]);
  const activities = years.flatMap((y) => y.activities).sort((a, b) => (a.date < b.date ? 1 : -1));
  return <LabApp overview={overview} activities={activities} lab={lab} labels={labels} season={season} />;
}
