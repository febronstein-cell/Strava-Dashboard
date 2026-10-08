#!/usr/bin/env node
/**
 * Autorização ÚNICA com o Strava (rode localmente, uma vez).
 *
 *   npm run strava:auth
 *
 * O que faz:
 *  1. Lê STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET do .env.local
 *  2. Abre a tela de autorização do Strava no navegador
 *  3. Recebe o `code` em http://localhost:8721/callback
 *  4. Troca o code por tokens e grava STRAVA_REFRESH_TOKEN no .env.local
 *
 * Nada é impresso no terminal além de mensagens de status: o refresh token
 * vai direto para o .env.local (que está no .gitignore).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

const PORT = 8721;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
// activity:read = atividades públicas + "só seguidores". Não expõe as privadas.
// Troque por "read,activity:read_all" se quiser incluir as privadas.
const SCOPE = "read,activity:read";
const ENV_PATH = path.resolve(process.cwd(), ".env.local");

function readEnvFile() {
  return fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
}

function getVar(content, key) {
  const m = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

function setVar(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  return content + (content && !content.endsWith("\n") ? "\n" : "") + line + "\n";
}

const env = readEnvFile();
const clientId = getVar(env, "STRAVA_CLIENT_ID");
const clientSecret = getVar(env, "STRAVA_CLIENT_SECRET");

if (!clientId || !clientSecret) {
  console.error(
    "\nFaltam STRAVA_CLIENT_ID e/ou STRAVA_CLIENT_SECRET no .env.local.\n" +
      "Copie .env.example para .env.local, preencha os dois valores e rode de novo.\n",
  );
  process.exit(1);
}

const authUrl =
  "https://www.strava.com/oauth/authorize?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope: SCOPE,
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const grantedScope = url.searchParams.get("scope") ?? "";

  const finish = (status, html, exitCode) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<body style="font-family:system-ui;padding:3rem;background:#0b0b0c;color:#eee">${html}</body>`);
    setTimeout(() => {
      server.close();
      process.exit(exitCode);
    }, 300);
  };

  if (error || !code) {
    console.error(`\nAutorização negada ou falhou (${error ?? "sem code"}).`);
    return finish(400, "<h2>Autorização cancelada.</h2><p>Pode fechar esta aba.</p>", 1);
  }
  if (!grantedScope.includes("activity:read")) {
    console.error("\nVocê desmarcou a permissão de ler atividades. Rode de novo e mantenha-a marcada.");
    return finish(400, "<h2>Permissão de atividades não concedida.</h2><p>Rode o script de novo.</p>", 1);
  }

  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(`HTTP ${tokenRes.status}`);
    const tokens = await tokenRes.json();

    fs.writeFileSync(ENV_PATH, setVar(readEnvFile(), "STRAVA_REFRESH_TOKEN", tokens.refresh_token));

    const who = tokens.athlete ? `${tokens.athlete.firstname} ${tokens.athlete.lastname}` : "atleta";
    console.log(`\n✔ Autorizado como ${who}. STRAVA_REFRESH_TOKEN salvo em .env.local.`);
    console.log("  Agora é só rodar: npm run dev\n");
    finish(200, "<h2>Pronto! ✔</h2><p>Refresh token salvo no .env.local. Pode fechar esta aba.</p>", 0);
  } catch (e) {
    console.error(`\nFalha ao trocar o code por tokens: ${e.message}`);
    finish(500, "<h2>Erro ao obter os tokens.</h2><p>Veja o terminal.</p>", 1);
  }
});

server.listen(PORT, () => {
  console.log("\nAbrindo o Strava para autorizar o app...");
  console.log("Se o navegador não abrir, copie e cole este link:\n");
  console.log(authUrl + "\n");
  const opener =
    process.platform === "win32" ? `start "" "${authUrl}"` : process.platform === "darwin" ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
  exec(opener, () => {});
});
