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

## 4. Deploy na Vercel (automático)

1. Suba o projeto para o GitHub (o `.env.local` fica de fora) e importe o repositório em <https://vercel.com/new> (Framework: Next.js, sem mudar nada).
2. Em **Settings → Environment Variables**, cadastre `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` e `STRAVA_REFRESH_TOKEN` (valores do `.env.local`, marcados como Sensitive) e faça **Redeploy**.
3. **Sempre a versão mais nova:** com o GitHub conectado, **todo `git push` na branch `main` gera um deploy de produção sozinho**. Confira em **Settings → Git**: *Production Branch = main*. Pushes em outras branches geram só links de pré-visualização.
4. **Dados sempre recentes:** o site se atualiza sozinho a cada **1 hora** (ISR). Quando alguém abre o site depois de 1 h, ele mostra a versão atual e, em segundo plano, busca o Strava de novo; a visita seguinte já vê os dados novos. Uma atividade nova aparece em até ~1 h (+1 visita). Não precisa de cron nem de novo deploy.
5. Domínio próprio: **Settings → Domains → Add** e crie no seu registrador os registros DNS que a Vercel mostrar.

**Se os dados pararem de atualizar:** veja **Logs** do projeto na Vercel. Se aparecer "falha ao renovar o token", o Strava invalidou o refresh token: rode `node scripts/strava-auth.mjs` no seu computador, copie o novo `STRAVA_REFRESH_TOKEN` para a Vercel e faça Redeploy. Enquanto isso o site continua no ar com os últimos dados.

## Estrutura

```
site.config.ts            ← textos, cores, próxima meta, provas, seções, privacidade do mapa
app/                      ← layout (fontes, tema), globals.css (THEME TOKENS), page.tsx, api/geo
lib/strava/               ← client (OAuth + API), get-data (cache), geo-summary, geocode, mock, types
lib/stats.ts, format.ts   ← agregações (semana/mês/dia, recordes) e formatação
components/Dashboard.tsx  ← casca: período escolhido, cabeçalho, seções, rodapé
components/sections/      ← cada seção da página + registry.tsx
components/               ← GeoMap, Heatmap, BarChart, VolumeChart, ActivityDialog, Splash...
scripts/                  ← strava-auth.mjs (autorização única), copy-maplibre-worker.mjs
```

## Personalização (tudo em `site.config.ts`)

- **Próximas provas**: `upcomingRaces` (nome, local, `date: "AAAA-MM-DD"`). A mais próxima vira destaque com contagem regressiva; as que já passaram somem sozinhas.
- **Apelido e @**: `nickname` e `handle`.
- **Sobre**: `about.body` + `enabled: true` na seção `about`.
- **Cores**: `sports` (4 modalidades), `brand` (destaque geral) e `goalColor` (provas e meta).
- **Ordem/visibilidade das seções**: `sections`. Nova seção: crie em `components/sections/`, registre em `registry.tsx`.
- **Privacidade do mapa**: `geo.privacy.home` + `radiusKm` escondem o trecho perto de casa. Desligado por padrão.
- **Paleta/raio/modo claro**: bloco `THEME TOKENS` em `app/globals.css`. **Fontes**: `app/layout.tsx`.

## Como os dados funcionam

- Histórico completo, desde o ano em que sua conta Strava foi criada (ou `startYear`).
- Cache por ano: o ano corrente atualiza a cada 1 h; anos passados a cada 1 dia. O 1º carregamento é lento (~30 s); depois é instantâneo.
- Só natação, bike, corrida e força entram. Atividades **virtuais/rolo/manuais** (ex.: Zwift) contam nos totais, mas **não aparecem no mapa**.
- Nomes de cidades vêm do OpenStreetMap (Nominatim), com cache longo. Mapa-base: Esri (sem chave de API).
- "Melhor ritmo" exige distância mínima por modalidade (`rules.minDistanceForBestPace`).
- O rodapé mantém "Powered by Strava" e os créditos de mapa, por exigência dos provedores.
