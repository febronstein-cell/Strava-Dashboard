import type { Activity } from "@/lib/strava/types";
import { isBrick, type Durability } from "@/lib/durability";

/** One activity's durability numbers, ready for the trends. Pure. */
export interface DurabilityRow {
  id: number;
  date: string;
  sport: "run" | "ride";
  name: string;
  movingS: number;
  decoupling?: number;
  decouplingBasis?: Durability["decouplingBasis"];
  fade?: number;
  firstKm?: Durability["firstKm"];
  /** started too fast: km 1 more than 3% faster than km 2-5 */
  tooFast?: boolean;
  brick: boolean;
  best20?: number;
  /** best 20 minutes of the rides of the 90 days before this one (the "fresh" reference) */
  freshBest20?: number;
  after1500Pct?: number;
  after2500Pct?: number;
  kj?: number;
}

const DAY = 86_400_000;

export function durabilityRows(acts: Activity[], zones: Record<number, { durability?: Durability }>): DurabilityRow[] {
  const rides = acts.filter((a) => a.sport === "ride");
  const rows: DurabilityRow[] = [];
  for (const a of acts) {
    const d = zones[a.id]?.durability;
    if (!d || (a.sport !== "run" && a.sport !== "ride")) continue;
    const row: DurabilityRow = {
      id: a.id,
      date: a.date.slice(0, 10),
      sport: a.sport,
      name: a.name,
      movingS: a.movingTime,
      decoupling: d.decoupling,
      decouplingBasis: d.decouplingBasis,
      fade: d.fade,
      firstKm: d.firstKm,
      tooFast: d.firstKm ? d.firstKm.fasterPct > 3 : undefined,
      brick: isBrick(a, acts),
      best20: d.best20,
      kj: d.kj,
    };
    if (a.sport === "ride" && (d.best20After1500 || d.best20After2500)) {
      const t = Date.parse(a.date.slice(0, 10));
      const fresh = Math.max(
        0,
        ...rides
          .filter((r) => r.id !== a.id && Date.parse(r.date.slice(0, 10)) < t && Date.parse(r.date.slice(0, 10)) >= t - 90 * DAY)
          .map((r) => zones[r.id]?.durability?.best20 ?? 0),
        d.best20 ?? 0,
      );
      if (fresh > 0) {
        row.freshBest20 = fresh;
        if (d.best20After1500) row.after1500Pct = (d.best20After1500 / fresh) * 100;
        if (d.best20After2500) row.after2500Pct = (d.best20After2500 / fresh) * 100;
      }
    }
    rows.push(row);
  }
  return rows.sort((x, y) => (x.date < y.date ? -1 : 1));
}

/** How many runs started too fast, per month. */
export function firstKmByMonth(rows: DurabilityRow[]): { month: string; runs: number; flagged: number }[] {
  const by = new Map<string, { runs: number; flagged: number }>();
  for (const r of rows) {
    if (r.sport !== "run" || !r.firstKm) continue;
    const m = r.date.slice(0, 7);
    const x = by.get(m) ?? { runs: 0, flagged: 0 };
    x.runs++;
    if (r.tooFast) x.flagged++;
    by.set(m, x);
  }
  return [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, x]) => ({ month, ...x }));
}

/** Mean of a number over the rows of the last `days` days before `until`, and over the same span before that. */
export function trend(rows: DurabilityRow[], pick: (r: DurabilityRow) => number | undefined, until: string, days = 42): { recent: number | null; before: number | null; n: number } {
  const t = Date.parse(until);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const inSpan = (from: number, to: number) => rows.filter((r) => Date.parse(r.date) > from && Date.parse(r.date) <= to).map(pick).filter((v): v is number => v != null);
  const recent = inSpan(t - days * DAY, t);
  return { recent: mean(recent), before: mean(inSpan(t - 2 * days * DAY, t - days * DAY)), n: recent.length };
}
