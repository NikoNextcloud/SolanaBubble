"use client";
import { useEffect } from "react";

const TEXT: Record<string, string> = {
  "Price": "Цена",
  "Holders": "Притежатели",
  "24h tracked volume": "Проследен обем 24ч.",
  "Buy / Sell": "Покупки / Продажби",
  "Linked groups": "Свързани групи",
  "Ignored pools/routers": "Игнорирани pool/router адреси",
  "24h net flow": "Нетен поток 24ч.",
  "Bubble map": "Карта с балончета",
  "Transactions": "Транзакции",
  "Historical": "История",
  "linked only": "само свързани",
  "swaps": "суапове",
  "transfers": "трансфери",
  "holder": "притежател",
  "linked wallets": "свързани портфейли",
  "token flow": "поток на токена",
  "watchlist": "наблюдавани",
  "Top holders": "Най-големи притежатели",
  "Live transactions": "Транзакции на живо",
  "Historical activity": "Историческа активност",
  "Buy volume": "Обем покупки",
  "Sell volume": "Обем продажби",
  "Net flow": "Нетен поток",
  "Tracked swaps": "Проследени суапове",
  "Token overview": "Преглед на токена",
  "Live activity": "Активност на живо",
  "Watchlist": "Наблюдавани портфейли",
  "How links work": "Как работят връзките",
  "Wallet inspector": "Детайли за портфейла",
  "Label": "Етикет",
  "Balance": "Баланс",
  "Value": "Стойност",
  "% supply": "% от supply",
  "Group": "Група",
  "Funder": "Финансиращ адрес",
  "Last activity": "Последна активност",
  "P/L estimate": "Оценка P/L",
  "Connected wallets": "Свързани портфейли",
  "Wallet transactions": "Транзакции на портфейла",
  "Wallet": "Портфейл",
  "Time": "Час",
  "Side": "Тип",
  "Amount": "Количество",
};

function prettyPrice(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return "$" + n.toFixed(4);
  if (n >= 0.01) return "$" + n.toFixed(6);
  if (n >= 0.0001) return "$" + n.toFixed(8);
  return "$" + n.toPrecision(6);
}

function translate(root: ParentNode = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const raw = node.nodeValue || "";
    const trimmed = raw.trim();
    if (TEXT[trimmed]) node.nodeValue = raw.replace(trimmed, TEXT[trimmed]);
    else if (trimmed.includes(" shown")) node.nodeValue = raw.replace(" shown", " показани");
    else if (trimmed.includes("last 24h")) node.nodeValue = raw.replace("last 24h", "последни 24ч.");
    else if (trimmed.includes(" buys · ")) node.nodeValue = raw.replace(" buys · ", " покупки · ").replace(" sells", " продажби");
  }

  document.querySelectorAll<HTMLInputElement>('input[placeholder="Find wallet…"],input[placeholder="Search wallet…"]').forEach((el) => {
    el.placeholder = "Търси портфейл…";
  });
}

function addArrows() {
  document.querySelectorAll<SVGSVGElement>(".insight-map svg").forEach((svg) => {
    svg.querySelectorAll<SVGLineElement>("line").forEach((line) => {
      line.setAttribute("marker-end", "url(#flowArrow)");
    });
  });
}

function addAdminLink() {
  const bar = document.querySelector(".brand-block");
  if (!bar || bar.querySelector(".admin-nav-link")) return;
  const a = document.createElement("a");
  a.href = "/admin";
  a.className = "admin-nav-link";
  a.textContent = "База данни";
  bar.appendChild(a);
}

async function refreshPrice() {
  const m = location.pathname.match(/^\/token\/([^/]+)/);
  if (!m) return;
  try {
    const r = await fetch(`/api/tokens/${m[1]}/price`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    const text = prettyPrice(Number(j.priceUsd));
    document.querySelectorAll(".metric-strip > div").forEach((box) => {
      if (box.querySelector("span")?.textContent?.trim() === "Цена") {
        const b = box.querySelector("b");
        if (b) { b.textContent = text; b.setAttribute("title", "Актуална цена от DexScreener"); }
      }
    });
    document.querySelectorAll(".side dl").forEach((dl) => {
      const dts = Array.from(dl.querySelectorAll("dt"));
      const dt = dts.find((x) => x.textContent?.trim() === "Цена");
      if (dt?.nextElementSibling) dt.nextElementSibling.textContent = text;
    });
  } catch {}
}

export default function SiteEnhancer() {
  useEffect(() => {
    const run = () => { translate(); addArrows(); addAdminLink(); };
    run();
    refreshPrice();

    let timer = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, 40);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const priceTimer = window.setInterval(refreshPrice, 15000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      window.clearInterval(priceTimer);
    };
  }, []);
  return null;
}
