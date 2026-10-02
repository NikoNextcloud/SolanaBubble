/** Replaceable server-side transport. Errors never include endpoint URLs or credentials. */
export interface SolanaRpcProvider {request<T>(method:string,params:unknown[]):Promise<T>}
export type RpcFailure='rate_limited'|'forbidden'|'timeout'|'network'|'rpc_error'|'http_error'|'not_found'|'invalid_response';
export class SolanaRpcError extends Error {constructor(public readonly kind:RpcFailure,public readonly status?:number,public readonly code?:number){super(`Solana RPC: ${kind}`);}}
export class PublicSolanaRpcProvider implements SolanaRpcProvider {
 private transactionQueue:Promise<unknown>=Promise.resolve();
 private cooldownUntil=0;
 private cooldownFailure:RpcFailure="rate_limited";
 constructor(private readonly endpoint=()=>process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com'){}
 request<T>(method:string,params:unknown[]):Promise<T>{
  if(method!=='getTransaction')return this.send<T>(method,params);
  // All consumers share the same serial transaction lane, including holder relationships.
  const work=this.transactionQueue.catch(()=>{}).then(()=>this.send<T>(method,params));this.transactionQueue=work;return work;
 }
 private async send<T>(method:string,params:unknown[]):Promise<T>{
  if(method==='getTransaction'&&Date.now()<this.cooldownUntil)throw new SolanaRpcError(this.cooldownFailure,this.cooldownFailure==='rate_limited'?429:undefined);
  let response:Response;
  try{response=await fetch(this.endpoint(),{signal:AbortSignal.timeout(15000),method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});}
  catch(e){const kind=e instanceof Error&&(e.name==='TimeoutError'||e.name==='AbortError')?'timeout':'network';if(method==='getTransaction'){this.cooldownUntil=Date.now()+60000;this.cooldownFailure=kind;}throw new SolanaRpcError(kind);}
  if(!response.ok){if([429,401,403].includes(response.status)&&method==='getTransaction'){this.cooldownUntil=Date.now()+60000;this.cooldownFailure=response.status===429?'rate_limited':'forbidden';}throw new SolanaRpcError(response.status===429?'rate_limited':[401,403].includes(response.status)?'forbidden':'http_error',response.status);}
  let data:{result?:T;error?:{code?:number}};try{data=await response.json();}catch{throw new SolanaRpcError('invalid_response');}
  if(data.error)throw new SolanaRpcError('rpc_error',undefined,data.error.code);
  if(data.result==null)throw new SolanaRpcError('not_found');return data.result;
 }
}
let rpcProvider:SolanaRpcProvider=new PublicSolanaRpcProvider();
export const setSolanaRpcProvider=(provider:SolanaRpcProvider)=>{rpcProvider=provider;};
export const solanaRpc=<T>(method:string,params:unknown[])=>rpcProvider.request<T>(method,params);
