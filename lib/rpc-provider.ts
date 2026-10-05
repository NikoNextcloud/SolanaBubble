/** Replaceable server-side transport. Errors never include endpoint URLs or credentials. */
export interface SolanaRpcProvider {request<T>(method:string,params:unknown[]):Promise<T>}
export type RpcFailure='rate_limited'|'forbidden'|'timeout'|'network'|'rpc_error'|'http_error'|'not_found'|'invalid_response';
export class SolanaRpcError extends Error {constructor(public readonly kind:RpcFailure,public readonly status?:number,public readonly code?:number){super(`Solana RPC: ${kind}`);}}

const TRAFFIC_METHODS=new Set(['getTransaction','getSignaturesForAddress']);
const splitEndpoints=(raw:string|undefined)=>raw?.split(',').map(v=>v.trim()).filter(Boolean)??[];

/** Ordered method routing. *_RPC_URLS accepts a comma-separated failover chain. */
export function rpcEndpoints(method:string){
 const traffic=TRAFFIC_METHODS.has(method);
 const primary=splitEndpoints(traffic?process.env.SOLANA_TRAFFIC_RPC_URLS:process.env.SOLANA_HOLDER_RPC_URLS);
 const single=(traffic?process.env.SOLANA_TRAFFIC_RPC_URL:process.env.SOLANA_HOLDER_RPC_URL)||process.env.SOLANA_RPC_URL;
 const defaults=traffic?['https://solana-rpc.publicnode.com','https://api.mainnet-beta.solana.com']:['https://api.mainnet-beta.solana.com'];
 return [...new Set([...primary,...(single?[single]:[]),...defaults])];
}
export function rpcEndpoint(method:string){return rpcEndpoints(method)[0];}

type EndpointHealth={cooldownUntil:number;failure:RpcFailure};
const retryable=new Set<RpcFailure>(['rate_limited','forbidden','timeout','network','http_error','rpc_error']);

export class PublicSolanaRpcProvider implements SolanaRpcProvider {
 private transactionQueue:Promise<unknown>=Promise.resolve();
 private readonly health=new Map<string,EndpointHealth>();
 constructor(private readonly endpoints:(method:string)=>string|string[]=rpcEndpoints){}
 request<T>(method:string,params:unknown[]):Promise<T>{
  if(method!=='getTransaction')return this.sendWithFailover<T>(method,params);
  // All transaction consumers share one lane so fallback does not become an RPC flood.
  const work=this.transactionQueue.catch(()=>{}).then(()=>this.sendWithFailover<T>(method,params));
  this.transactionQueue=work;return work;
 }
 private async sendWithFailover<T>(method:string,params:unknown[]):Promise<T>{
  const configured=this.endpoints(method);
  const endpoints=Array.isArray(configured)?configured:[configured];
  let last:SolanaRpcError|undefined;
  for(const endpoint of endpoints){
   const state=this.health.get(endpoint);
   if(state&&Date.now()<state.cooldownUntil){last=new SolanaRpcError(state.failure,state.failure==='rate_limited'?429:undefined);continue;}
   try{
    const result=await this.send<T>(endpoint,method,params);
    this.health.delete(endpoint);
    return result;
   }catch(error){
    const rpcError=error instanceof SolanaRpcError?error:new SolanaRpcError('network');
    last=rpcError;
    if(!retryable.has(rpcError.kind))throw rpcError;
    const cooldown=rpcError.kind==='rate_limited'||rpcError.kind==='forbidden'?60_000:rpcError.kind==='timeout'||rpcError.kind==='network'?20_000:8_000;
    this.health.set(endpoint,{cooldownUntil:Date.now()+cooldown,failure:rpcError.kind});
   }
  }
  throw last??new SolanaRpcError('network');
 }
 private async send<T>(endpoint:string,method:string,params:unknown[]):Promise<T>{
  let response:Response;
  try{response=await fetch(endpoint,{signal:AbortSignal.timeout(15000),method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});}
  catch(e){throw new SolanaRpcError(e instanceof Error&&(e.name==='TimeoutError'||e.name==='AbortError')?'timeout':'network');}
  if(!response.ok)throw new SolanaRpcError(response.status===429?'rate_limited':[401,403].includes(response.status)?'forbidden':'http_error',response.status);
  let data:{result?:T;error?:{code?:number}};
  try{data=await response.json();}catch{throw new SolanaRpcError('invalid_response');}
  if(data.error)throw new SolanaRpcError('rpc_error',undefined,data.error.code);
  if(data.result==null)throw new SolanaRpcError('not_found');
  return data.result;
 }
}
let rpcProvider:SolanaRpcProvider=new PublicSolanaRpcProvider();
export const setSolanaRpcProvider=(provider:SolanaRpcProvider)=>{rpcProvider=provider;};
export const solanaRpc=<T>(method:string,params:unknown[])=>rpcProvider.request<T>(method,params);
