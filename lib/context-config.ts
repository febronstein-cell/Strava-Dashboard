/**
 * Every threshold of the Context Log lives here, in one place, so it is easy to change.
 * The signal can only be kept or lowered by an event, never raised (see lib/context-signal.ts).
 */

export const EVENT_TYPES = ["GI", "illness", "injury_pain", "fatigue", "sleep", "stress", "travel", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const REASON_TAGS = ["GI", "illness", "injury", "pain", "fatigue", "sleep", "stress", "travel", "work", "weather", "other"] as const;
export type ReasonTag = (typeof REASON_TAGS)[number];

export const BODY_AREAS = ["stomach", "head", "throat", "chest", "back", "hip", "knee", "calf", "shin", "achilles", "foot", "hamstring", "quad", "shoulder", "whole body", "other"] as const;

/** The red-flag checklist of the follow-up. Any one of them forces a red signal and the medical message. */
export const RED_FLAGS = ["fever", "blood", "repeated_vomiting", "fainting", "severe_pain", "cannot_keep_fluids"] as const;
export type RedFlag = (typeof RED_FLAGS)[number];

export const CONTEXT_CONFIG = {
  /** The follow-up scale: 1 to this value, the top meaning "back to normal". */
  scaleMax: 10,
  /** The event closes by itself after this score or better on this many consecutive days. */
  closeAtScore: 9,
  closeAfterConsecutiveDays: 2,
  /** After this many open days, suggest seeing a doctor. */
  doctorAfterOpenDays: 5,
  /**
   * Signal by the latest recovery answer (score from 1 to scaleMax). Above `normalFrom`: no change.
   * `capFrom` to below `normalFrom`: green, but cap the intensity of the next key session (a note).
   * `yellowFrom` to below `capFrom`, or a worsening trend: yellow. Below `yellowFrom`: red.
   */
  recovery: { normalFrom: 9, capFrom: 7, yellowFrom: 4 },
  /** Until the first follow-up answer, the signal follows the severity (1 to 5) the event was written with. */
  severityBeforeFirstAnswer: { 1: null, 2: null, 3: null, 4: "yellow", 5: "red" } as Record<number, "yellow" | "red" | null>,
};
