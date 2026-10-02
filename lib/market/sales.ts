const QUOTES=new Set(['So11111111111111111111111111111111111111112','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','Es9vMFrzaCERmJfrF4H2FYDgHkmPG8TbQnYQ8V4a8Qj']);
/** Swap-like evidence only: a token transfer alone must never be labelled selling. */
export function detectSwapLikeSale(tx:any,mint:string,wallet:string,since:string) {
  if(!tx || tx.meta?.err || !tx.blockTime || tx.blockTime*1000<=Date.parse(since)) return null;
  const delta=new Map<string,number>();
  for(const [key,sign] of [['preTokenBalances',-1],['postTokenBalances',1]] as const) for(const row of tx.meta?.[key] ?? []) {
    if(row.owner!==wallet) continue;
    const amount=Number(row.uiTokenAmount?.uiAmountString ?? row.uiTokenAmount?.uiAmount ?? 0);
    delta.set(row.mint,(delta.get(row.mint) ?? 0)+sign*amount);
  }
  const loss=-(delta.get(mint) ?? 0);
  if(loss<=0 || ![...delta].some(([quote,amount])=>quote!==mint&&QUOTES.has(quote)&&amount>0)) return null;
  const signature=tx.transaction?.signatures?.[0];
  if(!signature) return null;
  return {wallet,signature:String(signature),amount:loss,at:new Date(tx.blockTime*1000).toISOString()};
}
