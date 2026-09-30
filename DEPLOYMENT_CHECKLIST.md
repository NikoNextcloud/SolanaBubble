# Checklist за пускане в production

- [ ] Supabase проект създаден, миграция изпълнена, RLS policies потвърдени
- [ ] `SUPABASE_SERVICE_ROLE_KEY` е зададен само server-side (Vercel env), никога в клиентски код
- [ ] Helius API key + Enhanced Webhook сочи към `/api/webhooks/helius`
- [ ] `HELIUS_WEBHOOK_SECRET` съвпада между Helius auth header и Vercel env
- [ ] `ADMIN_SECRET` е дълъг random string, пазен извън repo
- [ ] `npm run bootstrap -- <mint>` изпълнен поне за първия токен
- [ ] Mint адресът е добавен в "Account Addresses" на Helius webhook-а
- [ ] Telegram bot token/chat id тествани с реален alert
- [ ] Vercel function timeout: `/api/tokens/bootstrap` е сложено на maxDuration 300s (Pro план за >60s; на Hobby ще спре на 60s — bootstrap на голям holder списък тогава по-добре да се пусне локално с `npm run bootstrap`)
- [ ] Проверено поведение при рестарт: Realtime subscribe се възстановява (виж `live` индикатора в HUD)
