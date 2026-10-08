"use client";
import {useEffect} from "react";
import {reportClientError} from "@/lib/client-observability";
import styles from "./ErrorState.module.css";
export default function RouteError({error,reset}:{error?:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{if(error)void reportClientError({kind:"route_error",message:error.message,stack:error.stack,source:error.digest||null});},[error]);
 return <main className={styles.page} role="alert"><div className={styles.card}><span className={styles.eyebrow}>SOLANABUBBLE · RECOVERY</span><h2 className={styles.title}>Картата не може да се покаже</h2><p className={styles.copy}>Опитай отново. Локалната Watchlist информация и настройките ти са запазени.</p><div className={styles.actions}><button onClick={reset}>Опитай отново</button><a href="/">Към Market Map</a></div></div></main>;
}
