import {test} from 'node:test';
import assert from 'node:assert/strict';
import {balanceChanges,trackedFlow,walletFocus} from '../lib/holder/insights';
const now=Date.parse('2026-10-02T10:00:00Z'),at=new Date(now-60000).toISOString();
test('balance changes compare common owners only; missing sampled owners are not exits',()=>{assert.deepEqual(balanceChanges([{wallet:'a',balance:10},{wallet:'b',balance:3}],[{wallet:'a',balance:8},{wallet:'new',balance:2}]),[{wallet:'a',delta:-2}]);assert.deepEqual(balanceChanges([],[{wallet:'a',balance:5}]),[]);});
test('missing, transfer-only, old and unpriced swaps cannot claim zero or positive USD flow',()=>{
 for(const rows of [[],[{side:'transfer_in',usd_value:10,block_time:at}],[{side:'buy',usd_value:10,block_time:new Date(now-90000000).toISOString()}],[{side:'buy',usd_value:null,block_time:at}]])assert.equal(trackedFlow(rows,now).net,null);
 const flat=trackedFlow([{side:'buy',usd_value:10,block_time:at},{side:'sell',usd_value:10,block_time:at}],now);assert.equal(flat.net,0);assert.equal(flat.volume,20);
 const sell=trackedFlow([{side:'sell',usd_value:15,block_time:at}],now);assert.equal(sell.net,-15);
});
test('focus highlights selected wallet and directly related wallets only',()=>{const links=[{source:'a',target:{wallet:'b'}},{source:'b',target:'c'},{source:{wallet:'d'},target:'a'}];assert.deepEqual([...walletFocus('a',links)].sort(),['a','b','d']);assert.equal(walletFocus(null,links).size,0);});
