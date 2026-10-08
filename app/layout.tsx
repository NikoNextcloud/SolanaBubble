import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./lovable-theme.css";
import ClientObservability from "@/components/ClientObservability";
export const metadata: Metadata = {
  title:{default:"SolanaBubble",template:"%s · SolanaBubble"},
  description:"Real-time Solana market intelligence, living order-flow waves, holder maps, watchlists and smart alerts.",
  applicationName:"SolanaBubble",
  manifest:"/manifest.webmanifest",
  metadataBase:new URL("https://solanabubble.vercel.app"),
  openGraph:{title:"SolanaBubble",description:"Real-time Solana market intelligence and holder analytics",url:"https://solanabubble.vercel.app",siteName:"SolanaBubble",type:"website"},
  robots:{index:true,follow:true},
};
export const viewport:Viewport={themeColor:"#0b0f14",colorScheme:"dark"};
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="bg"><body><ClientObservability/>{children}</body></html>;
}
