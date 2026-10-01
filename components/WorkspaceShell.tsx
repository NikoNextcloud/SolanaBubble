"use client";
import { usePathname } from "next/navigation";

export default function WorkspaceShell({
  children,
  section = "Market overview",
}: {
  children: React.ReactNode;
  section?: string;
}) {
  const pathname = usePathname();
  const isMarket = pathname === "/";
  const isDatabase = pathname.startsWith("/admin");

  return (
    <main className="alpha-shell">
      <aside className="alpha-sidebar">
        <a className="alpha-logo" href="/">
          <span className="alpha-logo-mark">✦</span>
          <strong>SolanaBubble</strong>
          <small>/ SOL</small>
        </a>

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
