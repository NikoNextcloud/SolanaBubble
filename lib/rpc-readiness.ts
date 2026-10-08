export type RpcProviderReadiness={
  mode:'public-fallback'|'dedicated-shared'|'dedicated-traffic'|'dedicated-holder'|'dedicated-split';
  trafficConfigured:number;
  holderConfigured:number;
  sharedConfigured:boolean;
  dedicated:boolean;
  fullFirehose:false;
  note:string;
};

const count=(raw?:string)=>raw?.split(',').map(v=>v.trim()).filter(Boolean).length??0;

export function rpcProviderReadiness(env:Record<string,string|undefined>=process.env):RpcProviderReadiness{
  const trafficList=count(env.SOLANA_TRAFFIC_RPC_URLS),holderList=count(env.SOLANA_HOLDER_RPC_URLS);
  const trafficSingle=Boolean(env.SOLANA_TRAFFIC_RPC_URL),holderSingle=Boolean(env.SOLANA_HOLDER_RPC_URL),shared=Boolean(env.SOLANA_RPC_URL);
  const trafficConfigured=trafficList+(trafficSingle?1:0)+(shared&&!trafficSingle&&!trafficList?1:0);
  const holderConfigured=holderList+(holderSingle?1:0)+(shared&&!holderSingle&&!holderList?1:0);
  const trafficDedicated=trafficList>0||trafficSingle||shared,holderDedicated=holderList>0||holderSingle||shared;
  const mode:RpcProviderReadiness['mode']=trafficDedicated&&holderDedicated
    ? ((trafficList>0||trafficSingle)&&(holderList>0||holderSingle)?'dedicated-split':'dedicated-shared')
    : trafficDedicated?'dedicated-traffic'
    : holderDedicated?'dedicated-holder'
    :'public-fallback';
  return {
    mode,trafficConfigured,holderConfigured,sharedConfigured:shared,dedicated:trafficDedicated||holderDedicated,fullFirehose:false,
    note:mode==='public-fallback'
      ? 'Using public Solana RPC fallbacks. Add dedicated traffic/holder RPC URLs for stronger coverage and rate-limit isolation.'
      : 'Dedicated RPC routing is configured. Swap observation remains bounded/sampled until an indexed firehose source is integrated.'
  };
}
