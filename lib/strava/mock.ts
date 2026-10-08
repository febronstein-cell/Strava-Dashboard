import type { SportKey } from "@/site.config";
import { decimate, encodePolyline, type LatLng } from "@/lib/geo";
import type { Activity, GeoActivity } from "./types";

/** PRNG determinístico (mulberry32) para o demo ser estável entre renders. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Lugares do demo (a 1ª é a "casa"). Também usados para nomear o mapa. */
export const DEMO_PLACES = [
  { name: "Florianópolis", country: "Brasil", countryCode: "BR", lat: -27.595, lng: -48.548 },
  { name: "São Paulo", country: "Brasil", countryCode: "BR", lat: -23.55, lng: -46.633 },
  { name: "Valência", country: "Espanha", countryCode: "ES", lat: 39.47, lng: -0.376 },
  { name: "Bariloche", country: "Argentina", countryCode: "AR", lat: -41.133, lng: -71.31 },
];

function loop(center: LatLng, km: number, rand: () => number): LatLng[] {
  const pts: LatLng[] = [];
  const r = km / 6.5 / 111; // raio aproximado em graus
  const rot = rand() * Math.PI * 2;
  const squash = 0.5 + rand() * 0.6;
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const wob = 1 + 0.18 * Math.sin(3 * t + rot);
    const x = Math.cos(t) * r * wob;
    const y = Math.sin(t) * r * squash * wob;
    pts.push([
      center[0] + (x * Math.cos(rot) - y * Math.sin(rot)),
      center[1] + (x * Math.sin(rot) + y * Math.cos(rot)),
    ]);
  }
  return pts;
}

export function generateDemoYear(year: number, today: Date): { activities: Activity[]; geo: GeoActivity[] } {
  const rand = rng(year * 7919);
  const activities: Activity[] = [];
  const geo: GeoActivity[] = [];
  let id = year * 100000;
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Math.min(Date.UTC(year, 11, 31), today.getTime()));

  const plan: Record<number, SportKey[]> = {
    1: ["run", "swim"],
    2: ["ride", "strength"],
    3: ["run", "swim"],
    4: ["swim", "strength"],
    5: ["ride"],
    6: ["ride"],
    0: ["run"],
  };
  const growth = 0.55 + (year - 2020) * 0.12; // evolui ano a ano

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    const month = d.getUTCMonth();
    const form = Math.min(1.25, (0.7 + (month / 11) * 0.5) * growth);
    // fins de semana de viagem (prova/treino fora)
    const trip = dow === 6 && (month === 4 || month === 9) && d.getUTCDate() < 8 ? (month === 4 ? 2 : 1) : 0;
    const place = trip ? DEMO_PLACES[trip] : DEMO_PLACES[0];

    for (const sport of plan[dow]) {
      if (rand() < 0.14) continue;
      const hour = sport === "strength" ? 18 : 5 + Math.floor(rand() * 13);
      const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(hour)}:${pad(Math.floor(rand() * 60))}:00`;
      let distance = 0;
      let speed = 1;
      let elevation = 0;
      let name: string;
      const long = dow === 6 || (sport === "run" && dow === 0);
      let race = false;

      if (sport === "run") {
        distance = (long ? 12000 + rand() * 10000 : 5000 + rand() * 5000) * form;
        speed = 1000 / (340 - rand() * 50 - month * 3 - (year - 2020) * 6);
        elevation = distance * (0.005 + rand() * 0.01);
        name = long ? "Longão de domingo" : ["Corrida leve", "Tiros na pista", "Rodagem matinal"][Math.floor(rand() * 3)];
        if (trip && dow === 6) {
          race = true;
          name = "Meia Maratona";
          distance = 21097;
        }
      } else if (sport === "ride") {
        distance = (long ? 60000 + rand() * 60000 : 30000 + rand() * 25000) * form;
        speed = 6.6 + rand() * 2.2 + month * 0.05 + (year - 2020) * 0.1;
        elevation = distance * (0.008 + rand() * 0.012);
        name = long ? "Pedal longo de sábado" : ["Pedal de base", "Intervalado na bike", "Rolê de recuperação"][Math.floor(rand() * 3)];
      } else if (sport === "swim") {
        distance = (1500 + rand() * 2000) * Math.min(form, 1.1);
        speed = 100 / (125 - rand() * 20 - month - (year - 2020) * 2);
        name = ["Treino técnico", "Série de 400m", "Nado contínuo"][Math.floor(rand() * 3)];
      } else {
        name = ["Treino de força", "Core e mobilidade", "Perna + glúteo"][Math.floor(rand() * 3)];
      }
      distance = Math.round(distance);
      const movingTime = sport === "strength" ? Math.round(2400 + rand() * 1800) : Math.round(distance / speed);

      // ao ar livre (com trajeto) ou ambiente fechado (esteira, rolo, piscina)
      const outdoor = sport === "run" || sport === "ride" ? rand() > 0.18 : sport === "swim" ? rand() < 0.15 : false;
      const hr =
        sport === "run"
          ? 138 + (speed - 3.2) * 40 + (rand() - 0.5) * 22
          : sport === "ride"
            ? 128 + (speed - 7.5) * 6 + (rand() - 0.5) * 20
            : sport === "strength"
              ? 105 + rand() * 20
              : 0;

      const act: Activity = {
        id: id++,
        name,
        sport,
        date,
        distance,
        movingTime,
        elevation: Math.round(elevation),
        ...(race ? { race: true } : {}),
        ...(sport !== "strength" && !outdoor ? { indoor: true } : {}),
        ...(hr ? { hr: Math.round(hr), hrMax: Math.round(hr + 14 + rand() * 18) } : {}),
      };
      activities.push(act);

      // trajeto: só corrida/bike ao ar livre e uma parte da natação (águas abertas)
      if (outdoor) {
        const center: LatLng = [
          place.lat + (rand() - 0.5) * 0.12,
          place.lng + (rand() - 0.5) * 0.12,
        ];
        const pts = decimate(loop(center, Math.max(distance / 1000, 0.8), rand), 60);
        geo.push({
          id: act.id,
          sport,
          year,
          date,
          distance,
          lat: Math.round(pts[0][0] * 1e4) / 1e4,
          lng: Math.round(pts[0][1] * 1e4) / 1e4,
          line: encodePolyline(pts),
        });
      }
    }
  }
  activities.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { activities, geo };
}
