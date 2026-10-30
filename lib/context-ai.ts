import "server-only";
import { matchWeek } from "@/lib/compliance";
import { sanitizeDraft, DRAFT_SCHEMA, type Draft } from "@/lib/context-interpret";
import { labelContext } from "@/lib/lab/labeling";
import { hasAnthropic, writeJson } from "@/lib/lab/ai";
import { mondayOf } from "@/lib/lab/progress";
import { sanitizeDays } from "@/lib/lab/plan";
import { plannedRef } from "@/lib/session-status";
import { getSupabase } from "@/lib/supabase";

/** The note is read by Sonnet at low effort: a short structured answer, a couple of cents. CONTEXT_MODEL overrides it. */
const MODEL = process.env.CONTEXT_MODEL || "claude-sonnet-5-5";

const SYSTEM = `You read ONE short note a triathlete wrote about something that happened (illness, stomach problems, pain, bad sleep, stress, travel, anything) and turn it into structured data. You also receive the sessions planned for that day and the activities Strava recorded.

Hard rules:
- Use ONLY what the note says. Never diagnose. Never invent a symptom, a cause, a condition or a time. If the note does not say it, leave it empty ("" or 0).
- "causeStated" is only a cause the athlete wrote, in their own words (for example "acai before running"). It is not a diagnosis. If they did not state a cause, leave it "".
- "severity" from 1 to 5 comes ONLY from the wording: how strong, how long, whether training stopped. 1 = barely noticeable, 3 = clearly bothered, 4 = had to stop or skip training, 5 = severe, could not function. Do not raise it for words the athlete did not use.
- Event "type": GI (stomach or bowel), illness (cold, fever, flu), injury_pain (a pain or injury), fatigue, sleep, stress, travel, other. Give one event per distinct problem. "bodyArea" only when named or obvious (the stomach for a stomach problem), otherwise "".
- "tags": 1 to 4 short lowercase context tags taken from the note (for example "post-gym", "before-run", "meal", "heat", "travel"). No tags that are not in the note.
- "onset" and "end": only when the note gives a time, as YYYY-MM-DDTHH:mm using the date given; otherwise "".
- "impacts": one entry per planned session that the note says was cut, skipped, changed or done anyway. Use the plannedRef given for that session. status: done, partial (started and stopped or cut short), skipped (not started), changed (swapped or replaced). percentDone: for partial compute it from the minutes the athlete or Strava gives against the planned minutes (for example 20 of 85 minutes is 24); skipped is 0. reasonTag: GI, illness, injury, pain, fatigue, sleep, stress, travel, work, weather, other. note: a short neutral line quoting the athlete's wording for anything sensitive. If a skipped or cut session is not in the plan, use plannedRef "".
- Do not give medical advice. Do not use em dashes in any text.
- Write the "summary" and "note" text in the SAME language as the note: English if the note is in English, Portuguese if it is in Portuguese. Never any other language, even if the note has a word from another language (for example a food name).`;

/** What the model is shown: the note, the day's planned sessions (with their references) and the Strava activities. */
export async function dayContext(date: string) {
  const week = mondayOf(date);
  const [{ acts }, { data: row }] = await Promise.all([labelContext(), getSupabase().from("training_weeks").select("planned_sessions").eq("week_start", week).maybeSingle()]);
  const days = sanitizeDays(row?.planned_sessions);
  const matched = days ? matchWeek(days, week, acts) : [];
  const day = matched.find((d) => d.date === date);
  const planned = (day?.entries ?? []).map((e) => ({
    plannedRef: plannedRef(week, e.day, e.slot),
    sport: e.entry.sport,
    name: e.entry.name ?? "",
    description: e.entry.description,
    plannedMinutes: e.entry.minutes ?? 0,
    key: !!e.entry.key,
  }));
  const activities = acts
    .filter((a) => a.date.slice(0, 10) === date)
    .map((a) => ({ sport: a.sport, name: a.name, start: a.date.slice(0, 16), elapsedMin: Math.round(a.elapsedTime / 60), km: Math.round(a.distance / 100) / 10 }));
  return { planned, activities, restDay: day?.rest ?? false };
}

/** Reads a note. Returns the draft (nothing is stored here), or null when there is no AI key or the model refuses. */
export async function interpretNote(note: string, date: string): Promise<{ draft: Draft; context: Awaited<ReturnType<typeof dayContext>> } | null> {
  if (!hasAnthropic()) return null;
  const context = await dayContext(date);
  const out = await writeJson<Record<string, string>>({
    model: MODEL,
    effort: "low",
    system: SYSTEM,
    user: `Date of the note: ${date}\n\nNote:\n${note}\n\nContext (JSON):\n${JSON.stringify(context)}`,
    label: "context note",
    schema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!out) return null;
  return { draft: sanitizeDraft(out, context.planned.map((p) => p.plannedRef)), context };
}
