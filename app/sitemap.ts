import type {MetadataRoute} from "next";

export default function sitemap():MetadataRoute.Sitemap{
 const base="https://solanabubble.vercel.app";
 const now=new Date();
 return [
  {url:base,lastModified:now,changeFrequency:"hourly",priority:1},
  {url:base+"/market/watchlist",lastModified:now,changeFrequency:"daily",priority:.7},
  {url:base+"/market/movers",lastModified:now,changeFrequency:"hourly",priority:.8},
  {url:base+"/methodology",lastModified:now,changeFrequency:"monthly",priority:.5},
  {url:base+"/risk",lastModified:now,changeFrequency:"monthly",priority:.4},
  {url:base+"/privacy",lastModified:now,changeFrequency:"monthly",priority:.3},
  {url:base+"/terms",lastModified:now,changeFrequency:"monthly",priority:.3},
 ];
}
