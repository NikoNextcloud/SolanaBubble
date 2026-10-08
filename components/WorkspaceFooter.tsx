import styles from "./WorkspaceFooter.module.css";
export default function WorkspaceFooter(){
 return <footer className={styles.footer}><div className={styles.links}><a href="/methodology">Methodology</a><a href="/risk">Risk</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div><span className={styles.version}>SolanaBubble v1.0.0 · research signals, not financial advice</span></footer>;
}
