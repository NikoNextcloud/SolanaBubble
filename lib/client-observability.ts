"use client";

type ClientErrorPayload={kind:string;message:string;stack?:string|null;route?:string;source?:string|null;version?:string};

function clean(value:unknown,max:number){
  if(typeof value!=="string")return "";
  return value.replace(/([?&](?:token|key|secret|auth|signature)=)[^&\s]+/gi,"$1[redacted]").slice(0,max);
}

export async function reportClientError(input:Partial<ClientErrorPayload>){
  if(typeof window==="undefined")return;
  const payload={
    kind:clean(input.kind||"client_error",60),
    message:clean(input.message||"Unknown client error",900),
    stack:clean(input.stack||"",4000),
    route:clean(input.route||window.location.pathname,240),
    source:clean(input.source||"",240),
    version:"1.0.0",
  };
  try{
    await fetch("/api/telemetry/error",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),keepalive:true,cache:"no-store"});
  }catch{}
}
