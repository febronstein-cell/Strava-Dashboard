import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { dbYear } from "@/lib/strava/db";
import { getSupabase } from "@/lib/supabase";
import type { Activity } from "@/lib/strava/types";
import { translate } from "@/lib/i18n/translate";
import { getLabData } from "./get-lab";
import { buildProfile } from "./profile";
import { workoutFacts, workoutFindings } from "./workout";

/** The analysis model. Opus-class: the text is short, so the cost per workout is a few cents at most. */
export const ANALYSIS_MODEL = "claude-opus-5-5";

export const hasAnthropic = () => Boolean(process.env.ANTHROPIC_API_KEY);

const SYSTEM = `You are an endurance-sport scientist and coach writing a short analysis of ONE workout for a junior triathlete (swim, bike, run) who trains for Ironman 70.3 and triathlon races.

Rules:
- Use ONLY the numbers in the data you are given. Never invent heart-rate traces, splits, weather, sleep or feelings.
- Session averages hide intervals: say so when intensity looks lower than the session probably was, and never claim to know what happened inside the session.
- Be specific and practical: what the session probably trained, what stands out compared with similar sessions, one thing to watch, and a concrete suggestion for the next 24-48 hours.
- Ground statements in accepted sports science (intensity distribution, training load, recovery); do not cite papers you are unsure about, and do not give medical advice.
- Tone: direct, encouraging, no hype, no emojis. 120 to 200 words. Plain text paragraphs, no markdown headings.
- Write the same analysis twice: "en" in English and "pt" in Brazilian Portuguese.`;

const SCHEMA = {
  type: "object",
  properties: { en: { type: "string" }, pt: { type: "string" } },
  required: ["en", "pt"],
  additionalProperties: false,
} as const;

/** Year of "now" in Brasília time. */
const brtYear = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));

/** Writes (or rewrites) the analysis of one workout and saves it in the workout_analysis table. */
export async function analyzeAndStore(id: number): Promise<boolean> {
  if (!hasAnthropic()) return false;

  const year = brtYear();
  const acts: Activity[] = [...(await dbYear(year)), ...(await dbYear(year - 1))];
  const activity = acts.find((a) => a.id === id);
  if (!activity) return false;

  const lab = await getLabData();
  const profile = buildProfile(lab.thresholds, acts, lab.power);
  const facts = workoutFacts(activity, acts, profile);
  const reading = workoutFindings(facts).map((f) => translate("en", f.text, f.vars));

  const athlete = {
    ftpW: profile.ftp?.value ?? null,
    weightKg: profile.weight_kg?.value ?? null,
    lthrBpm: profile.lthr?.value ?? null,
    maxHrBpm: profile.max_hr?.value ?? null,
    runThresholdPaceSecPerKm: profile.run_threshold_pace?.value ?? null,
    run3kPaceSecPerKm: profile.run_3k_pace?.value ?? null,
  };

  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: `Workout data (JSON):\n${JSON.stringify({ workout: facts, athlete, ruleBasedReading: reading })}`,
      },
    ],
  });

  if (res.stop_reason === "refusal") return false;
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return false;
  const out = JSON.parse(block.text) as { en?: string; pt?: string };
  if (!out.en) return false;

  const { error } = await getSupabase()
    .from("workout_analysis")
    .upsert(
      { activity_id: id, model: res.model ?? ANALYSIS_MODEL, summary: out.en, details: { en: out.en, pt: out.pt ?? out.en }, created_at: new Date().toISOString() },
      { onConflict: "activity_id" },
    );
  if (error) throw new Error(`Could not save the analysis: ${error.message}`);
  return true;
}
