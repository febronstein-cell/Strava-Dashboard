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

## Banco de dados (Supabase)

Com o banco ligado, o site **não baixa mais o histórico do Strava a cada build/atualização**: as atividades ficam numa tabela do Supabase e o Strava só é consultado de forma incremental (evita o erro 429).

1. Crie um projeto no Supabase e rode `supabase/schema.sql` no SQL Editor (tabelas `activities`, `power_curve`, `races`, `training_weeks`, `thresholds`, `sync_state`; RLS ligado, sem políticas — só o servidor acessa).
2. Coloque `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (chave **secret**, nunca no navegador) no `.env.local` **e** nas variáveis da Vercel.
3. Teste a conexão: `npm run supabase:check`.
4. Importe todo o histórico uma única vez: `npm run strava:backfill` (~11 chamadas ao Strava; pode rodar de novo quando quiser, não duplica).

Depois disso: o webhook salva/atualiza/apaga **uma** atividade no banco assim que o Strava avisa, e a cada ~10 min o site busca só o que mudou nos últimos dias. Sem as variáveis do Supabase (ou antes do backfill) o site volta sozinho ao modo antigo, lendo direto do Strava. Atividades marcadas como "Somente eu" também entram (para excluí-las, use `STRAVA_INCLUDE_PRIVATE=false`). As tabelas `races`, `training_weeks` e `thresholds` já existem para as futuras abas de provas, plano de treino e limiares.

## Lab (página separada `/lab`)

Uma página à parte, sem mexer no painel principal (link "Lab" no topo e no rodapé), com seis abas (mais um planejador escondido):

- **My Machine**: FTP, LTHR, FC máxima, limiar de corrida, CSS de natação, LT1/LT2/VT1/VT2 (FC, potência, ritmo), zonas de FC, potência e ritmo, perfil de potência e histórico de testes. O que vem de um teste real aparece em verde; o resto é **estimado** (ou vem das suas zonas) e vem rotulado.
- **Form & Load**: forma física (CTL), fadiga (ATL) e frescor (TSB) estimados com potência (bike), ritmo vs. limiar (corrida e natação), FC ou duração; relação carga aguda:crônica, monotonia e strain (Foster), forma física por modalidade e as referências científicas usadas.
- **Progression**: últimos 3 meses, 6 meses ou 1 ano contra o período anterior, com leituras em texto (volume, eficiência de corrida e de bike, potência, distribuição de intensidade polarizada/piramidal, consistência).
- **Race builds**: plano automático para cada prova futura, em pop-up: ciclo de **12 semanas para 70.3** e **16 para Ironman completo** (mais curto se o volume já estiver subindo), 3 semanas de carga : 1 de recuperação, pico e polimento conforme a distância, e a previsão do frescor na manhã da prova. Para fixar quando o ciclo de uma prova começou (por exemplo, o início de um aumento grande de volume), use `cycleStart: "2026-08-03"` na prova em `upcomingRaces` do `site.config.ts`; as semanas já feitas mostram só o realizado e o pico é calculado a partir delas.
- **Races**: cada triathlon vira **um resultado só**: natação, T1, bike, T2 e corrida do dia são agrupados pelo horário e pelas distâncias do formato (sprint, olímpico, 70.3, Ironman), deixando o aquecimento de fora. Mostra tempo total, parciais, transições, ritmo nas voltas (primeira vs. segunda metade) e uma análise da prova inteira escrita pela IA (Sonnet, esforço baixo, uma vez por prova). É **automático**: provas cadastradas em `upcomingRaces` com `format: "70.3"` (etc.) e triathlons completos que você fizer (reconhecidos por marcação de prova ou nome da etapa) aparecem sozinhos e o webhook/rotina diária escreve a análise. Vale **a partir de `lab.racesFrom`** no `site.config.ts` (hoje 2026-10-18, o Ironman 70.3 Florianópolis); provas anteriores não são mexidas. Refazer uma análise: `/api/lab/analyze?task=race&date=2026-10-18&force=1` com `npm run dev`.
- **Workout analysis**: escolha qualquer treino e veja intensidade, carga, comparação com treinos parecidos e a análise escrita pela IA.

Seus dados reais entram pelo Supabase (Table Editor), sem mexer no código:

1. Rode `supabase/schema-lab.sql` no SQL Editor (pode rodar de novo quando o arquivo mudar): libera LT1/LT2/VT1/VT2, testes de 3 km e 2 milhas, tempo de 10 km e peso na tabela `thresholds`.
2. `thresholds`: um teste por linha (`kind`, `test_date`, `value`, `unit`; exemplos no começo do arquivo SQL).
3. `races`: provas passadas com tempo final e parciais. `training_weeks`: horas planejadas de cada semana (segunda-feira), que substituem a meta automática.
4. `power_curve` é copiada de `data/records.json` por `npm run power:to-db` (a Action diária também faz isso se `SUPABASE_URL` e `SUPABASE_SECRET_KEY` estiverem nos *secrets* do GitHub).

**Planejador do ano (com código):** o botão **Planner** (no cabeçalho, no rodapé, no botão flutuante do celular e nas abas do Lab) pede a chave de edição e só abre o planejador (`/lab#planner-hq`, página `noindex`; o trecho do endereço fica em `lab.planHash`) depois que o servidor confirma a chave. Sem a chave a aba do planejador fica bloqueada. Monta o **ano inteiro** a partir das provas de `upcomingRaces` (campos `priority` A/B/C e `format`): ciclo de 6, 8, 12 ou 16 semanas por formato, base, construção, pico, polimento, semana da prova e recuperação, 3:1 de carga e descanso, e blocos de base entre os ciclos. Semanas de segunda a domingo; cada dia tem **5 blocos** (corrida, bike, natação, força e um extra para outro esporte no mesmo dia), cada um com descrição e tempo (h:mm); corrida, bike e natação também têm distância. Um dia pode ser marcado como descanso. Cada dia mostra as **horas do dia** e a semana mostra o total em horas e por modalidade. Salva sozinho. As semanas **completas** do planejador também aparecem na aba **Race builds** (barras cheias, "do seu planejador"), no lugar da meta automática, e acompanham o que você edita sem recarregar; semanas só parcialmente preenchidas não contam. Quando todos os dias estão preenchidos, a IA (Haiku, esforço médio) **analisa a semana e dá o rótulo** (Base, Build, Speed, Peak, Lighter, Taper, Race ou Recovery) a partir do que está nela: treinos principais, frequência por modalidade, distribuição, e comparando com as suas últimas 8 semanas reais e com a preparação da prova anterior (a que tem `cycleStart`). O rótulo vem do conteúdo da semana, não do modelo da temporada; se os dois divergirem, o cartão mostra "O modelo da temporada esperava: …" e a análise diz o que ajustar. Só **edita** quem tem a chave: defina `PLAN_EDIT_KEY` na Vercel (e no `.env.local`), faça um novo deploy e digite a chave no campo "Edit key" e clique em Unlock: o servidor confere (`/api/plan/verify`) e só então libera a edição (a chave certa fica só no seu navegador). Sem a chave a página é somente leitura.

**Análise por IA:** coloque `ANTHROPIC_API_KEY` no `.env.local` e nas variáveis da Vercel (nunca no código). Cada treino **novo** é analisado uma única vez pelo webhook e o texto (inglês e português) fica na tabela `workout_analysis`; os visitantes só leem, então não geram custo. Para treinos antigos, com `npm run dev` aberto: `http://localhost:3000/api/lab/analyze?last=10` (essa rota não existe em produção).

**Comentário diário de forma e fadiga:** a aba Form & Load mostra um comentário curto escrito pelo Claude sobre forma física, fadiga e frescor do dia. Ele é regravado automaticamente depois de cada treino novo (mesma chave `ANTHROPIC_API_KEY`); sem a chave, a aba mostra só os números.

**Modelos e custo (escolhidos para gastar o mínimo):** a análise de cada treino usa o **Haiku 5.5 com esforço médio** (cerca de US$ 0,001 por treino) e o comentário diário de forma/fadiga usa o **Sonnet 5.5 com esforço baixo** (cerca de 1 centavo por comentário). Para trocar: `LAB_AI_MODEL`, `LAB_AI_EFFORT` (low, medium ou high) e `LAB_FORM_MODEL` no `.env.local` e na Vercel. Treinos com menos de 10 minutos não são analisados e o comentário diário é refeito no máximo a cada 4 horas.

**É automático?** Sim, de dois jeitos: (1) o webhook do Strava faz tudo assim que um treino novo chega (nome do tipo de treino, detecção de prova, análise e comentário do dia); (2) uma rotina diária da Vercel (`vercel.json`, `/api/cron/lab`, às 22:00 UTC) pega o que o webhook tenha perdido nos últimos 2 dias. Só trabalha no que falta, então chamar de novo não custa nada. Se quiser proteger a rota, defina `CRON_SECRET` na Vercel (ela envia sozinha).

**Nome do tipo de treino ("Sweet Spot 3x15'", "10x400m VO2", "Z2 endurance ride", "Long run"...):** aparece abaixo de cada atividade em *Recent activities* (sempre em inglês). Cada treino novo é nomeado uma vez pelo webhook, usando a potência segundo a segundo (bike), a velocidade (corrida) ou as parciais (natação) mais seus limiares. Para treinos antigos, com `npm run dev` aberto: `http://localhost:3000/api/lab/analyze?task=label&last=30` (cerca de 1 requisição ao Strava por treino; `&dry=1` só mostra os nomes). **Nomes e descrição no Strava (opcional, automático):** junto com a análise, a IA dá ao treino um nome do tipo do treino e da série, em inglês ("VO2max Effort 5x4'", "Sweet Spot 3x15'", "Threshold Run 4x8'", "Tempo Run", "Long Run", "Z2 Endurance Ride", "Strength Session"), e uma descrição de uma ou duas frases. **Regras fixas no código:** (1) nunca altera uma atividade cujo título você escreveu (nem título nem descrição), só troca títulos que o Strava inventou ("Morning Run", "Corrida da tarde"); (2) só bike, corrida e musculação (natação, treinos "Workout" de transição ou cardio e o resto ficam como estão); (3) só atividades com mais de 15 minutos; (4) nunca repete a linha "Workout type". No site, o nome aparece no lugar de títulos padrão em *Recent activities* e o tipo técnico fica na linha verde. Para ligar: `npm.cmd run strava:auth -- --write` (permissão de editar atividades), atualizar o `STRAVA_REFRESH_TOKEN` (.env.local, Vercel e GitHub) e definir `STRAVA_LABEL_WRITE=smart` (qualquer valor liga). Só vale para treinos **novos**; para os dos últimos dias, com `npm run dev` aberto: `/api/lab/analyze?task=publish&days=7`.


**Atividades "Somente eu":** entram no site por padrão (precisam do escopo `activity:read_all`). Para deixá-las de fora: `STRAVA_INCLUDE_PRIVATE=false`.

**No celular:** o Lab tem cabeçalho compacto, abas com rolagem lateral, gráficos com rolagem horizontal e toque, limiares em cartões e rolagem automática até o detalhe de um treino.

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
