import { admin } from "./db";

export async function getNetworkLive(): Promise<boolean> {
  const { data } = await admin()
    .from("api_cache")
    .select("payload")
    .eq("cache_key", "system:network-live")
    .maybeSingle();
  const payload = data?.payload as { live?: boolean } | null;
  return payload?.live !== false;
}

export async function setNetworkLive(live: boolean) {
  await admin().from("api_cache").upsert({
    cache_key: "system:network-live",
    payload: { live },
    updated_at: new Date().toISOString(),
  });
}
