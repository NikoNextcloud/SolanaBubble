export async function alert(text: string) {
  const t = process.env.TELEGRAM_BOT_TOKEN, c = process.env.TELEGRAM_CHAT_ID;
  if (!t || !c) return;
  await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: c, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}
export const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
