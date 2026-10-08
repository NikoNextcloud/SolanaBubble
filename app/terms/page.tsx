import LegalPage,{LegalNotice,LegalSection} from "@/components/LegalPage";
export const metadata={title:"Terms"};
export default function Terms(){
 return <LegalPage eyebrow="TRUST CENTER" title="Terms of Use" intro="These terms describe the intended use of the SolanaBubble research workspace.">
  <LegalNotice>Use SolanaBubble at your own risk. You remain responsible for every trading, wallet and investment decision you make.</LegalNotice>
  <LegalSection title="Research use"><p>SolanaBubble provides market visualization, alerts and heuristic research signals. The service does not execute trades, custody assets, promise returns or provide individualized investment advice.</p></LegalSection>
  <LegalSection title="No warranty"><p>Data can be delayed, sampled, incomplete or unavailable. The application is provided without a guarantee of uninterrupted availability, correctness or fitness for a particular trading strategy.</p></LegalSection>
  <LegalSection title="Acceptable use"><p>Do not abuse public endpoints, attempt to bypass security controls, submit secrets through telemetry fields or use the service to interfere with upstream providers.</p></LegalSection>
  <LegalSection title="Third parties"><p>Solana RPC providers, Supabase, Vercel, DexScreener and linked external research tools operate under their own terms and availability guarantees.</p></LegalSection>
 </LegalPage>;
}
