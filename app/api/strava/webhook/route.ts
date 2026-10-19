import { revalidateTag } from "next/cache";
import { after, type NextRequest } from "next/server";
import { dbBackfilled } from "@/lib/strava/db";
import { analyzeAndStore, hasAnthropic } from "@/lib/lab/ai";
import { commentOnForm } from "@/lib/lab/form-ai";
import { labelAndStore } from "@/lib/lab/labeling";
import { analyzeRaceOfActivity } from "@/lib/lab/race-ai";
import { getOverview } from "@/lib/strava/get-data";
import { deleteOne, syncOne } from "@/lib/strava/sync";

export const maxDuration = 60;

/**
 * Strava webhook: Strava tells the site as soon as an activity is created, edited or deleted.
 * With the database on, the activity is saved right away (1 Strava request); then the
 * "strava-live" cache is invalidated and the page warmed up, so the new workout shows in
 * seconds instead of waiting for the next 15-minute refresh.
 *
 * Como ativar (uma vez): README, seção "Sincronização instantânea".
 */

/** Evita rajadas: vários avisos seguidos viram uma só atualização. */
let lastRefresh = 0;
const MIN_GAP_MS = 20_000;

/** Validação da inscrição: o Strava manda um desafio e espera o mesmo valor de volta. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const expected = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;

  if (!expected || q.get("hub.mode") !== "subscribe" || q.get("hub.verify_token") !== expected) {
    return new Response("Forbidden", { status: 403 });
  }
  return Response.json({ "hub.challenge": q.get("hub.challenge") });
}

interface StravaEvent {
  object_type?: string;
  aspect_type?: string;
  object_id?: number;
  owner_id?: number;
}

export async function POST(request: NextRequest) {
  let event: StravaEvent;
  try {
    event = (await request.json()) as StravaEvent;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // O Strava exige resposta rápida (2 s): respondemos já e trabalhamos depois.
  const origin = request.nextUrl.origin;
  after(async () => {
    if (event.object_type !== "activity" || !event.object_id) return;

    // only accepts notices about YOUR profile (the id comes from Strava itself, via cache)
    const { athlete } = await getOverview();
    if (athlete.id && event.owner_id !== athlete.id) return;

    // 1) save the change in the database (every event, no throttling)
    try {
      if (await dbBackfilled()) {
        if (event.aspect_type === "delete") await deleteOne(event.object_id);
        else await syncOne(event.object_id);
      }
    } catch (e) {
      console.error("Webhook: could not update the database:", e);
    }

    // 2) extras for a NEW workout, each one independent: a failure in one never blocks the others
    if (event.aspect_type === "create" && (await dbBackfilled())) {
      const id = event.object_id;
      const step = async (name: string, fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch (e) {
          console.error(`Webhook: ${name} failed:`, e);
        }
      };
      // workout type name (and, if STRAVA_LABEL_WRITE is set, written back to Strava)
      await step("naming the workout", () => labelAndStore(id));
      if (hasAnthropic()) {
        // a race day: once the run (the last leg) is in, the whole triathlon is analysed
        await step("race analysis", () => analyzeRaceOfActivity(id));
        await step("workout analysis", () => analyzeAndStore(id));
        await step("form comment", () => commentOnForm());
      }
    }

    // 3) refresh the page (bursts of notices become a single refresh)
    const now = Date.now();
    if (now - lastRefresh < MIN_GAP_MS) return;
    lastRefresh = now;

    // { expire: 0 }: the next visit already gets new data (no stale copy)
    revalidateTag("strava-live", { expire: 0 });
    // warms the page and the map so the first visitor does not wait
    await Promise.allSettled([fetch(`${origin}/`), fetch(`${origin}/api/geo`)]);
  });

  return new Response("ok");
}
