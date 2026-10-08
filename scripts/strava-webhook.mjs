#!/usr/bin/env node
/**
 * Gerencia a inscrição do webhook do Strava (sincronização instantânea).
 *
 *   node --env-file=.env.local scripts/strava-webhook.mjs prepare
 *   node --env-file=.env.local scripts/strava-webhook.mjs create https://SEU-SITE.com
 *   node --env-file=.env.local scripts/strava-webhook.mjs view
 *   node --env-file=.env.local scripts/strava-webhook.mjs delete <id>
 *
 * O app do Strava só pode ter UMA inscrição. O site precisa estar no ar, com a variável
 * STRAVA_WEBHOOK_VERIFY_TOKEN cadastrada, antes do `create` (o Strava testa o endereço).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const API = "https://www.strava.com/api/v3/push_subscriptions";
const ENV_PATH = path.resolve(process.cwd(), ".env.local");
const [cmd, arg] = process.argv.slice(2);
const e = process.env;

function need(...keys) {
  const missing = keys.filter((k) => !e[k]);
  if (missing.length) {
    console.error(`Faltam no .env.local: ${missing.join(", ")}. Rode com: node --env-file=.env.local scripts/...`);
    process.exit(1);
  }
}

async function show(res) {
  const text = await res.text();
  let body = text;
  try {
    body = JSON.stringify(JSON.parse(text), null, 2);
  } catch {}
  console.log(`HTTP ${res.status}\n${body}`);
  if (!res.ok) process.exit(1);
}

if (cmd === "prepare") {
  // gera o token de verificação e grava no .env.local (sem imprimir o valor)
  const content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  if (/^STRAVA_WEBHOOK_VERIFY_TOKEN=.+$/m.test(content)) {
    console.log("STRAVA_WEBHOOK_VERIFY_TOKEN já existe no .env.local. Nada a fazer.");
  } else {
    const token = crypto.randomBytes(24).toString("hex");
    const line = `STRAVA_WEBHOOK_VERIFY_TOKEN=${token}`;
    const next = /^STRAVA_WEBHOOK_VERIFY_TOKEN=.*$/m.test(content)
      ? content.replace(/^STRAVA_WEBHOOK_VERIFY_TOKEN=.*$/m, line)
      : content + (content && !content.endsWith("\n") ? "\n" : "") + line + "\n";
    fs.writeFileSync(ENV_PATH, next);
    console.log("✔ STRAVA_WEBHOOK_VERIFY_TOKEN gerado e salvo no .env.local.");
  }
  console.log("Agora copie esse valor para a Vercel (Settings → Environment Variables), faça Redeploy e rode o `create`.");
} else if (cmd === "create") {
  need("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_WEBHOOK_VERIFY_TOKEN");
  if (!arg || !/^https:\/\//.test(arg)) {
    console.error("Informe o endereço do site com https://, ex.: create https://meusite.com");
    process.exit(1);
  }
  const callback = arg.replace(/\/$/, "") + "/api/strava/webhook";
  await show(
    await fetch(API, {
      method: "POST",
      body: new URLSearchParams({
        client_id: e.STRAVA_CLIENT_ID,
        client_secret: e.STRAVA_CLIENT_SECRET,
        callback_url: callback,
        verify_token: e.STRAVA_WEBHOOK_VERIFY_TOKEN,
      }),
    }),
  );
} else if (cmd === "view") {
  need("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET");
  await show(await fetch(`${API}?client_id=${e.STRAVA_CLIENT_ID}&client_secret=${e.STRAVA_CLIENT_SECRET}`));
} else if (cmd === "delete") {
  need("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET");
  if (!arg) {
    console.error("Informe o id da inscrição (veja com `view`).");
    process.exit(1);
  }
  await show(
    await fetch(`${API}/${arg}?client_id=${e.STRAVA_CLIENT_ID}&client_secret=${e.STRAVA_CLIENT_SECRET}`, { method: "DELETE" }),
  );
} else {
  console.log("Uso: prepare | create <https://site> | view | delete <id>");
  process.exit(cmd ? 1 : 0);
}
