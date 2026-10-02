import {swapPrograms} from './programs';
export type RecognizedSwap={pool:string;signature:string;wallet:string;side:'buy'|'sell';token_amount:number;quote_mint:string;quote_amount:number;usd_value:number|null;block_at:string;program:string};
export const WSOL_MINT='So11111111111111111111111111111111111111112';
export const USDC_MINT='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const safePrograms=new Set(['11111111111111111111111111111111','TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb','ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL','ComputeBudget111111111111111111111111111111','MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr']);
function decodeInstructionBytes(value:string){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of value){const i=alphabet.indexOf(c);if(i<0)return [];n=n*58n+BigInt(i);}const bytes:number[]=[];while(n){bytes.unshift(Number(n&255n));n>>=8n;}for(const c of value){if(c!=='1')break;bytes.unshift(0);}return bytes;}
/** Conservative direct single-swap decoder. Routers, liquidity operations and ambiguous balance movements stay unrecognized. */
export function decodeDirectSwap(tx:any,mint:string,pool:string,solUsd:number|null):RecognizedSwap|null {
 if(!tx||tx.meta?.err||!tx.blockTime||!tx.transaction?.signatures?.[0])return null;
 const keys=tx.transaction.message?.accountKeys??[];
 const addresses=keys.map((k:any)=>typeof k==='string'?k:k.pubkey);
 const instructions=tx.transaction.message?.instructions??[];
 const candidates=instructions.filter((i:any)=>swapPrograms.some(p=>p.program===(i.programId??addresses[i.programIdIndex])));
 if(candidates.length!==1)return null;
 const ix=candidates[0],program=ix.programId??addresses[ix.programIdIndex],adapter=swapPrograms.find(p=>p.program===program)!;
 // Reject extra program calls, including routing/multiple DEX legs.
 if(instructions.some((i:any)=>{const id=i.programId??addresses[i.programIdIndex];return id!==program&&!safePrograms.has(id);}))return null;
 // Top-level token transfers could contaminate net account deltas.
 if(instructions.some((i:any)=>{const id=i.programId??addresses[i.programIdIndex];if(id!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'&&id!=='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')return false;return i.parsed?.type?.startsWith('transfer')||(typeof i.data==='string'&&[3,12].includes(decodeInstructionBytes(i.data)[0]));}))return null;
 if(typeof ix.data!=='string')return null;
 const bytes=decodeInstructionBytes(ix.data);
 if(bytes.length<24)return null;
 if(!adapter.discriminators.some(d=>d.every((b,i)=>bytes[i]===b)))return null;
 const accounts=(ix.accounts??[]).map((a:any)=>typeof a==='number'?addresses[a]:a);
 if(accounts[adapter.poolIndex]!==pool)return null;
 const wallet=accounts[adapter.userIndex],walletKey=keys.find((k:any)=>k.pubkey===wallet);
 if(!wallet||!walletKey?.signer)return null;
 const balances=new Map<number,{mint:string;owner?:string;delta:number}>();
 for(const [field,sign] of [['preTokenBalances',-1],['postTokenBalances',1]] as const)for(const b of tx.meta[field]??[]){const amount=Number(b.uiTokenAmount?.uiAmountString??b.uiTokenAmount?.uiAmount);if(!Number.isFinite(amount))return null;const before=balances.get(b.accountIndex);if(before&&before.mint!==b.mint)return null;balances.set(b.accountIndex,{mint:b.mint,owner:b.owner??before?.owner,delta:(before?.delta??0)+sign*amount});}
 const user=adapter.userTokenIndices.map(i=>balances.get(addresses.indexOf(accounts[i])));
 const target=user.find(b=>b?.mint===mint&&b.owner===wallet);
 if(!target||!target.delta)return null;
 const vaults=adapter.vaultIndices.map(i=>balances.get(addresses.indexOf(accounts[i])));
 const targetVault=vaults.find(b=>b?.mint===mint),quote=vaults.find(b=>b&&b.mint!==mint&&(b.mint===WSOL_MINT||b.mint===USDC_MINT));
 if(!targetVault||!quote||!quote.delta||Math.sign(target.delta)===Math.sign(targetVault.delta)||Math.sign(target.delta)!==Math.sign(quote.delta))return null;
 const quoteAmount=Math.abs(quote.delta),price=quote.mint===USDC_MINT?1:solUsd;
 return {pool,signature:tx.transaction.signatures[0],wallet,side:target.delta>0?'buy':'sell',token_amount:Math.abs(target.delta),quote_mint:quote.mint,quote_amount:quoteAmount,usd_value:price!=null&&price>0?quoteAmount*price:null,block_at:new Date(tx.blockTime*1000).toISOString(),program:adapter.name};
}
