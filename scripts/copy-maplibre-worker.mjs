/**
 * Copia o worker do MapLibre para /public/maplibre.
 * O empacotador não consegue localizar esse arquivo sozinho (MapLibre 6 + Turbopack),
 * então o servimos como arquivo estático e apontamos com `setWorkerUrl`.
 * Roda automaticamente antes de `npm run dev` e `npm run build`.
 */
import fs from "node:fs";
import path from "node:path";

const src = path.resolve("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
const destDir = path.resolve("public/maplibre");

if (!fs.existsSync(src)) {
  console.warn("[maplibre] worker não encontrado; rode `npm install` primeiro.");
  process.exit(0);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, "maplibre-gl-worker.mjs"));
console.log("[maplibre] worker copiado para public/maplibre/");
