import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { upcoming } from "@/lib/races";
import { getSupabase } from "@/lib/supabase";
import { ANALYSIS_MODEL, hasAnthropic } from "./ai";
import { labelContext } from "./labeling";
import { acwr, formState, loadSeries, monotonyStrain, rampRate, sportFitness } from "./load";

const SYSTEM = `You are an endurance-sport scientist and coach commenting on the DAILY training-load picture of a junior triathlete (swim, bike, run) who races Ironman 70.3 and triathlons.

Rules:
- Use ONLY the numbers provided. Do not invent workouts, sleep, illness or feelings.
- Explain what fitness (42-day load), fatigue (7-day load) and form (fitness minus fatigue) say TODAY, what the acute:chronic ratio and monotony add, and what to do in the next 2-3 days (train, hold back or recover), including the next race when one is close.
- Be concrete, direct and encouraging; no hype, no emojis, no medical advice. 80 to 140 words, plain text.
- Training load is estimated from session averages: say so briefly if it matters to the advice.
- Write it twice: "en" in English and "pt" in Brazilian Portuguese.`;

const SCHEMA = {
  type: "object",
  properties: { en: { type: "string" }, pt: { type: "string" } },
  required: ["en", "pt"],
  additionalProperties: false,
} as const;

const brtDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Writes (or rewrites) today's comment on fitness, fatigue and form and saves it in form_comments. */
export async function commentOnForm(): Promise<boolean> {
  if (!hasAnthropic()) return false;
  const day = brtDay();
  const { acts, profile } = await labelContext();
  const series = loadSeries(acts, profile, day);
  const now = series[series.length - 1];
  if (!now) return false;

  const ratio = acwr(series);
  const mono = monotonyStrain(series);
  const facts = {
    day,
    fitness: Math.round(now.ctl),
    fatigue: Math.round(now.atl),
    formToday: Math.round(now.tsb),
    formBand: formState(now.tsb),
    fitnessChangePerWeekLast4Weeks: Number((rampRate(series) ?? 0).toFixed(1)),
    acuteChronicRatio: ratio ? Number(ratio.ratio.toFixed(2)) : null,
    acuteChronicBand: ratio?.state ?? null,
    monotony: mono ? Number(mono.monotony.toFixed(1)) : null,
    weeklyLoadPoints: mono ? Math.round(mono.week) : null,
    last7DaysLoad: series.slice(-7).map((d) => ({ date: d.date, load: Math.round(d.tss) })),
    fitnessBySport: Object.fromEntries(Object.entries(sportFitness(acts, profile, day)).filter(([k]) => ["swim", "ride", "run"].includes(k)).map(([k, v]) => [k, Math.round(v)])),
    nextRaces: upcoming(Date.now()).slice(0, 2).map((r) => ({ name: r.name, date: r.date, daysToGo: r.days })),
  };

  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content: `Today's training-load data (JSON):\n${JSON.stringify(facts)}` }],
  });
  if (res.stop_reason === "refusal") return false;
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return false;
  const out = JSON.parse(block.text) as { en?: string; pt?: string };
  if (!out.en) return false;

  const { error } = await getSupabase()
    .from("form_comments")
    .upsert({ day, model: res.model ?? ANALYSIS_MODEL, en: out.en, pt: out.pt ?? out.en, created_at: new Date().toISOString() }, { onConflict: "day" });
  if (error) throw new Error(`Could not save the form comment: ${error.message}`);
  return true;
}
