"use client";
import {useEffect} from "react";
import {reportClientError} from "@/lib/client-observability";
import styles from "@/components/ErrorState.module.css";

export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{void reportClientError({kind:"global_error",message:error.message,stack:error.stack,source:error.digest||null});},[error]);
 return <html lang="bg"><body><main className={styles.page}><div className={styles.card}><span className={styles.eyebrow}>SOLANABUBBLE · RECOVERY</span><h1 className={styles.title}>Възникна неочаквана грешка</h1><p className={styles.copy}>Състоянието е докладвано анонимно. Можеш да опиташ отново или да се върнеш към пазара.</p><div className={styles.actions}><button onClick={reset}>Опитай отново</button><a href="/">Към Live Market Map</a></div></div></main></body></html>;
}
