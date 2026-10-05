import {swapPrograms} from './programs';
export type RecognizedSwap={pool:string;signature:string;wallet:string;side:'buy'|'sell';token_amount:number;quote_mint:string;quote_amount:number;usd_value:number|null;block_at:string;program:string;evidence?:'direct'|'routed'};
export const WSOL_MINT='So11111111111111111111111111111111111111112';
export const USDC_MINT='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const safePrograms=new Set(['11111111111111111111111111111111','TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb','ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL','ComputeBudget111111111111111111111111111111','MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr']);
function decodeInstructionBytes(value:string){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of value){const i=alphabet.indexOf(c);if(i<0)return [];n=n*58n+BigInt(i);}const bytes:number[]=[];while(n){bytes.unshift(Number(n&255n));n>>=8n;}for(const c of value){if(c!=='1')break;bytes.unshift(0);}return bytes;}
function transactionKeys(tx:any){
 const raw=tx.transaction?.message?.accountKeys;
 if(!Array.isArray(raw))return {keys:[] as any[],addresses:[] as string[],signers:new Set<string>()};
 const addresses=raw.map((k:any)=>typeof k==='string'?k:k.pubkey);
 const loaded=[...(tx.meta?.loadedAddresses?.writable??[]),...(tx.meta?.loadedAddresses?.readonly??[])].map((k:any)=>typeof k==='string'?k:k.pubkey);
 for(const address of loaded)if(address&&!addresses.includes(address))addresses.push(address);
 const signers=new Set<string>(raw.filter((k:any)=>typeof k!=='string'&&k.signer).map((k:any)=>k.pubkey));
 const required=Number(tx.transaction?.message?.header?.numRequiredSignatures??0);
 if(!signers.size&&required>0)for(const address of addresses.slice(0,required))signers.add(address);
 return {keys:raw,addresses,signers};
}
function instructionProgramId(ix:any,addresses:string[]){return ix?.programId??addresses[ix?.programIdIndex];}
function allInstructions(tx:any){
 const top=Array.isArray(tx.transaction?.message?.instructions)?tx.transaction.message.instructions:[];
 const inner=Array.isArray(tx.meta?.innerInstructions)?tx.meta.innerInstructions.flatMap((group:any)=>Array.isArray(group?.instructions)?group.instructions:[]):[];
 return {top,inner,all:[...top,...inner]};
}
/** Conservative direct single-swap decoder. Routers, liquidity operations and ambiguous balance movements stay unrecognized. */
export function decodeDirectSwap(tx:any,mint:string,pool:string,solUsd:number|null):RecognizedSwap|null {
 if(!tx||!tx.meta||tx.meta.err||!tx.blockTime||!tx.transaction?.signatures?.[0])return null;
 if(tx.version!=null&&tx.version!=='legacy'&&tx.version!==0&&tx.version!==1)return null;
 if(!Array.isArray(tx.transaction.message?.accountKeys)||!Array.isArray(tx.transaction.message?.instructions))return null;
 const {keys,addresses,signers}=transactionKeys(tx);
 const instructions=tx.transaction.message?.instructions??[];
 const candidates=instructions.filter((i:any)=>swapPrograms.some(p=>p.program===instructionProgramId(i,addresses)));
 if(candidates.length!==1)return null;
 const ix=candidates[0],program=instructionProgramId(ix,addresses);
 // Reject extra program calls, including routing/multiple DEX legs.
 if(instructions.some((i:any)=>{const id=instructionProgramId(i,addresses);return id!==program&&!safePrograms.has(id);}))return null;
 // Top-level token transfers could contaminate net account deltas.
 if(instructions.some((i:any)=>{const id=instructionProgramId(i,addresses);if(id!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'&&id!=='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')return false;return i.parsed?.type?.startsWith('transfer')||(typeof i.data==='string'&&[3,12].includes(decodeInstructionBytes(i.data)[0]));}))return null;
 if(typeof ix.data!=='string')return null;
 const bytes=decodeInstructionBytes(ix.data);
 if(bytes.length<24)return null;
 const adapter=swapPrograms.find(p=>p.program===program&&p.discriminators.some(d=>d.every((b,i)=>bytes[i]===b)));
 if(!adapter)return null;
 const accounts=(ix.accounts??[]).map((a:any)=>typeof a==='number'?addresses[a]:a);
 if(accounts[adapter.poolIndex]!==pool)return null;
 const wallet=accounts[adapter.userIndex];
 if(!wallet||!signers.has(wallet))return null;
 const balances=new Map<number,{mint:string;owner?:string;delta:number}>();
 for(const [field,sign] of [['preTokenBalances',-1],['postTokenBalances',1]] as const)for(const b of tx.meta[field]??[]){const amount=Number(b.uiTokenAmount?.uiAmountString??b.uiTokenAmount?.uiAmount);if(!Number.isFinite(amount))return null;const before=balances.get(b.accountIndex);if(before&&before.mint!==b.mint)return null;balances.set(b.accountIndex,{mint:b.mint,owner:b.owner??before?.owner,delta:(before?.delta??0)+sign*amount});}
 const user=adapter.userTokenIndices.map(i=>balances.get(addresses.indexOf(accounts[i])));
 const target=user.find(b=>b?.mint===mint&&b.owner===wallet);
 if(!target||!target.delta)return null;
 const vaults=adapter.vaultIndices.map(i=>balances.get(addresses.indexOf(accounts[i])));
 const targetVault=vaults.find(b=>b?.mint===mint),quote=vaults.find(b=>b&&b.mint!==mint&&(b.mint===WSOL_MINT||b.mint===USDC_MINT));
 if(!targetVault||!quote||!quote.delta||Math.sign(target.delta)===Math.sign(targetVault.delta)||Math.sign(target.delta)!==Math.sign(quote.delta))return null;
 const quoteAmount=Math.abs(quote.delta),price=quote.mint===USDC_MINT?1:solUsd;
 return {pool,signature:tx.transaction.signatures[0],wallet,side:target.delta>0?'buy':'sell',token_amount:Math.abs(target.delta),quote_mint:quote.mint,quote_amount:quoteAmount,usd_value:price!=null&&price>0?quoteAmount*price:null,block_at:new Date(tx.blockTime*1000).toISOString(),program:adapter.name,evidence:'direct'};
}

export const JUPITER_V6_PROGRAM='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

/**
 * Conservative routed-swap inference.
 * The scan is already scoped to a selected pool address; a Jupiter top-level instruction,
 * that pool in the transaction account keys, and opposite signer-owned target/quote deltas
 * are all required. This is intentionally labelled routed rather than verified-direct.
 */
export function decodeRoutedSwap(tx:any,mint:string,pool:string,solUsd:number|null):RecognizedSwap|null {
 if(!tx||!tx.meta||tx.meta.err||!tx.blockTime||!tx.transaction?.signatures?.[0])return null;
 if(tx.version!=null&&tx.version!=='legacy'&&tx.version!==0&&tx.version!==1)return null;
 const {addresses,signers}=transactionKeys(tx);
 const instructions=allInstructions(tx);
 if(!addresses.length||!instructions.top.length)return null;
 if(!addresses.includes(pool))return null;
 const programIds=instructions.all.map((i:any)=>instructionProgramId(i,addresses)).filter(Boolean);
 if(!programIds.includes(JUPITER_V6_PROGRAM))return null;
 if(!signers.size)return null;

 const ownerDeltas=new Map<string,Map<string,number>>();
 for(const [field,sign] of [['preTokenBalances',-1],['postTokenBalances',1]] as const){
  for(const b of tx.meta[field]??[]){
   const owner=b.owner;if(!owner||!signers.has(owner))continue;
   const amount=Number(b.uiTokenAmount?.uiAmountString??b.uiTokenAmount?.uiAmount);
   if(!Number.isFinite(amount))return null;
   const byMint=ownerDeltas.get(owner)??new Map<string,number>();
   byMint.set(b.mint,(byMint.get(b.mint)??0)+sign*amount);
   ownerDeltas.set(owner,byMint);
  }
 }
 for(const wallet of signers){
  const deltas=ownerDeltas.get(wallet);if(!deltas)continue;
  const target=deltas.get(mint)??0;if(Math.abs(target)<1e-12)continue;
  const quotes=[USDC_MINT,WSOL_MINT].map(q=>({mint:q,delta:deltas.get(q)??0})).filter(q=>Math.abs(q.delta)>1e-12&&Math.sign(q.delta)!==Math.sign(target));
  if(quotes.length!==1)continue;
  const quote=quotes[0],quoteAmount=Math.abs(quote.delta),price=quote.mint===USDC_MINT?1:solUsd;
  return {pool,signature:tx.transaction.signatures[0],wallet,side:target>0?'buy':'sell',token_amount:Math.abs(target),quote_mint:quote.mint,quote_amount:quoteAmount,usd_value:price!=null&&price>0?quoteAmount*price:null,block_at:new Date(tx.blockTime*1000).toISOString(),program:'Jupiter v6 route',evidence:'routed'};
 }
 return null;
}
