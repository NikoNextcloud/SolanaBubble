"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type SearchToken = {
  mint: string;
  symbol?: string | null;
  name?: string | null;
  priceUsd?: number;
  liquidityUsd?: number;
  imageUrl?: string | null;
};

export default function WorkspaceShell({
  children,
  section = "Market overview",
}: {
  children: React.ReactNode;
  section?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isMarket = pathname === "/";
  const isDatabase = pathname.startsWith("/admin");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchToken[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [openingMint, setOpeningMint] = useState<string | null>(null);
  const searchBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!searchBox.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    let stopped = false;
    const id = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/search/tokens?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = await r.json();
        if (!stopped) {
          setResults(Array.isArray(j.results) ? j.results : []);
          setOpen(true);
        }
      } catch {
        if (!stopped) setResults([]);
      } finally {
        if (!stopped) setSearching(false);
      }
    }, 280);

    return () => {
      stopped = true;
      window.clearTimeout(id);
    };
  }, [query]);

  async function openToken(token: SearchToken) {
    setOpeningMint(token.mint);
    try {
      await fetch("/api/tokens/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mint: token.mint }),
      });
    } catch {}
    setOpen(false);
    setQuery("");
    router.push(`/token/${token.mint}`);
  }

  function submitDirect() {
    const q = query.trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)) {
      openToken({ mint: q });
      return;
    }
    if (results[0]) openToken(results[0]);
  }

  return (
    <main className="alpha-shell">
      <aside className="alpha-sidebar">
        <a className="alpha-logo" href="/">
          <span className="alpha-logo-mark">✦</span>
          <strong>SolanaBubble</strong>
          <small>/ SOL</small>
        </a>

        <div className="alpha-token-search" ref={searchBox}>
          <div className="alpha-search-input-wrap">
            <span>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query.trim().length >= 2 && setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitDirect();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Търси токен..."
              aria-label="Търси Solana токен"
            />
            {searching && <i className="alpha-search-spinner" />}
          </div>

          {open && <div className="alpha-search-results">
            {results.length === 0 && !searching ? (
              <div className="alpha-search-empty">Няма намерени токени</div>
            ) : results.map((token) => (
              <button
                key={token.mint}
                onClick={() => openToken(token)}
                disabled={openingMint === token.mint}
              >
                <span className="alpha-search-token-icon">
                  {token.imageUrl ? <img src={token.imageUrl} alt="" /> : (token.symbol?.slice(0, 2) || "?")}
                </span>
                <span className="alpha-search-token-main">
                  <strong>{token.symbol || token.name || "Token"}</strong>
                  <small>{token.name || `${token.mint.slice(0, 6)}…${token.mint.slice(-4)}`}</small>
                </span>
                <span className="alpha-search-token-price">
                  {Number(token.priceUsd || 0) > 0 ? `$${Number(token.priceUsd).toPrecision(4)}` : "—"}
                </span>
              </button>
            ))}
          </div>}
        </div>

        <div className="alpha-side-section">
          <span className="alpha-side-label">WORKSPACE</span>
          <a className={`alpha-nav ${isMarket ? "active" : ""}`} href="/">
            <span className="alpha-nav-icon">▦</span>
            <span>Market overview</span>
          </a>
        </div>

        <div className="alpha-side-section">
          <span className="alpha-side-label">TOOLS</span>
          <a className={`alpha-nav ${isDatabase ? "active" : ""}`} href="/admin">
            <span className="alpha-nav-icon">▤</span>
            <span>Database</span>
          </a>
        </div>

        <div className="alpha-network">
          <span><i /> Solana network</span>
          <small>LIVE DATA</small>
        </div>
      </aside>

      <section className="alpha-app">
        <header className="alpha-topbar">
          <div className="alpha-breadcrumb">
            <span>Workspace</span><b>›</b><strong>{section}</strong>
          </div>
          <div className="alpha-top-actions">
            <span className="alpha-chain-dot"><i /> SOLANA</span>
            <span className="alpha-avatar">SB</span>
          </div>
        </header>
        <div className="alpha-shell-content">{children}</div>
      </section>
    </main>
  );
}
