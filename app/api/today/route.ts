import { type NextRequest } from "next/server";
import { baselines, readiness } from "@/lib/checkin";
import { readCheckins } from "@/lib/checkin-data";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { keySession, sanitizeDays, slotFilled } from "@/lib/lab/plan";
import { mondayOf } from "@/lib/lab/progress";
import { getSupabase } from "@/lib/supabase";

/**
 * Everything the "Today" card needs: today's check-in with its signal and reasons, the baselines, and today's planned
 * sessions from the planner with the key one. Personal, so it needs the unlock and is never cached.
 */
export async function GET(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const history = await readCheckins(30);
  const today = history.find((c) => c.day === day) ?? null;
  const fresh = today ? readiness(today, history.filter((c) => c.day !== day)) : null;

  const { data: week } = await getSupabase().from("training_weeks").select("planned_sessions").eq("week_start", mondayOf(day)).maybeSingle();
  const days = sanitizeDays(week?.planned_sessions);
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  const plan = days?.[dow] ?? null;
  const sessions = plan && !plan.rest ? plan.slots.filter(slotFilled) : [];

  return Response.json(
    {
      day,
      checkin: today,
      signal: fresh?.signal ?? null,
      reasons: fresh?.reasons ?? [],
      baselines: baselines(history, day),
      rest: plan?.rest ?? false,
      sessions,
      key: keySession(sessions),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
