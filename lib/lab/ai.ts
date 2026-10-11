import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { dbYear } from "@/lib/strava/db";
import { getSupabase } from "@/lib/supabase";
import type { Activity } from "@/lib/strava/types";
import { translate } from "@/lib/i18n/translate";
import { getLabData } from "./get-lab";
import { publishToStrava } from "./labeling";
import { buildProfile } from "./profile";
import { workoutFacts, workoutFindings } from "./workout";

type Effort = "low" | "medium" | "high";

/**
 * Model of the per-workout analysis: Haiku 5.5 at medium effort, chosen by the owner to spend as few
 * tokens as possible (about a tenth of a cent per workout). LAB_AI_MODEL / LAB_AI_EFFORT override it.
 */
export const ANALYSIS_MODEL = process.env.LAB_AI_MODEL || "claude-haiku-5-5";
export const ANALYSIS_EFFORT = (process.env.LAB_AI_EFFORT as Effort | undefined) || "medium";

/** Sessions shorter than this (warm-ups, strides, tiny strength blocks) are not worth a written analysis. */
const MIN_MINUTES = 10;

export const hasAnthropic = () => Boolean(process.env.ANTHROPIC_API_KEY);

export const SYSTEM = `You are an endurance-sport scientist and coach writing a short analysis of ONE workout for a junior triathlete (swim, bike, run) who trains for Ironman 70.3 and triathlon races.

Rules:
- Use ONLY the numbers in the data you are given. Never invent heart-rate traces, splits, weather, sleep or feelings.
- Recognise T2 and triathlon sessions: if the data has a "brick" field, say so. A run that starts 20 minutes or less after a bike ride is a T2 brick run (read its pace and heart rate as "off the bike", not as a fresh run); a swim, bike and run chained with transitions of 20 minutes or less is a complete triathlon or a full race simulation, to be judged as one effort.
- Session averages hide intervals: say so when intensity looks lower than the session probably was, and never claim to know what happened inside the session.
- Be specific and practical: what the session probably trained, what stands out compared with similar sessions, one thing to watch, and a concrete suggestion for the next 24-48 hours.
- Ground statements in accepted sports science (intensity distribution, training load, recovery); do not cite papers you are unsure about, and do not give medical advice.
- Tone: direct, encouraging, no hype, no emojis. 120 to 200 words. Plain text paragraphs, no markdown headings.
- Write the same analysis twice: "en" in English and "pt" in Brazilian Portuguese.
- "title": a cool, punchy name (never reuse any name listed in "recentTitles"; vary the wording, even for similar sessions) for the workout in English, 2 to 5 words, in sporty language, like "Threshold Grind", "Sweet Spot Surge", "Easy Does It", "Pool Cruise", "Brick City", "Rolling Thunder", "Tempo Tango", "10x400 Fire". It must be TRUE to the session: never call an easy session "Beast Mode" or a hard one "Chill". No emojis, no hashtags, no quotation marks.
- "blurb": one or two plain English sentences (at most 35 words) that summarise how the workout went, for the Strava description. Factual, no hashtags, no emojis.`;

/** JSON shapes the model must return (structured output). */
export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: { en: { type: "string" }, pt: { type: "string" }, title: { type: "string" }, blurb: { type: "string" } },
  required: ["en", "pt", "title", "blurb"],
  additionalProperties: false,
} as const;

export const BILINGUAL_SCHEMA = {
  type: "object",
  properties: { en: { type: "string" }, pt: { type: "string" } },
  required: ["en", "pt"],
  additionalProperties: false,
} as const;

/**
 * Asks a model for a JSON object (structured output) and returns it with the model that answered, or
 * null if the model refused. Server-side refusal fallbacks are used where the model supports them (not Haiku).
 */
export async function writeJson<T extends Record<string, string>>(o: {
  model: string;
  effort: Effort;
  system: string;
  user: string;
  label: string;
  schema: Record<string, unknown>;
}): Promise<(T & { model: string }) | null> {
  const client = new Anthropic();
  const base = {
    model: o.model,
    max_tokens: 16000,
    system: o.system,
    output_config: { effort: o.effort, format: { type: "json_schema" as const, schema: o.schema } },
    messages: [{ role: "user" as const, content: o.user }],
  };
  const withFallback = !/haiku/i.test(o.model);
  const res = await client.beta.messages.create(withFallback ? { ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : base);

  console.log(`AI ${o.label}: ${res.usage.input_tokens} tokens in, ${res.usage.output_tokens} out (${res.model}, effort ${o.effort})`);
  if (res.stop_reason === "refusal") return null;
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;
  const out = JSON.parse(block.text) as T;
  return { ...out, model: res.model ?? o.model };
}

/** Year of "now" in Brasília time. */
const brtYear = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));

/** The numbers handed to the writer (the AI, or a person) for ONE workout. */
export async function workoutPayload(id: number) {
  const year = brtYear();
  const acts: Activity[] = [...(await dbYear(year)), ...(await dbYear(year - 1))];
  const activity = acts.find((a) => a.id === id);
  if (!activity) return null;

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
  return { facts, athlete, reading };
}

/**
 * Writes (or rewrites) the analysis, the cool title and the short description of one workout and saves them
 * in workout_analysis. Unless `publish` is false, the title and description are also sent to Strava
 * (only when STRAVA_LABEL_WRITE is set; see publishToStrava).
 */
export async function analyzeAndStore(id: number, opts: { force?: boolean; publish?: boolean } = {}): Promise<boolean> {
  if (!hasAnthropic()) return false;

  const payload = await workoutPayload(id);
  if (!payload) return false;
  const { facts, athlete, reading } = payload;
  if (!opts.force && facts.movingMin < MIN_MINUTES) return false;

  // the last titles already given, so the new one is different
  const { data: recent } = await getSupabase().from("workout_analysis").select("details").order("created_at", { ascending: false }).limit(25);
  const recentTitles = [...new Set((recent ?? []).map((r) => (r.details as { title?: string } | null)?.title).filter((t): t is string => !!t))].slice(0, 15);

  const out = await writeJson<{ en: string; pt: string; title: string; blurb: string }>({
    model: ANALYSIS_MODEL,
    effort: ANALYSIS_EFFORT,
    system: SYSTEM,
    user: `Workout data (JSON):\n${JSON.stringify({ workout: facts, athlete, ruleBasedReading: reading, recentTitles })}`,
    label: `analysis ${id}`,
    schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!out?.en) return false;

  const title = out.title?.replace(/["“”]/g, "").trim().slice(0, 60);
  const blurb = out.blurb?.trim().slice(0, 300);
  const { error } = await getSupabase()
    .from("workout_analysis")
    .upsert(
      { activity_id: id, model: out.model, summary: out.en, details: { en: out.en, pt: out.pt ?? out.en, title, blurb }, created_at: new Date().toISOString() },
      { onConflict: "activity_id" },
    );
  if (error) throw new Error(`Could not save the analysis: ${error.message}`);

  if (opts.publish !== false) {
    try {
      await publishToStrava({ id, name: facts.name }, { title, blurb });
    } catch (e) {
      console.error("Could not write to Strava:", e);
    }
  }
  return true;
}
