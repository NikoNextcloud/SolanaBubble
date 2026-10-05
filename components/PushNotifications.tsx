"use client";

import {useEffect,useState} from "react";

const PUBLIC_KEY=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY??"";

function decodePublicKey(value:string){
  const padding="=".repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64);
  return Uint8Array.from([...raw].map((c)=>c.charCodeAt(0)));
}

export default function PushNotifications({syncKey}:{syncKey:string}){
  const [status,setStatus]=useState<"checking"|"unsupported"|"blocked"|"off"|"on"|"error">("checking");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)||!PUBLIC_KEY){if(active)setStatus("unsupported");return;}
      if(Notification.permission==="denied"){if(active)setStatus("blocked");return;}
      try{
        const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
        const sub=await registration.pushManager.getSubscription();
        if(active)setStatus(sub?"on":"off");
      }catch{if(active)setStatus("error");}
    })();
    return()=>{active=false;};
  },[]);

  async function enable(){
    if(!syncKey||!PUBLIC_KEY)return;
    setBusy(true);
    try{
      const permission=await Notification.requestPermission();
      if(permission!=="granted"){setStatus(permission==="denied"?"blocked":"off");return;}
      const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
      const subscription=await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:decodePublicKey(PUBLIC_KEY),
      });
      const response=await fetch("/api/push/subscription",{
        method:"POST",
        headers:{"content-type":"application/json","x-solanabubble-sync-key":syncKey},
        body:JSON.stringify(subscription.toJSON()),
      });
      if(!response.ok)throw new Error("subscribe");
      setStatus("on");
    }catch{setStatus("error");}
    finally{setBusy(false);}
  }

  async function disable(){
    if(!syncKey)return;
    setBusy(true);
    try{
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription();
      if(subscription){
        await fetch("/api/push/subscription",{
          method:"DELETE",
          headers:{"content-type":"application/json","x-solanabubble-sync-key":syncKey},
          body:JSON.stringify({endpoint:subscription.endpoint}),
        });
        await subscription.unsubscribe();
      }
      setStatus("off");
    }catch{setStatus("error");}
    finally{setBusy(false);}
  }

  return <div className="push-notifications">
    <div><strong>Background browser alerts</strong><small>{status==="on"?"Enabled on this device":status==="off"?"Off on this device":status==="blocked"?"Blocked by browser permission":status==="unsupported"?"Not supported/configured":status==="error"?"Push service unavailable":"Checking…"}</small></div>
    {status==="on"
      ?<button type="button" disabled={busy} onClick={disable}>Disable</button>
      :<button type="button" disabled={busy||status==="blocked"||status==="unsupported"||!syncKey} onClick={enable}>Enable</button>}
  </div>;
}
