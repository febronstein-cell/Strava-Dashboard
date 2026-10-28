import "server-only";
import { labelContext } from "@/lib/lab/labeling";
import { withRpe } from "@/lib/rpe";
import { readRpeData } from "@/lib/rpe-data";

/**
 * The activities for anything that computes training load (form comment, coach summary): the last two years with the
 * session RPE attached and the manual sessions added. (labelContext stays Strava-only: it names and writes to Strava.)
 */
export async function loadContext() {
  const [ctx, data] = await Promise.all([labelContext(), readRpeData()]);
  return { ...ctx, acts: withRpe(ctx.acts, data.rpe, data.manual) };
}
