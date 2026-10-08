"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import LiveReliabilityBadge from "./LiveReliabilityBadge";
import ProductTour from "./ProductTour";
import AccountMenu from "./AccountMenu";
import WorkspaceFooter from "./WorkspaceFooter";

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
  const isWatchlist = pathname === "/market/watchlist";
  const isMovers = pathname === "/market/movers";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchToken[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [openingMint, setOpeningMint] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<SearchToken[]>([]);
  const [tourOpenRequest,setTourOpenRequest]=useState(0);
  const searchBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("solanabubble:wishlist") || "[]");
      if (Array.isArray(saved)) setWishlist(saved.slice(0, 20));
    } catch {}
  }, []);

  useEffect(() => {
    const match = pathname.match(/^\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    const mint = match?.[1];
    if (!mint) return;

    let stopped = false;
    fetch(`/api/search/tokens?q=${encodeURIComponent(mint)}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (stopped) return;
        const token = (j?.results || []).find((x: SearchToken) => x.mint === mint) || { mint };
        setWishlist((prev) => {
          const next = [token, ...prev.filter((x) => x.mint !== mint)].slice(0, 20);
          try { localStorage.setItem("solanabubble:wishlist", JSON.stringify(next)); } catch {}
          return next;
        });
      })
      .catch(() => {
        if (stopped) return;
        setWishlist((prev) => {
          const next = [{ mint }, ...prev.filter((x) => x.mint !== mint)].slice(0, 20);
          try { localStorage.setItem("solanabubble:wishlist", JSON.stringify(next)); } catch {}
          return next;
        });
      });

    return () => { stopped = true; };
  }, [pathname]);

  function removeWishlist(mint: string) {
    setWishlist((prev) => {
      const next = prev.filter((x) => x.mint !== mint);
      try { localStorage.setItem("solanabubble:wishlist", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!searchBox.current?.contains(target) && !target.closest?.(".mobile-search-toggle")) {
        setOpen(false);
        setMobileSearchOpen(false);
      }
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

  function openToken(token: SearchToken) {
    setOpeningMint(token.mint);
    setOpen(false);
    setMobileSearchOpen(false);
    setQuery("");
    // The holder page owns tracking/bootstrap. Navigate immediately so search never waits on RPC work.
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
        <a className="alpha-logo lovable-brand" href="/">
          <span className="lovable-brand-mark" aria-hidden="true">✿</span>
          <span className="alpha-logo-copy">
            <strong>SolanaBubble</strong>
          </span>
        </a>

        <div className="alpha-side-label workspace-label">WORKSPACE</div>

        <div className="alpha-side-section lovable-workspace-nav">
          <a className={`alpha-nav ${isMarket ? "active" : ""}`} href="/">
            <span className="alpha-nav-icon">◎</span><span>Live Market Map</span>
          </a>
          <a className={`alpha-nav ${isWatchlist ? "active" : ""}`} href="/market/watchlist">
            <span className="alpha-nav-icon">☆</span><span>Watchlist</span>
          </a>
          <a className={`alpha-nav ${isMovers ? "active" : ""}`} href="/market/movers">
            <span className="alpha-nav-icon">▥</span><span>Top Movers</span>
          </a>
          <a className={`alpha-nav ${isDatabase ? "active" : ""}`} href="/admin">
            <span className="alpha-nav-icon">▣</span><span>Research / DB</span>
          </a>
        </div>

        <div className="alpha-side-section alpha-wishlist-section">
          <span className="alpha-side-label">WISHLIST</span>
          <div className="alpha-wishlist">
            {wishlist.length === 0 ? (
              <div className="alpha-wishlist-empty">Зареди токен, за да го запазиш тук.</div>
            ) : wishlist.map((token) => (
              <div className="alpha-wishlist-row" key={token.mint}>
                <button className="alpha-wishlist-open" onClick={() => openToken(token)} title={token.name || token.mint}>
                  <span className="alpha-wishlist-icon">
                    {token.imageUrl ? <img src={token.imageUrl} alt="" /> : (token.symbol?.slice(0, 2) || "◎")}
                  </span>
                  <span className="alpha-wishlist-copy">
                    <strong>{token.symbol || token.name || `${token.mint.slice(0, 5)}…`}</strong>
                    <small>{token.name || `${token.mint.slice(0, 5)}…${token.mint.slice(-4)}`}</small>
                  </span>
                </button>
                <button className="alpha-wishlist-remove" onClick={() => removeWishlist(token.mint)} title="Премахни">×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="alpha-network lovable-sidebar-user">
          <span className="lovable-user-avatar">SB</span>
          <span className="lovable-user-copy"><strong>SolanaBubble</strong><small>Live workspace</small></span>
          <span className="lovable-live-dot" title="Live data connected" />
        </div>
      </aside>

      <section className="alpha-app lovable-app">
        <header className="lovable-topbar">
          <div className="lovable-breadcrumb">
            <span>Workspace</span><b>›</b><strong>{section}</strong>
          </div>
          <div className={`alpha-token-search lovable-header-search ${mobileSearchOpen ? "is-mobile-open" : ""}`} ref={searchBox}>
            <div className="alpha-search-input-wrap">
              <span>⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => query.trim().length >= 2 && setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitDirect();
                  if (e.key === "Escape") {
                    setOpen(false);
                    setMobileSearchOpen(false);
                  }
                }}
                placeholder="Search tokens or wallets..."
                aria-label="Търси Solana токен"
              />
              {searching && <i className="alpha-search-spinner" />}
              <kbd>⌘ K</kbd>
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
                    {Number(token.priceUsd || 0) > 0 ? `${Number(token.priceUsd).toPrecision(4)}` : "—"}
                  </span>
                </button>
              ))}
            </div>}
          </div>
          <div className="lovable-top-actions">
            <LiveReliabilityBadge />
            <button
              type="button"
              className="mobile-search-toggle"
              aria-label={mobileSearchOpen ? "Затвори търсенето" : "Търси токен"}
              aria-expanded={mobileSearchOpen}
              onClick={(event) => {
                event.stopPropagation();
                setMobileSearchOpen((value) => !value);
              }}
            >{mobileSearchOpen ? "×" : "⌕"}</button>
            <a href="/market/watchlist" title="Watchlist & alerts" aria-label="Watchlist and alerts">♧</a>
            <button type="button" title="Quick start" aria-label="Open quick start" onClick={()=>setTourOpenRequest(v=>v+1)}>?</button>
            <AccountMenu />
          </div>
        </header>
        <div className="alpha-shell-content">{children}</div>
        <WorkspaceFooter />
        <ProductTour forceOpen={tourOpenRequest}/>
      </section>
    </main>
  );
}
