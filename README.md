# Solana Bubbles — Live Holder Intelligence

Real-time Solana token holder map (Bubble Map), подобно на GMGN по концепция:
живи балончета за всеки wallet, BUY/SELL анимации, вероятни wallet clusters и Telegram alerts.

## Архитектура

```
Solana → Helius (Enhanced Webhook) → Next.js API route (/api/webhooks/helius)
                                         ↓
                                   lib/ingest.ts (парсва delta, клъстеринг, alert-и)
                                         ↓
                                Supabase PostgreSQL (holdings, transactions, wallet_links)
                                         ↓
                                Supabase Realtime  →  Next.js client  →  Live Bubble Map (SVG + d3-force)
                                         ↘
                                     Telegram Bot (alerts)
```

Няма browser polling на blockchain данни — цялото on-chain ingestion е server-side
(Helius webhook → Vercel serverless function → Supabase). Браузърът само слуша
Supabase Realtime и рисува.

## Структура на проекта

```
app/
  page.tsx                     — начална страница, въвеждане на token address
  token/[mint]/page.tsx        — страницата с картата
  api/tokens/bootstrap/route.ts— начално зареждане на всички holders (admin-защитено)
  api/webhooks/helius/route.ts — приема live транзакции от Helius
  globals.css
components/
  BubbleMap.tsx                — d3-force force-directed граф, рендериран в SVG, Realtime subscribe
lib/
  helius.ts     — DAS getTokenAccounts (holders), getTokenSupply, funder евристика, цена от Dexscreener
  ingest.ts     — обработка на транзакция → holdings delta → alert-и → clustering
  cluster.ts    — union-find clustering (funder / timing signals)
  bootstrap.ts  — първоначално зареждане на токен
  telegram.ts   — изпращане на alert съобщения
  db.ts / supabase-browser.ts — Supabase клиенти (service role / anon)
scripts/bootstrap.ts           — CLI: npm run bootstrap -- <MINT>
supabase/migrations/0001_init.sql — цялата DB схема + RLS + realtime publication
```

## Data модел

- **tokens** — mint, symbol, supply, decimals, текуща цена.
- **holdings** — текущ баланс, USD стойност, % от supply, `cluster_id`, `funder`,
  натрупани `bought_usd`/`sold_usd` (за приблизителен P/L). Ред изчезва при EXIT (balance → 0).
- **transactions** — пълна история на buy/sell/transfer по wallet, за странична колона с детайли.
- **wallet_links** — открити връзки (`funder` = общ финансиращ wallet; `timing` = ≥2 покупки
  в прозорец от 10 секунди). `computeClusters()` прави union-find върху тези линкове.

  **Важно (посочено изрично в брифа):** клъстерите се показват като *вероятна*
  on-chain връзка, никога като доказателство за обща собственост. Това е изписано
  директно в UI под панела с детайли.

## Quick deploy: GitHub → Vercel → Supabase

Проектът е готов за трите платформи "from zero":

```bash
# 1) GitHub — качи repo-то
git init && git add . && git commit -m "init"
git remote add origin git@github.com:<user>/solana-bubbles.git
git push -u origin main
```

```bash
# 2) Vercel — засича Next.js автоматично (vercel.json вече казва framework: nextjs)
npx vercel link      # свързва папката с нов/съществуващ Vercel проект
npx vercel env pull  # (по-късно, след като добавиш env variables от стъпка 3-4 по-долу)
```
Или просто: Vercel Dashboard → "Import Project" → избери GitHub repo-то → deploy.
Vercel build-ва при всеки push към `main` автоматично; `.github/workflows/ci.yml`
пуска `typecheck` + `build` на всеки push/PR, независимо от Vercel, за да хванеш грешки по-рано.

```bash
# 3) Supabase — или през CLI, или през Dashboard (виж пълните стъпки по-долу)
npx supabase login
npx supabase link --project-ref <твоя-project-ref>
npx supabase db push          # прилага supabase/migrations/0001_init.sql
```

### 4. Env variables — общо между двете платформи
Всичко от `.env.example` трябва да е зададено на **две места**:
- локално: `.env.local` (никога не се комитва — виж `.gitignore`)
- в Vercel: Project → Settings → Environment Variables (за Production + Preview)

### Детайлни стъпки по платформа

### 1. Supabase
1. Нов проект в supabase.com.
2. SQL Editor → изпълни `supabase/migrations/0001_init.sql`.
3. Копирай `Project URL`, `anon key`, `service_role key`.

### 2. Helius
1. helius.dev → API key (Free tier е достатъчен за тест на 1 токен).
2. Dashboard → Webhooks → Create Webhook:
   - Type: **Enhanced**
   - Transaction types: `SWAP`, `TRANSFER`
   - Account addresses: остави празно първоначално (ще добавиш mint адреса на токена след bootstrap; Helius webhook-ите филтрират по адрес, затова добави token mint-а тук)
   - Webhook URL: `https://<твоя-domain>.vercel.app/api/webhooks/helius`
   - Auth header: генерирай random secret → сложи го и в `HELIUS_WEBHOOK_SECRET`

### 3. Env variables
Копирай `.env.example` → `.env.local` (локално) и попълни същите в Vercel → Project → Settings → Environment Variables.

### 4. Инсталация и bootstrap
```bash
npm install
npm run bootstrap -- <TOKEN_MINT_ADDRESS>   # зарежда всички текущи holders в Supabase
npm run dev
```
Отвори `http://localhost:3000`, въведи mint адреса → картата се зарежда с текущите holders
и след това слуша Realtime за живи промени (щом Helius webhook-ът започне да праща).

### 5. Deploy (Vercel)
```bash
vercel
```
Задай env variables в Vercel dashboard, после сложи `HELIUS_WEBHOOK_SECRET` и Vercel URL-а
обратно в Helius webhook конфигурацията.

### 6. Telegram bot (по избор)
1. @BotFather → `/newbot` → вземи token → `TELEGRAM_BOT_TOKEN`.
2. Пиши на бота, после `https://api.telegram.org/bot<TOKEN>/getUpdates` → вземи `chat.id` → `TELEGRAM_CHAT_ID`.
3. Прагове: `ALERT_BIG_TRADE_USD`, `ALERT_WHALE_PCT` в `.env`.

## Добавяне на нов токен

```bash
curl -X POST https://<domain>/api/tokens/bootstrap \
  -H "content-type: application/json" -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"mint":"<NEW_MINT>"}'
```
После добави mint адреса към account addresses списъка на Helius webhook-а, за да получаваш
live транзакции и за него. Схемата е multi-token by design (всичко е ключирано по `token_mint`);
API route-ите вече поддържат произволен брой токени — версия 1 просто те насочва да тестваш с един.

## Известни ограничения / бъдещи стъпки

- **Funder евристика** използва Helius `/v0/addresses/{addr}/transactions` (последните 100) —
  за много стари wallet-и може да пропусне реалния funder отвъд тоя прозорец. За production
  бих преминал на пълно индексиране на native transfers чрез Bitquery streaming.
- **P/L** е приблизителен (сумарни bought/sold USD от момента на bootstrap нататък);
  не включва история отпреди първото зареждане на токена.
- **Timing clustering** е проста евристика (≥2 съвпадения в 10s прозорец); за по-точни
  клъстери добави graph clustering (Louvain) върху пълната wallet_links таблица.
- Bubble Map рендерира до 500 най-големи holders на страница (`MAX_NODES` в `BubbleMap.tsx`)
  за performance; увеличи внимателно — force simulation е O(n²) без допълнителна оптимизация.
