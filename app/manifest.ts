import type {MetadataRoute} from "next";

export default function manifest():MetadataRoute.Manifest{
  return {
    name:"SolanaBubble",
    short_name:"SolanaBubble",
    description:"Real-time Solana market intelligence, order-flow visualization, holder maps and alerts.",
    start_url:"/",
    display:"standalone",
    background_color:"#0b0f14",
    theme_color:"#0b0f14",
    categories:["finance","business","productivity"],
    icons:[
      {src:"/icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any"},
      {src:"/maskable-icon.svg",sizes:"any",type:"image/svg+xml",purpose:"maskable"},
    ],
  };
}
