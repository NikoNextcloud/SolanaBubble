"use client";
import { useEffect, useMemo, useState } from "react";

const TABLES = [
  ["tokens", "Токени"],
  ["holdings", "Активни притежатели"],
  ["exited_holders", "Излезли притежатели"],
  ["transactions", "Транзакции"],
  ["wallet_links", "Връзки между портфейли"],
  ["wallet_edges", "Потоци между портфейли"],
  ["network_swaps", "Мрежови суапове"],
] as const;

type Table = (typeof TABLES)[number][0];

function rowKey(table: Table, row: any) {
  if (table === "tokens") return row.mint;
  if (table === "holdings") return `${row.token_mint}:${row.wallet}`;
  if (table === "exited_holders") return String(row.id);
  if (table === "transactions") return `${row.signature}:${row.wallet}:${row.token_mint}`;
  if (table === "network_swaps") return row.signature;
  if (table === "wallet_links") return `${row.token_mint}:${row.wallet_a}:${row.wallet_b}:${row.kind}`;
  return `${row.token_mint}:${row.from_wallet}:${row.to_wallet}:${row.kind}`;
}

function filtersFor(table: Table, row: any) {
  if (table === "tokens") return { mint: row.mint };
  if (table === "holdings") return { token_mint: row.token_mint, wallet: row.wallet };
  if (table === "exited_holders") return { id: row.id };
  if (table === "transactions") return { signature: row.signature, wallet: row.wallet, token_mint: row.token_mint };
  if (table === "network_swaps") return { signature: row.signature };
  if (table === "wallet_links") return { token_mint: row.token_mint, wallet_a: row.wallet_a, wallet_b: row.wallet_b, kind: row.kind };
  return { token_mint: row.token_mint, from_wallet: row.from_wallet, to_wallet: row.to_wallet, kind: row.kind };
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [table, setTable] = useState<Table>("tokens");
  const [mint, setMint] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => {
    setSecret(sessionStorage.getItem("solanabubble:admin-secret") || "");
  }, []);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows.slice(0, 20)) Object.keys(row).forEach((k) => keys.add(k));
    return [...keys].slice(0, 10);
  }, [rows]);

  const authHeaders = () => ({ "x-admin-secret": secret });

  async function load(nextTable = table) {
    if (!secret) { setStatus("Въведи ADMIN_SECRET."); return; }
    setBusy(true); setStatus("Зареждане…");
    sessionStorage.setItem("solanabubble:admin-secret", secret);
    const qs = new URLSearchParams({ table: nextTable, limit: "100" });
    if (mint.trim()) qs.set("mint", mint.trim());
    const r = await fetch(`/api/admin/data?${qs}`, { headers: authHeaders(), cache: "no-store" });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setStatus(j.error === "unauthorized" ? "Невалиден ADMIN_SECRET." : `Грешка: ${j.error}`); return; }
    setRows(j.rows || []); setCount(j.count || 0); setStatus("");
  }

  async function loadUsage() {
    if (!secret) return;
    const r = await fetch("/api/admin/usage", { headers: authHeaders(), cache: "no-store" });
    const j = await r.json();
    if (r.ok) setUsage(j);
  }

  async function purgeAll() {
    if (!confirm("Това ще изтрие ВСИЧКИ записани данни, но ще запази таблиците, схемата, RLS правилата, миграциите и настройките. Продължаваме ли?")) return;
    const phrase = prompt('Напиши ИЗТРИЙ ВСИЧКО за потвърждение.');
    if (phrase !== "ИЗТРИЙ ВСИЧКО") return;
    setBusy(true);
    const r = await fetch("/api/admin/data", {
      method: "DELETE",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ purgeAll: true }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setStatus(`Грешка: ${j.error}`); return; }
    setRows([]); setCount(0); setUsage(null);
    setStatus("Всички данни са изчистени безопасно. Структурата на базата е запазена.");
  }

  return <main className="admin-page">
    <header className="admin-header">
      <div><a href="/" className="brand">SolanaBubble</a><h1>Управление на базата данни</h1></div>
      <a href="/" className="admin-back">← Начална страница</a>
    </header>

    <section className="admin-controls">
      <label><span>ADMIN_SECRET</span><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Администраторска тайна" /></label>
      <label className="admin-mint"><span>Филтър по mint</span><input value={mint} onChange={(e) => setMint(e.target.value)} placeholder="Solana mint адрес (по избор)" /></label>
      <button onClick={() => { load(); loadUsage(); }} disabled={busy}>Обнови</button>
      <button className="danger" onClick={purgeAll} disabled={busy || !secret}>Изчисти всички данни</button>
    </section>

    <section className="usage-cards">
      <div>
        <span>Solscan оставащи CU</span>
        <b>{usage?.solscan?.remaining_cus != null ? Number(usage.solscan.remaining_cus).toLocaleString() : "—"}</b>
        <small>{usage?.solscanError ? `Грешка: ${usage.solscanError}` : usage?.solscan?.renew_date ? `Обновяване: ${new Date(usage.solscan.renew_date).toLocaleDateString("bg-BG")}` : "Натисни Обнови"}</small>
      </div>
      <div>
        <span>Solscan CU използвани</span>
        <b>{usage?.solscan?.usage_cus != null ? Number(usage.solscan.usage_cus).toLocaleString() : "—"}</b>
        <small>{usage?.solscan?.total_requests_24h != null ? `${Number(usage.solscan.total_requests_24h).toLocaleString()} заявки / 24ч.` : "—"}</small>
      </div>
      <div>
        <span>Helius наблюдаван трафик</span>
        <b>{usage?.helius?.observedSwaps24h != null ? Number(usage.helius.observedSwaps24h).toLocaleString() : "—"}</b>
        <small>on-chain swaps, записани от нас за 24ч.</small>
      </div>
      <div>
        <span>Helius оставащи кредити</span>
        <b>—</b>
        <small>{usage?.helius?.note || "Helius не дава надежден публичен usage endpoint за точния остатък."}</small>
      </div>
    </section>

    <nav className="admin-tabs">
      {TABLES.map(([key, label]) => <button key={key} className={table === key ? "active" : ""} onClick={() => { setTable(key); load(key); }}>{label}</button>)}
    </nav>

    <div className="admin-status">{status || `Общо записи: ${count}`}</div>

    <section className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={rowKey(table, row)}>
          {columns.map((c) => <td key={c} title={String(row[c] ?? "")}>{typeof row[c] === "object" ? JSON.stringify(row[c]) : String(row[c] ?? "")}</td>)}
        </tr>)}</tbody>
      </table>
    </section>

    <p className="admin-note">ADMIN_SECRET се пази само в sessionStorage на този браузърен таб. Единственият бутон за изтриване премахва само редовете с данни. Таблиците, схемата, миграциите, RLS правилата и environment настройките остават непокътнати.</p>
  </main>;
}
