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
4. **Dados sempre recentes:** o site se atualiza sozinho a cada **15 minutos** (ISR): quando alguém abre depois desse prazo, ele mostra a versão atual e, em segundo plano, busca o Strava de novo. Para atualizar **em segundos**, ative a sincronização instantânea (seção abaixo).
5. Domínio próprio: **Settings → Domains → Add** e crie no seu registrador os registros DNS que a Vercel mostrar.

### Sincronização instantânea (webhook do Strava)

O Strava pode avisar o site no momento em que você salva uma atividade. O site então busca os dados novos na hora (em cerca de 1 minuto você já vê o treino), sem depender de visitas e em qualquer plano da Vercel. Configure uma vez, **depois que o site estiver no ar**:

1. Gere o token de verificação (grava no `.env.local`, sem mostrar):
   ```
   node --env-file=.env.local scripts/strava-webhook.mjs prepare
   ```
2. Na Vercel (**Settings → Environment Variables**), cadastre `STRAVA_WEBHOOK_VERIFY_TOKEN` com o mesmo valor do `.env.local` e faça **Redeploy**.
3. Registre o aviso, com o endereço do seu site:
   ```
   node --env-file=.env.local scripts/strava-webhook.mjs create https://SEU-SITE.com
   ```
   Deve responder `HTTP 200` com um `id`. Para conferir depois: `... view`. Para cancelar: `... delete <id>`.

O endpoint (`/api/strava/webhook`) só aceita avisos do seu perfil, ignora rajadas e responde ao Strava em milissegundos. O intervalo de 15 min continua valendo como rede de segurança.

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
- Clima (temperatura e condição) vem do Open-Meteo (sem chave), só para treinos ao ar livre com GPS; o histórico tem ~5 dias de atraso. Carrega quando você abre "Mostrar mais gráficos".
- Frequência cardíaca: usa a FC **média de cada atividade** (não o tempo em cada zona, que exigiria baixar o detalhe de cada treino). As zonas são bpm absolutos em `heartRate.zones` no `site.config.ts`: ajuste aos seus valores.
- "Ambiente fechado" = esteira, rolo, Zwift ou piscina (atividade sem GPS ou marcada como virtual).
- Efeitos: abertura animada (só na 1ª visita da sessão) e barra de progresso na base da tela com mini atleta (desligados com "reduzir movimento" do sistema).
- "Melhor ritmo" exige distância mínima por modalidade (`rules.minDistanceForBestPace`).
- O rodapé mantém "Powered by Strava" e os créditos de mapa, por exigência dos provedores.

## Idioma (English / Português)

O site abre em **inglês** e tem o botão **EN | PT** no topo (a escolha fica salva no navegador). Todos os textos estão escritos em inglês no código; as traduções para português ficam em `lib/i18n/pt.ts`, indexadas pelo texto em inglês (o que não tiver tradução aparece em inglês). Para trocar o idioma inicial, use `defaultLang` no `site.config.ts`.

## Regras de tempo

- **Volumes e totais** (horas por semana/mês/ano, totais do topo, heatmap, divisão por esporte) usam o **tempo decorrido** (do início ao fim, com paradas).
- **Ritmo, velocidade, frequência cardíaca, cadência** e a visão de uma atividade usam o **tempo em movimento**.
- O volume inclui **todos os esportes** (natação, bike, corrida, força e outros, como caminhada); os outros esportes com GPS também aparecem no mapa.
- Período: um ano, tudo, **últimas 12 semanas** ou **personalizado** (duas datas), no topo da página.

## Potências notáveis (bike)

O cartão **Notable power outputs** mostra o **melhor valor já registrado** de potência média para 5 s, 10 s, 30 s, 1 min, 5 min, 10 min, 20 min, 1 h, 2 h e 3 h, com o pedal e a data de cada um (indoor, rolo e Zwift entram junto, marcados como "Indoor"). Só contam pedais com medidor de potência.

Enquanto a curva completa não estiver calculada, o cartão mostra, de 5 min para cima, a melhor média de pedais inteiros (marcada como "média do pedal"); de 5 s a 1 min ele fica em branco.

Para calcular a **curva de potência de 5 s a 3 h**, o Strava exige a permissão `activity:read_all` (sem ela não devolve a série de potência):

1. Autorize uma vez, no seu computador: `node scripts/strava-auth.mjs --all`. As atividades privadas continuam escondidas do site.
2. Copie o novo `STRAVA_REFRESH_TOKEN` (já gravado no `.env.local`) para a Vercel e faça Redeploy.
3. Rode `npm run strava:records` (use `npm.cmd` no PowerShell). O script respeita o limite do Strava (pausa sozinho, pode ser interrompido e retomado) e salva o progresso em `data/records-cache.json`. Depois faça commit de `data/` e `git push`.

## Filtros, temas e organização

- **Esconder valores pequenos:** os minigráficos com categorias (distribuição de distâncias, temperatura, condições do tempo, zonas de FC, rosca de tempo, lugares do mapa) têm o botão *Hide small values*. No Volume, a legenda é clicável (liga/desliga cada esporte) e há *Hide small sports*.
- **Três temas:** escuro, claro e **oceano** (azul-noite). O botão do topo alterna entre eles e a escolha fica salva. Os tokens do tema estão em `app/globals.css`.
- **Ordem das seções** (em `site.config.ts`): resumo → provas → modalidades → volume → progressão → estatísticas → FC → destaques → mapa → recentes. Cada seção tem uma linha de descrição dizendo o que mostra e qual base de tempo usa.

## Curva de potência automática (GitHub Actions)

O arquivo `.github/workflows/update-power-curve.yml` roda **todo dia às 05:15 (Brasília)**: procura pedais novos com medidor de potência, atualiza `data/` e faz o commit. O push faz a Vercel publicar o site de novo. Se não houver pedal novo, não gera commit nem deploy.

Configuração (uma vez):

1. Termine a primeira coleta no seu computador (`npm.cmd run strava:records`) e faça o commit e o push de `data/`. Enquanto `data/records-cache.json` não estiver no repositório, a rotina não faz nada, para não disputar o limite do Strava com a coleta local.
2. No GitHub, abra o repositório > **Settings > Secrets and variables > Actions > New repository secret** e crie 3 segredos, com os mesmos valores do `.env.local`: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` e `STRAVA_REFRESH_TOKEN` (o token com a permissão `activity:read_all`).
3. Para testar na hora: **Actions > Update power curve > Run workflow**.

Se um dia a rotina falhar com "falha ao renovar o token", o Strava invalidou o refresh token: rode `node scripts/strava-auth.mjs --all`, e atualize `STRAVA_REFRESH_TOKEN` no GitHub (e na Vercel).
