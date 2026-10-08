"use client";
import {useEffect} from "react";
import {reportClientError} from "@/lib/client-observability";

export default function ClientObservability(){
 useEffect(()=>{
  if(process.env.NEXT_PUBLIC_BROWSER_SMOKE==="1")return;
  const onError=(event:ErrorEvent)=>{void reportClientError({kind:"window_error",message:event.message,stack:event.error?.stack,source:event.filename});};
  const onRejection=(event:PromiseRejectionEvent)=>{
    const reason=event.reason;
    void reportClientError({kind:"unhandled_rejection",message:reason instanceof Error?reason.message:String(reason??"Unhandled rejection"),stack:reason instanceof Error?reason.stack:null});
  };
  window.addEventListener("error",onError);
  window.addEventListener("unhandledrejection",onRejection);
  return()=>{window.removeEventListener("error",onError);window.removeEventListener("unhandledrejection",onRejection);};
 },[]);
 return null;
}
