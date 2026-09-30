import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Solana Bubbles", description: "Live карта на holders за Solana токен" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="bg"><body>{children}</body></html>;
}
