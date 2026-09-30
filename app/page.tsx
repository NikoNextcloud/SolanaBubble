"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default function Home() {
  const r = useRouter();
  const [v, setV] = useState("");
  const [e, setE] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const mint = v.trim();
    if (!RE.test(mint)) {
      setE("Невалиден Solana адрес на токен.");
      return;
    }

    setBusy(true);
    setE("");
    setStatus("Проверявам токена…");

    try {
      const res = await fetch("/api/tokens/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mint }),
      });
      const data = await res.json();

      if (!res.ok) {
        setE(data.error || "Неуспешно зареждане на токена.");
        setStatus("");
        setBusy(false);
        return;
      }

      if (data.bootstrapped) {
        setStatus(`Добавен е нов токен · ${data.holders ?? 0} holders заредени`);
      } else {
        setStatus("Токенът вече се следи. Отварям картата…");
      }

      if (data.webhookWarning) {
        setStatus((s) => `${s} · live webhook: ${data.webhookWarning}`);
      }

      r.push(`/token/${mint}`);
    } catch {
      setE("Грешка при свързване със сървъра.");
      setStatus("");
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <form onSubmit={submit}>
        <h1>Виж кой държи токена. На живо.</h1>
        <p>Постави адреса на произволен Solana токен. Ако още не го следим, SolanaBubble автоматично ще зареди holders и ще го добави към live наблюдението.</p>

        <div className="row">
          <input
            className="addr"
            aria-label="Адрес на токен"
            placeholder="Solana token mint address"
            value={v}
            disabled={busy}
            onChange={(x) => {
              setV(x.target.value);
              setE("");
              setStatus("");
            }}
          />
          <button className="go" disabled={busy}>
            {busy ? "Зареждане…" : "Отвори картата"}
          </button>
        </div>

        <div className="home-status">{status}</div>
        <div className="err" role="alert">{e}</div>
      </form>
    </main>
  );
}
