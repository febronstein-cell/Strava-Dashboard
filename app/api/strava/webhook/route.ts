import { revalidateTag } from "next/cache";
import { after, type NextRequest } from "next/server";
import { getOverview } from "@/lib/strava/get-data";

export const maxDuration = 60;

/**
 * Webhook do Strava: ele avisa o site assim que uma atividade é criada, editada ou
 * apagada. Aqui só invalidamos o cache "strava-live" e aquecemos a página, então o
 * site mostra o treino novo em segundos (e não em até 15 min).
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
    if (event.object_type !== "activity") return;

    // só aceita avisos sobre o SEU perfil (o ID vem do próprio Strava, via cache)
    const { athlete } = await getOverview();
    if (athlete.id && event.owner_id !== athlete.id) return;

    const now = Date.now();
    if (now - lastRefresh < MIN_GAP_MS) return;
    lastRefresh = now;

    // { expire: 0 }: o próximo acesso já busca dado novo (nada de servir o antigo)
    revalidateTag("strava-live", { expire: 0 });
    // aquece a página e o mapa para o primeiro visitante não esperar
    await Promise.allSettled([fetch(`${origin}/`), fetch(`${origin}/api/geo`)]);
  });

  return new Response("ok");
}
