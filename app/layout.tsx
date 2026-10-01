import type { Metadata } from "next";
import "./globals.css";
import "./lovable-theme.css";
export const metadata: Metadata = { title: "SolanaBubble", description: "Solana market intelligence and holder analytics" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="bg"><body>{children}</body></html>;
}
