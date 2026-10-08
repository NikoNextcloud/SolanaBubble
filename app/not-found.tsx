import styles from "@/components/ErrorState.module.css";
export default function NotFound(){
 return <main className={styles.page}><div className={styles.card}><span className={styles.eyebrow}>SOLANABUBBLE · 404</span><h1 className={styles.title}>Тази страница не съществува</h1><p className={styles.copy}>Адресът може да е променен или токенът вече да не е достъпен през този маршрут.</p><div className={styles.actions}><a href="/">Към Live Market Map</a><a href="/market/watchlist">Watchlist</a></div></div></main>;
}
