import { describe, expect, it } from 'vitest';
import { HttpRankingGateway, RankingClient, RANKING_PENDING_KEY, RANKING_START_PENDING_KEY } from '../../src/services/RankingClient';
import type { BattleResult } from '../../src/types/game';

const playId = '11111111-1111-4111-8111-111111111111';
class MemoryStorage { values=new Map<string,string>(); getItem(k:string){return this.values.get(k)??null;} setItem(k:string,v:string){this.values.set(k,v);} removeItem(k:string){this.values.delete(k);} }
const result = { stageId:'endless',outcome:'defeat',score:100,survivalTime:12,coreRemaining:8,kills:3,bossesDefeated:0,retired:false } as BattleResult;
type Row = Record<string,unknown>;
function normal(rpc:string,p:Row): unknown {
 if(rpc==='start_game_play_v1')return {accepted:true,play_id:playId,start_id:p.p_start_id,game_slug:p.p_game_slug,display_name:p.p_display_name,normalized_name:p.p_display_name,client_version:p.p_client_version,duplicate:false};
 if(rpc==='finish_game_play_v1')return {accepted:true,play_id:p.p_play_id,game_slug:p.p_game_slug,result_type:p.p_result_type,reached_wave:p.p_reached_wave,score:p.p_score,duplicate:false};
 return [{accepted:true,result_submission_id:p.p_submission_id,result_play_id:p.p_play_id,result_display_name:p.p_display_name,result_normalized_name:p.p_display_name,result_first_score:0,result_best_score:100,result_play_count:1,is_first_play:false,is_new_best:true,was_duplicate:false}];
}
const cases: Array<[string,string,(value:unknown)=>unknown]> = [
 ['start name mismatch','start_game_play_v1',v=>({...v as Row,display_name:'Other'})],
 ['start identity mismatch','start_game_play_v1',v=>({...v as Row,start_id:'22222222-2222-4222-8222-222222222222'})],
 ['start non-UUID play','start_game_play_v1',v=>({...v as Row,play_id:'arbitrary'})],
 ['start missing normalized name','start_game_play_v1',v=>({...v as Row,normalized_name:undefined})],
 ['start duplicate type','start_game_play_v1',v=>({...v as Row,duplicate:'false'})],
 ['finish result mismatch','finish_game_play_v1',v=>({...v as Row,result_type:'retire'})],
 ['finish score mismatch','finish_game_play_v1',v=>({...v as Row,score:101})],
 ['finish missing game','finish_game_play_v1',v=>({...v as Row,game_slug:undefined})],
 ['finish duplicate type','finish_game_play_v1',v=>({...v as Row,duplicate:'false'})],
 ['submit missing first','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],result_first_score:undefined}]],
 ['submit wrong normalized name','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],result_normalized_name:'Other'}]],
 ['submit first int4 overflow','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],result_first_score:2147483648}]],
 ['submit best int4 underflow','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],result_best_score:-2147483649}]],
 ['submit count int4 overflow','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],result_play_count:2147483648}]],
 ['submit object instead of TABLE','submit_score_idempotent_v1',v=>(v as Row[])[0]],
 ['duplicate display null','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],was_duplicate:true,result_display_name:null}]],
 ['duplicate display missing','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],was_duplicate:true,result_display_name:undefined}]],
 ['duplicate display blank','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],was_duplicate:true,result_display_name:'   '}]],
 ['duplicate display oversized','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],was_duplicate:true,result_display_name:'a'.repeat(21)}]],
 ['duplicate display nonstring','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],was_duplicate:true,result_display_name:123}]],
 ['submit boolean type','submit_score_idempotent_v1',v=>[{...(v as Row[])[0],was_duplicate:1}]],
];
describe('dedicated HTTP acknowledgement and durable retry',()=>{
 it.each(cases)('keeps %s retryable across reload',async(_label,target,mutate)=>{
  const storage=new MemoryStorage(),calls:Array<{rpc:string,p:Row}>=[];let malformed=true;
  const gateway=new HttpRankingGateway({endpoint:'https://mock.invalid',publishableKey:'test',fetchImpl:async(url,init)=>{const rpc=String(url).split('/').at(-1)!,p=JSON.parse(String(init?.body)) as Row;calls.push({rpc,p});const value=normal(rpc,p);return {ok:true,json:async()=>malformed&&rpc===target?mutate(value):value} as Response;}});
  const client=new RankingClient({gateway,storage,preserveStoredRun:true});const begun=await client.start('Alice');
  const state=target==='start_game_play_v1'?begun:await client.finish({displayName:'Alice',playId:begun.session!.playId,result});
  expect(state.status).toBe('retryable_failed');
  const key=target==='start_game_play_v1'?RANKING_START_PENDING_KEY:RANKING_PENDING_KEY;expect(storage.getItem(key)).not.toBeNull();
  if(target==='finish_game_play_v1')expect(calls.some(c=>c.rpc==='submit_score_idempotent_v1')).toBe(false);
  if(target==='submit_score_idempotent_v1')expect(state.submission?.finishAcknowledged).toBe(true);
  malformed=false;const restored=new RankingClient({gateway,storage,preserveStoredRun:true});
  const retried=target==='start_game_play_v1'?await restored.retryStart():await restored.retry();
  expect(retried.status).toBe(target==='start_game_play_v1'?'idle':'submitted');
  const attempts=calls.filter(c=>c.rpc===target);expect(attempts).toHaveLength(2);expect(attempts[1]!.p).toEqual(attempts[0]!.p);
  if(target==='submit_score_idempotent_v1')expect(calls.filter(c=>c.rpc==='finish_game_play_v1')).toHaveLength(1);
  expect(storage.getItem(key)).toBeNull();
 });
 it.each([-2147483648,-1,0,2147483647])('accepts signed historical first %s with count max',async first=>{
  const gateway=new HttpRankingGateway({endpoint:'https://mock.invalid',publishableKey:'test',fetchImpl:async(_url,init)=>{const p=JSON.parse(String(init?.body)) as Row;const ack=normal('submit_score_idempotent_v1',p) as Row[];return {ok:true,json:async()=>[{...ack[0],result_first_score:first,result_best_score:2147483647,result_play_count:2147483647}]} as Response;}});
  await expect(gateway.submitScore({submissionId:crypto.randomUUID(),playId,displayName:'Alice',gameSlug:'kakomare',clientVersion:'test',ruleVersion:'test',resultType:'game_over',score:100,scoreBreakdown:{kills:3}})).resolves.toMatchObject({accepted:true});
 });
});

it('does not turn an explicit server rejection into an automatic retry', async()=>{
 const storage=new MemoryStorage();let submits=0;
 const gateway=new HttpRankingGateway({endpoint:'https://mock.invalid',publishableKey:'test',fetchImpl:async(url,init)=>{const rpc=String(url).split('/').at(-1)!,p=JSON.parse(String(init?.body)) as Row;if(rpc==='submit_score_idempotent_v1')submits++;return {ok:true,json:async()=>rpc==='finish_game_play_v1'?{accepted:false,reason:'play_already_finished'}:normal(rpc,p)} as Response;}});
 const client=new RankingClient({gateway,storage});await client.start('Alice');const failed=await client.finish({displayName:'Alice',playId,result});expect(failed.status).toBe('permanent_failed');expect(storage.getItem(RANKING_PENDING_KEY)).not.toBeNull();await client.retry();expect(submits).toBe(0);expect(client.snapshot().status).toBe('permanent_failed');
});

it('accepts the current aggregate display name on a valid duplicate while retaining receipt identity',async()=>{
 const submissionId=crypto.randomUUID();let payload:Row|undefined;
 const gateway=new HttpRankingGateway({endpoint:'https://mock.invalid',publishableKey:'test',fetchImpl:async(_url,init)=>{payload=JSON.parse(String(init?.body)) as Row;const ack=normal('submit_score_idempotent_v1',payload) as Row[];return {ok:true,json:async()=>[{...ack[0],was_duplicate:true,result_display_name:'Current display'}]} as Response;}});
 const request={submissionId,playId,displayName:'Alice',gameSlug:'kakomare',clientVersion:'test',ruleVersion:'test',resultType:'game_over',score:100,scoreBreakdown:{kills:3}};
 await expect(gateway.submitScore(request)).resolves.toMatchObject({accepted:true,submissionId,playId});expect(payload?.p_display_name).toBe('Alice');
});
