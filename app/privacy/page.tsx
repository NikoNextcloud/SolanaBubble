import LegalPage,{LegalSection} from "@/components/LegalPage";
export const metadata={title:"Privacy"};
export default function Privacy(){
 return <LegalPage eyebrow="TRUST CENTER" title="Privacy" intro="SolanaBubble is designed to collect only the operational data needed to run the market workspace, sync user settings and diagnose failures.">
  <LegalSection title="Browser data"><p>Watchlists, filters, onboarding state and anonymous sync credentials may be stored in browser storage. When account sync is enabled, watchlist settings are associated with the authenticated Supabase user through a server-side hashed identifier.</p></LegalSection>
  <LegalSection title="Operational telemetry"><p>Client crashes and unhandled promise rejections may send a bounded error report containing route, error type, message, stack excerpt, application version and browser user-agent. Error reports are retained for a limited diagnostic window and are not intended to contain wallet secrets or private keys.</p></LegalSection>
  <LegalSection title="Market data"><p>Public Solana addresses, token mints, pool activity and public blockchain observations are market data. They are not treated as private account information.</p></LegalSection>
  <LegalSection title="Authentication"><p>Optional email magic-link authentication is handled by Supabase Auth. SolanaBubble does not ask you to submit exchange passwords, wallet seed phrases or private keys.</p></LegalSection>
 </LegalPage>;
}
