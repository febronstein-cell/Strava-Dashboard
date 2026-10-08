# Strava em números

Dashboard pessoal de triathlon (natação · bike · corrida) feito com **Next.js (App Router) + TypeScript + Tailwind**, alimentado pela API oficial do Strava.

- Público e somente leitura: mostra **só os seus dados**.
- Os dados são buscados **no servidor** e ficam em cache por **1 hora** (`cacheLife` em `lib/strava/get-data.ts`), respeitando o rate limit do Strava (100 req/15 min, 1000/dia).
- Sem credenciais, o site abre com **dados de demonstração** (faixa "Dados de demonstração" no topo).

## 1. Criar o app no Strava e pegar as credenciais

1. Entre em <https://www.strava.com/settings/api> (logado na sua conta).
2. Preencha o formulário **My API Application**:
   - **Application Name**: ex. `Meu Dashboard`
   - **Category**: `Data Importer` (ou outra)
   - **Website**: pode ser `http://localhost:3000` por enquanto (depois, a URL da Vercel)
   - **Authorization Callback Domain**: `localhost`  ← importante para o script de autorização
   - Envie uma imagem de ícone qualquer.
3. Salvar. A página mostra **Client ID** (número) e **Client Secret** (clique em "show").
4. Copie o `.env.example` e preencha:

   ```bash
   cp .env.example .env.local   # no Windows PowerShell: Copy-Item .env.example .env.local
   ```

   ```env
   STRAVA_CLIENT_ID=12345
   STRAVA_CLIENT_SECRET=abcdef...
   ```

   > Nunca commite o `.env.local` (já está no `.gitignore`) nem cole o secret em chat/código.

## 2. Autorizar uma única vez (script local)

```bash
npm run strava:auth
```

O script abre o Strava no navegador → você clica em **Autorizar** → ele captura o código em `http://localhost:8721/callback`, troca por tokens e **grava `STRAVA_REFRESH_TOKEN` no `.env.local`**. Escopo pedido: `read,activity:read` (atividades públicas e "só seguidores"; **as privadas não entram**).

> Se o Strava reclamar do domínio de callback, confirme que o campo "Authorization Callback Domain" é exatamente `localhost`.

A partir daí o site se atualiza sozinho: a cada renovação ele troca o refresh token por um access token novo (válido 6 h), sem você logar de novo.

## 3. Rodar localmente

```bash
npm install
npm run dev        # http://localhost:3000
```

Para testar como em produção (build + cache de 1 h): `npm run build && npm start`.

## 4. Deploy na Vercel

1. Suba o projeto para um repositório no GitHub (o `.env.local` fica de fora).
2. Em <https://vercel.com/new> importe o repositório (Framework: Next.js, sem mudar nada).
3. Em **Settings → Environment Variables**, cadastre `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` e `STRAVA_REFRESH_TOKEN` (mesmos valores do `.env.local`).
4. Deploy. Depois, no Strava, atualize o **Website** do app para a URL da Vercel (o callback domain `localhost` continua só para o script local).

## Estrutura

```
site.config.ts            ← textos, cores por modalidade, ordem/visibilidade das seções
app/                      ← layout (fontes), globals.css (THEME TOKENS), page.tsx
lib/strava/               ← client (OAuth + API), get-data (cache 1h), mock (demo), types
lib/stats.ts, format.ts   ← agregações (semana/mês/dia, recordes) e formatação
components/sections/      ← cada seção da página + registry.tsx
components/               ← CountUp, Reveal, VolumeChart, Heatmap, ThemeToggle...
scripts/strava-auth.mjs   ← autorização única
```

## Personalização

- **Texto, cores das modalidades, ordem das seções**: `site.config.ts`.
- **Paleta, raio, modo claro/escuro**: bloco `THEME TOKENS` em `app/globals.css`.
- **Fontes**: `app/layout.tsx`.
- **Seção nova**: crie o componente em `components/sections/`, registre em `registry.tsx` e inclua em `siteConfig.sections`. Já existem espaços reservados (`about`, `races`, `custom`), desligados por padrão.

## Observações

- Só entram natação, bike e corrida (incluindo trail, virtual, gravel, e-bike). Outras atividades são ignoradas.
- "Melhor ritmo" exige distância mínima por modalidade (`rules.minDistanceForBestPace`), para um sprint de 200 m não virar recorde.
- Por exigência do Strava, o rodapé mantém "Powered by Strava".
