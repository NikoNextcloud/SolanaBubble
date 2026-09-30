"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
const RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export default function Home() {
  const r = useRouter(); const [v, setV] = useState(""); const [e, setE] = useState("");
  return (
    <main className="home">
      <form onSubmit={(ev) => { ev.preventDefault(); const m = v.trim(); RE.test(m) ? r.push(`/token/${m}`) : setE("Невалиден Solana адрес на токен."); }}>
        <h1>Виж кой държи токена. На живо.</h1>
        <p>Постави адреса на Solana токен и получи карта на всички holders — с покупки, продажби и вероятни връзки между wallet-и в реално време.</p>
        <div className="row">
          <input className="addr" aria-label="Адрес на токен" placeholder="Token mint address" value={v} onChange={(x) => { setV(x.target.value); setE(""); }} />
          <button className="go">Отвори картата</button>
        </div>
        <div className="err" role="alert">{e}</div>
      </form>
    </main>
  );
}
