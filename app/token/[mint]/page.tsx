import BubbleMap from "@/components/BubbleMap";
import SiteEnhancer from "@/components/SiteEnhancer";

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return (
    <>
      <SiteEnhancer />
      <BubbleMap mint={mint} />
    </>
  );
}
