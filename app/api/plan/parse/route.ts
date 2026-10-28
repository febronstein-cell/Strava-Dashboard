import { type NextRequest } from "next/server";
import { ANALYSIS_EFFORT, ANALYSIS_MODEL, hasAnthropic, writeJson } from "@/lib/lab/ai";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import type { PlanStructure, PlanTarget } from "@/lib/lab/types";

const SYSTEM = `You turn ONE planned training session, written freely by a triathlete, into structured fields. Read only the text.

Return:
- key: true when the text marks it as a key/quality session (intervals, threshold, race pace, long session with blocks, "key"), false for easy or recovery work.
- targetType: "hr-cap" (e.g. "HR < 150", "Z2 cap 167"), "hr-range" (e.g. "HR 160-170"), "pace-range" (run or swim pace, e.g. "3:40-3:45/km"), "power-range" (watts, e.g. "280-300 W") or "none".
- targetMin, targetMax: numbers in bpm, seconds per km (a pace of 3:40/km is 220; a swim pace per 100 m times 10), or watts. For an HR cap put the cap in targetMax and 0 in targetMin. 0 when unknown.
- reps, repSeconds, repMeters, recoverySeconds: the main set (e.g. "6x1k r90''" -> reps 6, repMeters 1000, recoverySeconds 90; "5x4' r2'" -> reps 5, repSeconds 240, recoverySeconds 120). 0 when there is no set or it is unknown.
- minutes and km of the whole session when the text says them, else 0.
Never invent numbers that are not in the text.`;

const n = { type: "number" } as const;
const SCHEMA = {
  type: "object",
  properties: {
    key: { type: "boolean" },
    targetType: { type: "string", enum: ["none", "hr-cap", "hr-range", "pace-range", "power-range"] },
    targetMin: n,
    targetMax: n,
    reps: n,
    repSeconds: n,
    repMeters: n,
    recoverySeconds: n,
    minutes: n,
    km: n,
  },
  required: ["key", "targetType", "targetMin", "targetMax", "reps", "repSeconds", "repMeters", "recoverySeconds", "minutes", "km"],
  additionalProperties: false,
} as const;

interface Parsed {
  key: boolean;
  targetType: "none" | PlanTarget["type"];
  targetMin: number;
  targetMax: number;
  reps: number;
  repSeconds: number;
  repMeters: number;
  recoverySeconds: number;
  minutes: number;
  km: number;
}

/**
 * Suggests the structured fields of a planned session from its text (Haiku, cheap). Nothing is saved here: the page
 * shows the suggestion and saves it only when confirmed. Needs the planner unlock.
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  if (!hasAnthropic()) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { text?: string; sport?: string } | null;
  const text = (body?.text ?? "").trim().slice(0, 600);
  if (!text) return Response.json({ error: "Nothing to read." }, { status: 400 });

  const out = (await writeJson<Record<string, string>>({
    model: ANALYSIS_MODEL,
    effort: ANALYSIS_EFFORT === "high" ? "medium" : ANALYSIS_EFFORT,
    system: SYSTEM,
    user: `Sport: ${body?.sport ?? "unknown"}\nSession: ${text}`,
    label: "parse session",
    schema: SCHEMA as unknown as Record<string, unknown>,
  })) as unknown as Parsed | null;
  if (!out) return Response.json({ error: "The model did not answer." }, { status: 502 });

  const v = (x: number) => (x > 0 ? x : undefined);
  const target: PlanTarget | undefined = out.targetType !== "none" && (v(out.targetMin) || v(out.targetMax)) ? { type: out.targetType, min: v(out.targetMin), max: v(out.targetMax) } : undefined;
  const structure: PlanStructure | undefined = v(out.reps) || v(out.repSeconds) || v(out.repMeters)
    ? { reps: v(Math.round(out.reps)), repSeconds: v(out.repSeconds), repMeters: v(out.repMeters), recoverySeconds: v(out.recoverySeconds) }
    : undefined;
  return Response.json({ key: !!out.key, target, structure, minutes: v(out.minutes), km: v(out.km) });
}
