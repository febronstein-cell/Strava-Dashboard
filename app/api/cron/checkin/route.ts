import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { importCheckins } from "@/lib/checkin-import";

export const maxDuration = 60;

/**
 * Morning import of the watch data (Vercel Cron at about 7:00 and 9:00 America/Sao_Paulo, see vercel.json; the
 * second run catches data that synced late). If CRON_SECRET is set the call must carry it.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  if (!process.env.GARMIN_API_KEY && !process.env.INTERVALS_API_KEY) return Response.json({ skipped: "no provider configured" });
  try {
    const log = await importCheckins();
    revalidateTag("strava-live", { expire: 0 });
    return Response.json(log);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
