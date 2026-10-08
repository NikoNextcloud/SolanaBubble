"use client";
import {useEffect} from "react";
import {reportClientError} from "@/lib/client-observability";

export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{void reportClientError({kind:"global_error",message:error.message,stack:error.stack,source:error.digest||null});},[error]);
 return <html lang="bg"><body><main className="fatal-error"><div><span>SOLANABUBBLE · RECOVERY</span><h1>Възникна неочаквана грешка</h1><p>Състоянието е докладвано анонимно. Можеш да опиташ отново или да се върнеш към пазара.</p><button onClick={reset}>Опитай отново</button><a href="/">Към Live Market Map</a></div></main></body></html>;
}
