import LegalPage,{LegalNotice,LegalSection} from "@/components/LegalPage";

export const metadata={title:"Methodology"};
export default function Methodology(){
 return <LegalPage eyebrow="TRUST CENTER" title="Methodology" intro="How SolanaBubble turns observed market activity into live visualization and research signals.">
  <LegalNotice>Observed BUY/SELL swap particles are data events. Opportunity, Hype, Risk, Smart Money and relationship scores are heuristics derived from bounded observations and should be interpreted separately.</LegalNotice>
  <LegalSection title="Market and order flow"><p>Market snapshots combine DexScreener market data with bounded Solana RPC observations and cached history. The live map prioritizes selected tokens and recent activity. Public or configured RPC access can be rate-limited, so a quiet wave does not prove that no trade occurred.</p></LegalSection>
  <LegalSection title="Hype and wave turbulence"><p>Hype is a normalized activity signal. Higher Hype and observed trade activity increase wave amplitude, frequency and visual energy. The animation communicates relative activity; it is not a price forecast.</p></LegalSection>
  <LegalSection title="Opportunity Wave"><p>The white Opportunity Wave requires elevated Opportunity and Confidence, controlled manipulation risk, constructive capital-flow or bullish-divergence evidence, and no active liquidity warning. It is intentionally conservative and is not a BUY instruction or guarantee.</p></LegalSection>
  <LegalSection title="Holder and relationship intelligence"><p>Holder growth, whale movements and wallet relationships use bounded observations. Transfers can look like position changes, sampled relationships are incomplete, and relationship evidence is not proof of coordinated trading.</p></LegalSection>
  <LegalSection title="Data quality"><p>LIVE DATA, PARTIAL and DELAYED states expose freshness and sampled coverage. When coverage is partial, SolanaBubble preserves that uncertainty instead of converting missing observations into zero activity.</p></LegalSection>
 </LegalPage>;
}
