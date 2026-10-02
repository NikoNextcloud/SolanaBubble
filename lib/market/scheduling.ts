/** One FIFO requested token plus a fair rotation within the existing budget. */
export function selectHolderWork<T extends {mint:string}>(tokens:T[],priorityMints:string[],cursor:number,budget:number){
 const priority=priorityMints.map(m=>tokens.find(t=>t.mint===m)).filter((t):t is T=>!!t).slice(0,1);
 const rotating=tokens.filter(t=>!priority.some(p=>p.mint===t.mint));
 const start=Number.isFinite(cursor)?Math.max(0,Math.floor(cursor))%Math.max(1,rotating.length):0;
 const candidates=[...priority];for(let i=0;i<rotating.length&&candidates.length<budget;i++)candidates.push(rotating[(start+i)%rotating.length]);
 return {priority,rotating,candidates:candidates.slice(0,budget)};
}
