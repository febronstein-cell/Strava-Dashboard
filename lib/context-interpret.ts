import { BODY_AREAS, EVENT_TYPES, REASON_TAGS, type EventType, type ReasonTag } from "@/lib/context-config";
import type { SessionState } from "@/lib/session-status";

/**
 * What the AI hands back for a note, and the checks every draft goes through (the AI's and the one the athlete
 * edits). Pure. Hard rules: never a diagnosis, nothing the athlete did not say, no em dashes in any text.
 */

export interface DraftEvent {
  type: EventType;
  /** a body area from the list, or "" */
  bodyArea: string;
  /** 1 to 5, inferred only from the wording */
  severity: number;
  /** only what the athlete stated, in their words; "" when none */
  causeStated: string;
  tags: string[];
  /** YYYY-MM-DDTHH:mm or "" */
  onset: string;
  end: string;
  /** one neutral line, no diagnosis */
  summary: string;
}

export interface DraftImpact {
  /** index of the event in the draft this impact belongs to */
  eventIndex: number;
  /** the planned entry (week:day:slot) or "" when it is not in the plan */
  plannedRef: string;
  sport: string;
  status: SessionState;
  /** 0 to 100 */
  percentDone: number;
  reasonTag: ReasonTag;
  note: string;
  plannedMinutes: number;
}

export interface Draft {
  events: DraftEvent[];
  impacts: DraftImpact[];
}

const SPORTS = ["run", "ride", "swim", "strength", "other"];
const STATES: SessionState[] = ["done", "partial", "skipped", "changed"];

/** No em dashes in anything generated or shown: they become a comma and a space. */
export const noEmDash = (s: string) => s.replace(/\s*[—]\s*/g, ", ").replace(/―/g, "-");

const text = (v: unknown, max: number) => noEmDash(typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const when = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(v.trim()) ? v.trim().slice(0, 16) : "");

/**
 * Cleans a draft from any source. `validRefs` are the planned entries of the day: a reference that is not one of
 * them is dropped (the server then tries to match by sport). Returns the draft with every field inside its range.
 */
export function sanitizeDraft(input: unknown, validRefs: string[] = []): Draft {
  const raw = (input ?? {}) as { events?: unknown[]; impacts?: unknown[] };
  const events: DraftEvent[] = (Array.isArray(raw.events) ? raw.events : []).slice(0, 6).map((e) => {
    const x = (e ?? {}) as Record<string, unknown>;
    const type = EVENT_TYPES.includes(x.type as EventType) ? (x.type as EventType) : "other";
    const area = typeof x.bodyArea === "string" ? x.bodyArea.trim().toLowerCase() : "";
    return {
      type,
      bodyArea: (BODY_AREAS as readonly string[]).includes(area) ? area : "",
      severity: Math.round(num(x.severity, 1, 5, 3)),
      causeStated: text(x.causeStated, 240),
      tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => text(t, 24).toLowerCase()).filter(Boolean).slice(0, 6),
      onset: when(x.onset),
      end: when(x.end),
      summary: text(x.summary, 240),
    };
  });
  const impacts: DraftImpact[] = (Array.isArray(raw.impacts) ? raw.impacts : []).slice(0, 12).map((i) => {
    const x = (i ?? {}) as Record<string, unknown>;
    const status = STATES.includes(x.status as SessionState) ? (x.status as SessionState) : "skipped";
    const sport = SPORTS.includes(String(x.sport)) ? String(x.sport) : "other";
    const pct = Math.round(num(x.percentDone, 0, 100, status === "skipped" ? 0 : status === "done" ? 100 : 50));
    return {
      eventIndex: Math.min(Math.max(0, events.length - 1), Math.round(num(x.eventIndex, 0, 5, 0))),
      plannedRef: typeof x.plannedRef === "string" && validRefs.includes(x.plannedRef) ? x.plannedRef : "",
      sport,
      status,
      percentDone: status === "skipped" ? 0 : status === "done" ? 100 : pct,
      reasonTag: REASON_TAGS.includes(x.reasonTag as ReasonTag) ? (x.reasonTag as ReasonTag) : "other",
      note: text(x.note, 240),
      plannedMinutes: Math.round(num(x.plannedMinutes, 0, 1440, 0)),
    };
  });
  return { events, impacts };
}

/** The JSON schema the model must follow (structured output). Strings are "" and numbers 0 when unknown. */
export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...EVENT_TYPES] },
          bodyArea: { type: "string", enum: ["", ...BODY_AREAS] },
          severity: { type: "integer", enum: [1, 2, 3, 4, 5] },
          causeStated: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          onset: { type: "string" },
          end: { type: "string" },
          summary: { type: "string" },
        },
        required: ["type", "bodyArea", "severity", "causeStated", "tags", "onset", "end", "summary"],
        additionalProperties: false,
      },
    },
    impacts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          eventIndex: { type: "integer" },
          plannedRef: { type: "string" },
          sport: { type: "string", enum: SPORTS },
          status: { type: "string", enum: STATES },
          percentDone: { type: "integer" },
          reasonTag: { type: "string", enum: [...REASON_TAGS] },
          note: { type: "string" },
          plannedMinutes: { type: "integer" },
        },
        required: ["eventIndex", "plannedRef", "sport", "status", "percentDone", "reasonTag", "note", "plannedMinutes"],
        additionalProperties: false,
      },
    },
  },
  required: ["events", "impacts"],
  additionalProperties: false,
} as const;

/** What the event type says about the planned sessions' reason tag, when the model gives none. */
export const reasonOfType = (t: EventType): ReasonTag => (t === "GI" ? "GI" : t === "illness" ? "illness" : t === "injury_pain" ? "pain" : t === "fatigue" ? "fatigue" : t === "sleep" ? "sleep" : t === "stress" ? "stress" : t === "travel" ? "travel" : "other");
