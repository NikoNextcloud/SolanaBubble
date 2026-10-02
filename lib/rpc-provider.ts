/** Server-side RPC transport boundary shared by supply, holders and transaction analysis. */
export interface SolanaRpcProvider {
  request<T>(method: string, params: unknown[]): Promise<T>;
}
export class PublicSolanaRpcProvider implements SolanaRpcProvider {
  constructor(private readonly endpoint = () => process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com') {}
  async request<T>(method: string, params: unknown[]): Promise<T> {
    const response = await fetch(this.endpoint(), {
      signal: AbortSignal.timeout(15_000), method:'POST', cache:'no-store',
      headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
    });
    if (!response.ok) throw new Error(`Solana RPC failed: ${response.status}`);
    const data = await response.json() as {result?:T;error?:{message?:string;code?:number}};
    if(data.error) throw new Error(data.error.message || `Solana RPC error ${data.error.code ?? ''}`);
    if(data.result == null) throw new Error('Solana RPC returned no result');
    return data.result;
  }
}
let rpcProvider: SolanaRpcProvider = new PublicSolanaRpcProvider();
export const setSolanaRpcProvider = (provider: SolanaRpcProvider) => { rpcProvider=provider; };
export const solanaRpc = <T>(method:string,params:unknown[]) => rpcProvider.request<T>(method,params);
