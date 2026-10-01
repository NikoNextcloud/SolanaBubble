import MarketSection from "@/components/MarketSection";
import WorkspaceShell from "@/components/WorkspaceShell";
import { notFound } from "next/navigation";

const allowed = new Set(["watchlist", "movers", "narratives", "alerts", "portfolio"]);

export default async function MarketSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!allowed.has(section)) notFound();

  return (
    <WorkspaceShell section={section}>
      <MarketSection section={section} />
    </WorkspaceShell>
  );
}
