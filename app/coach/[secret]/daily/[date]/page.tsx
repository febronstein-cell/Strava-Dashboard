import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { coachDaily, coachSecretOk, type CoachDaily } from "@/lib/coach-daily";

export const metadata: Metadata = { title: "Daily summary", robots: { index: false, follow: false } };
export const maxDuration = 60;
export const instant = false;

const cell = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

function Rows({ data }: { data: Record<string, unknown> }) {
  return (
    <table>
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k}>
            <th scope="row" style={{ textAlign: "left", paddingRight: 16, verticalAlign: "top" }}>{k}</th>
            <td>{cell(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The same data as the coach API, as plain HTML (no JavaScript needed to read it): the nightly review reads pages with
 * a simple fetch. Behind the secret segment; a wrong one is a 404.
 */
export default async function CoachDailyPage({ params }: { params: Promise<{ secret: string; date: string }> }) {
  const { secret, date } = await params;
  if (!coachSecretOk(secret) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) notFound();
  const d: CoachDaily = await coachDaily(date);

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, sans-serif", lineHeight: 1.45, maxWidth: 960, margin: "0 auto" }}>
      <h1>Daily summary {d.date}</h1>

      <h2>Activities ({d.activities.length})</h2>
      {d.activities.length === 0 && <p>No activities.</p>}
      {d.activities.map((a) => (
        <section key={a.id}>
          <h3>{a.sport}: {a.name}</h3>
          <Rows data={{ ...a, timeInZoneSeconds: a.timeInZoneSeconds, durability: a.durability }} />
        </section>
      ))}

      <h2>Plan and compliance</h2>
      {d.plan ? <PlanBlock plan={d.plan as Record<string, unknown>} /> : <p>No planned week saved for this date.</p>}

      <h2>Check-in</h2>
      {d.checkin ? <Rows data={d.checkin as unknown as Record<string, unknown>} /> : <p>No check-in for this date.</p>}

      <h2>Load</h2>
      {d.load ? <Rows data={d.load} /> : <p>No load data.</p>}

      <h2>Season</h2>
      <Rows data={d.season as unknown as Record<string, unknown>} />
    </main>
  );
}

function PlanBlock({ plan }: { plan: Record<string, unknown> }) {
  const sessions = (plan.sessions as Record<string, unknown>[]) ?? [];
  return (
    <>
      <Rows data={{ weekLabel: plan.weekLabel, restDay: plan.restDay, unplannedActivityIds: plan.unplannedActivityIds, weekSoFar: plan.weekSoFar }} />
      {sessions.map((s, i) => (
        <section key={i}>
          <h3>Planned {String(s.sport)}{s.key ? " (key)" : ""}</h3>
          <Rows data={s} />
        </section>
      ))}
    </>
  );
}
