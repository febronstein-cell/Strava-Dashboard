/**
 * Strava names every workout by itself when you do not type a title ("Morning Run", "Corrida da tarde",
 * "Treino ao entardecer"...). Only those automatic titles are replaced by the cool name from the AI;
 * a title you wrote yourself is never changed. Isomorphic (runs on the server and in the browser).
 */

const PERIOD_EN = "(Morning|Early Morning|Afternoon|Evening|Lunch|Night)";
const SPORT_EN = "(Run|Ride|Swim|Walk|Hike|Workout|Weight Training|Virtual Ride|Virtual Run|Trail Run|Gravel Ride|Mountain Bike Ride)";
const PERIOD_PT = "(matinal|da manhã|da tarde|vespertin[ao]|ao entardecer|noturn[ao]|da noite|na hora do almoço|ao meio-dia|de madrugada)";
const SPORT_PT = "(Corrida|Pedalada|Natação|Treino|Musculação|Caminhada|Trilha|Caminhada na esteira|Corrida na esteira|Pedalada virtual|Corrida virtual|Pedal)";

const DEFAULT_EN = new RegExp(`^${PERIOD_EN} ${SPORT_EN}$`, "i");
const DEFAULT_PT = new RegExp(`^${SPORT_PT} ${PERIOD_PT}$`, "i");

export function isDefaultTitle(name: string): boolean {
  const n = name.trim();
  return DEFAULT_EN.test(n) || DEFAULT_PT.test(n);
}
