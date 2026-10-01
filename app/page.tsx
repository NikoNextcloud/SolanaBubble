import MarketMap from "@/components/MarketMap";
import WorkspaceShell from "@/components/WorkspaceShell";

export default function Home() {
  return (
    <WorkspaceShell section="Market overview">
      <MarketMap />
    </WorkspaceShell>
  );
}
