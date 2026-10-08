import styles from "./LegalPage.module.css";

export default function LegalPage({eyebrow,title,intro,children}:{eyebrow:string;title:string;intro:string;children:React.ReactNode}){
  return <main className={styles.page}><div className={styles.inner}>
    <a className={styles.back} href="/">← SolanaBubble Market</a>
    <div className={styles.eyebrow}>{eyebrow}</div>
    <h1 className={styles.title}>{title}</h1>
    <p className={styles.intro}>{intro}</p>
    {children}
    <div className={styles.links}><a href="/methodology">Methodology</a><a href="/risk">Risk Disclosure</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
    <div className={styles.updated}>SolanaBubble v1.0 · Updated 8 October 2026</div>
  </div></main>;
}

export function LegalSection({title,children}:{title:string;children:React.ReactNode}){
  return <section className={styles.section}><h2>{title}</h2>{children}</section>;
}

export function LegalNotice({children}:{children:React.ReactNode}){
  return <div className={styles.notice}>{children}</div>;
}
