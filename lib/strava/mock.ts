import type { SportKey } from "@/site.config";
import type { Activity } from "./types";

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

/** Gera um ano plausível de treinos de triatleta, até hoje. */
export function generateDemoActivities(year: number, today: Date): Activity[] {
  const rand = rng(year);
  const out: Activity[] = [];
  let id = 1;
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Math.min(Date.UTC(year, 11, 31), today.getTime()));

  const plan: Record<number, SportKey[]> = {
    1: ["run", "swim"], // seg
    2: ["ride"],
    3: ["run", "swim"],
    4: ["swim"],
    5: ["ride"],
    6: ["ride"], // sáb: longão
    0: ["run"], // dom
  };

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    const month = d.getUTCMonth();
    const form = 0.7 + (month / 11) * 0.5; // forma cresce ao longo do ano
    for (const sport of plan[dow]) {
      if (rand() < 0.14) continue; // dia perdido
      const hour = 5 + Math.floor(rand() * 13);
      const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(hour)}:${pad(Math.floor(rand() * 60))}:00`;
      let distance: number, speed: number, elevation: number, name: string;
      const long = dow === 6 || (sport === "run" && dow === 0);

      if (sport === "run") {
        distance = (long ? 12000 + rand() * 10000 : 5000 + rand() * 5000) * form;
        speed = 1000 / (330 - rand() * 50 - month * 3); // ~5:30 → ~4:40 /km
        elevation = distance * (0.005 + rand() * 0.01);
        name = long ? "Longão de domingo" : ["Corrida leve", "Tiros na pista", "Rodagem matinal"][Math.floor(rand() * 3)];
      } else if (sport === "ride") {
        distance = (long ? 60000 + rand() * 60000 : 30000 + rand() * 25000) * form;
        speed = 6.8 + rand() * 2.2 + month * 0.05; // m/s
        elevation = distance * (0.008 + rand() * 0.012);
        name = long ? "Pedal longo de sábado" : ["Pedal de base", "Intervalado na bike", "Rolê de recuperação"][Math.floor(rand() * 3)];
      } else {
        distance = (1500 + rand() * 2000) * Math.min(form, 1.1);
        speed = 100 / (125 - rand() * 20 - month * 1); // ~2:05 → ~1:40 /100m
        elevation = 0;
        name = ["Treino técnico", "Série de 400m", "Nado contínuo"][Math.floor(rand() * 3)];
      }
      distance = Math.round(distance);
      out.push({
        id: id++,
        name,
        sport,
        date,
        distance,
        movingTime: Math.round(distance / speed),
        elevation: Math.round(elevation),
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
