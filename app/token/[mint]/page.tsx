import BubbleMap from "@/components/BubbleMap";
export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return <BubbleMap mint={mint} />;
}
