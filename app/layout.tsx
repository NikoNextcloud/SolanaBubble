import type {Metadata,Viewport} from "next";
import "./globals.css";
import "./lovable-theme.css";

export const metadata:Metadata={
  metadataBase:new URL("https://solanabubble.vercel.app"),
  title:{default:"SolanaBubble",template:"%s · SolanaBubble"},
  description:"Real-time Solana market intelligence, living order-flow waves, holder maps, smart alerts and wallet analytics.",
  applicationName:"SolanaBubble",
  alternates:{canonical:"/"},
  openGraph:{title:"SolanaBubble",description:"Real-time Solana market intelligence and holder analytics.",url:"/",siteName:"SolanaBubble",type:"website"},
  robots:{index:true,follow:true},
  manifest:"/manifest.webmanifest",
};
export const viewport:Viewport={themeColor:"#0b0f14",colorScheme:"dark"};
export default function Root({children}:{children:React.ReactNode}){
  return <html lang="bg"><body>{children}</body></html>;
}
