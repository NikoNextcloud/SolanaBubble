import LegalPage,{LegalNotice,LegalSection} from "@/components/LegalPage";
export const metadata={title:"Risk Disclosure"};
export default function Risk(){
 return <LegalPage eyebrow="TRUST CENTER" title="Risk Disclosure" intro="Crypto assets and on-chain markets can move rapidly and contain material technical, liquidity and counterparty risk.">
  <LegalNotice>SolanaBubble is a research and visualization tool. Nothing in the interface is financial, investment, legal or tax advice. No score, alert, white wave or Smart Money label guarantees a profitable outcome.</LegalNotice>
  <LegalSection title="Market risk"><p>Token prices can fall to zero. Thin liquidity, slippage, pool changes, MEV, failed transactions, contract behavior and malicious token mechanics can materially affect execution.</p></LegalSection>
  <LegalSection title="Signal risk"><p>Hype, Opportunity, Risk, Smart Money and divergence signals are heuristic. They can be late, wrong, incomplete or affected by upstream data gaps. Always verify the token, pool, contract and current execution conditions independently.</p></LegalSection>
  <LegalSection title="Coverage risk"><p>Solana Public RPC and third-party market APIs are not guaranteed firehoses. Rate limits and provider outages can produce PARTIAL or DELAYED coverage. Missing observations must not be interpreted as proof of inactivity.</p></LegalSection>
  <LegalSection title="Operational risk"><p>Browser notifications, network connectivity and background workers can fail. Alerts are convenience signals, not a substitute for independent monitoring or risk controls.</p></LegalSection>
 </LegalPage>;
}
