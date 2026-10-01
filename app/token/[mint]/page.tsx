import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BubbleMap from "@/components/BubbleMap";
import SiteEnhancer from "@/components/SiteEnhancer";
import WorkspaceShell from "@/components/WorkspaceShell";

const RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mint: string }>;
}): Promise<Metadata> {
  const { mint } = await params;
  return {
    title: `${mint.slice(0, 6)}… · Solana Bubbles`,
    description: `Live holder map and wallet intelligence for Solana token ${mint}`,
  };
}

export default async function TokenPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;

  if (!RE.test(mint)) {
    notFound();
  }

  return (
    <WorkspaceShell section="Holder map">
      <SiteEnhancer />
      <BubbleMap mint={mint} />
    </WorkspaceShell>
  );
}
