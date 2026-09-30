"use client";
import { useEffect, useMemo, useState } from "react";

const TABLES = [
  ["tokens", "Токени"],
  ["holdings", "Активни притежатели"],
  ["exited_holders", "Излезли притежатели"],
  ["transactions", "Транзакции"],
  ["wallet_links", "Връзки между портфейли"],
  ["wallet_edges", "Потоци между портфейли"],
] as const;

type Table = (typeof TABLES)[number][0];

function rowKey(table: Table, row: any) {
  if (table === "tokens") return row.mint;
  if (table === "holdings") return `${row.token_mint}:${row.wallet}`;
  if (table === "exited_holders") return String(row.id);
  if (table === "transactions") return `${row.signature}:${row.wallet}:${row.token_mint}`;
  if (table === "wallet_links") return `${row.token_mint}:${row.wallet_a}:${row.wallet_b}:${row.kind}`;
  return `${row.token_mint}:${row.from_wallet}:${row.to_wallet}:${row.kind}`;
}

function filtersFor(table: Table, row: any) {
  if (table === "tokens") return { mint: row.mint };
  if (table === "holdings") return { token_mint: row.token_mint, wallet: row.wallet };
  if (table === "exited_holders") return { id: row.id };
  if (table === "transactions") return { signature: row.signature, wallet: row.wallet, token_mint: row.token_mint };
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

  async function del(row: any) {
    if (!confirm("Сигурен ли си, че искаш да изтриеш този запис?")) return;
    setBusy(true);
    const r = await fetch("/api/admin/data", {
      method: "DELETE",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ table, filters: filtersFor(table, row) }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setStatus(`Грешка: ${j.error}`); return; }
    await load();
  }

  async function deleteTokenData() {
    const target = mint.trim();
    if (!target) { setStatus("Въведи mint адрес за изтриване."); return; }
    if (!confirm(`Това ще изтрие токена и ВСИЧКИ негови holdings, транзакции и връзки:\n\n${target}\n\nПродължаваме ли?`)) return;
    setBusy(true);
    const r = await fetch("/api/admin/data", {
      method: "DELETE",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ deleteTokenData: target }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setStatus(`Грешка: ${j.error}`); return; }
    setStatus("Данните за токена са изтрити.");
    await load();
  }

  return <main className="admin-page">
    <header className="admin-header">
      <div><a href="/" className="brand">SolanaBubble</a><h1>Управление на базата данни</h1></div>
      <a href="/" className="admin-back">← Начална страница</a>
    </header>

    <section className="admin-controls">
      <label><span>ADMIN_SECRET</span><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Администраторска тайна" /></label>
      <label className="admin-mint"><span>Филтър по mint</span><input value={mint} onChange={(e) => setMint(e.target.value)} placeholder="Solana mint адрес (по избор)" /></label>
      <button onClick={() => load()} disabled={busy}>Обнови</button>
      <button className="danger" onClick={deleteTokenData} disabled={busy || !mint.trim()}>Изтрий целия токен</button>
    </section>

    <nav className="admin-tabs">
      {TABLES.map(([key, label]) => <button key={key} className={table === key ? "active" : ""} onClick={() => { setTable(key); load(key); }}>{label}</button>)}
    </nav>

    <div className="admin-status">{status || `Общо записи: ${count}`}</div>

    <section className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}<th>Действие</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={rowKey(table, row)}>
          {columns.map((c) => <td key={c} title={String(row[c] ?? "")}>{typeof row[c] === "object" ? JSON.stringify(row[c]) : String(row[c] ?? "")}</td>)}
          <td><button className="danger small" onClick={() => del(row)} disabled={busy}>Изтрий</button></td>
        </tr>)}</tbody>
      </table>
    </section>

    <p className="admin-note">ADMIN_SECRET се пази само в sessionStorage на този браузърен таб. Изтриването на ред от <b>tokens</b> каскадно изтрива свързаните данни за токена.</p>
  </main>;
}
