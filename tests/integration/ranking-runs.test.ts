import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/game/GameHost',()=>({GameHost:class {}}));
import { AppController } from '../../src/app/AppController';
import { RankingClient, RankingError, RANKING_START_PENDING_KEY, RANKING_PENDING_KEY, RANKING_SESSION_KEY } from '../../src/services/RankingClient';
import { RankingRunStore, type RankingRunRecord } from '../../src/services/RankingRunStore';
import type { BattleResult } from '../../src/types/game';
import type { RankingGateway, RankingStartRequest, RankingStartResponse, RankingSubmitRequest, RankingFinishRequest, RankingSnapshot } from '../../src/types/ranking';
class Storage {
 values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}
 getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}
}
function result(score:number):BattleResult{return {stageId:'endless',outcome:'defeat',score,survivalTime:12,coreRemaining:0,kills:3,bossDefeated:false,bossesDefeated:0,bossId:'echo',partsEarned:2,weaponDamage:{},supportUsage:{},enemyKills:{},sectorDamage:[0,0,0,0,0,0],controlSeconds:{slowed:0,pushed:0,pulled:0},mainCause:'確認',upgrades:[],branches:[],runSeed:4,newUnlock:null,retired:false};}
class Gateway implements RankingGateway {
 starts:RankingStartRequest[]=[];submissions:RankingSubmitRequest[]=[];failScores=false;delayName='';resolveStart:((value:RankingStartResponse)=>void)|null=null;
 async startPlay(request:RankingStartRequest):Promise<RankingStartResponse>{this.starts.push(request);if(request.displayName===this.delayName)return new Promise(resolve=>{this.resolveStart=resolve;});return {accepted:true,playId:`play-${request.displayName}`,gameSlug:request.gameSlug,clientVersion:request.clientVersion};}
 async finishPlay(request:RankingFinishRequest){return {accepted:true as const,playId:request.playId};}
 async submitScore(request:RankingSubmitRequest){this.submissions.push({...request});if(this.failScores)throw new RankingError('lost_ack',true);return {accepted:true as const,submissionId:request.submissionId,playId:request.playId,gameSlug:request.gameSlug,clientVersion:request.clientVersion,score:request.score};}
 async getBestRanking(){return [];}
}
interface Context {name:string;record:RankingRunRecord|null;client:RankingClient;start:Promise<RankingSnapshot>}
interface ControllerInternals {resultRankingContext:Context;resultRankingName:string;lastResult:BattleResult;rankingRunStore:RankingRunStore;submitRanking(result:BattleResult):Promise<void>;retryRanking(result:BattleResult):Promise<void>}
function setup(){const storage=new Storage();let n=0;const store=new RankingRunStore({storage,uuid:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`});const gateway=new Gateway();const controller=new AppController({} as HTMLElement) as unknown as ControllerInternals;controller.rankingRunStore=store;
 const context=(name:string,record=store.create(name)!):Context=>{const client=new RankingClient({storage:store.scopedStorage(record.id),gateway,preserveStoredRun:true});return {name,record,client,start:client.begin(name)};};
 const select=(ctx:Context,value:BattleResult)=>{controller.resultRankingContext=ctx;controller.resultRankingName=ctx.name;controller.lastResult=value;store.saveResult(ctx.record!,value);};return {storage,store,gateway,controller,context,select};}
describe('run-bound controller submissions',()=>{
 it('a delayed start ACK after the next run still submits only the original name and score',async()=>{
  const f=setup();f.gateway.delayName='A';const a=f.context('A'),aResult=result(10);f.select(a,aResult);const old=f.controller.submitRanking(aResult);
  const b=f.context('B'),bResult=result(20);f.select(b,bResult);await f.controller.submitRanking(bResult);
  const first=f.gateway.starts[0]!;f.gateway.resolveStart!({accepted:true,playId:'play-A',gameSlug:first.gameSlug,clientVersion:first.clientVersion});await old;
  expect(f.gateway.submissions.map(x=>[x.displayName,x.playId,x.score])).toEqual([['B','play-B',20],['A','play-A',10]]);
  expect(f.store.listPending()).toHaveLength(0);
 });
 it('two failed named results survive reload and each retries its frozen receipt once',async()=>{
  const f=setup();f.gateway.failScores=true;
  for(const [name,score] of [['A',10],['B',20]] as const){const ctx=f.context(name),value=result(score);f.select(ctx,value);await f.controller.submitRanking(value);}
  const originals=f.gateway.submissions.map(x=>({...x}));expect(new RankingRunStore({storage:f.storage}).listPending()).toHaveLength(2);
  f.gateway.failScores=false;const reload=new RankingRunStore({storage:f.storage});f.controller.rankingRunStore=reload;
  for(const record of reload.listPending()){
   const client=new RankingClient({storage:reload.scopedStorage(record.id),gateway:f.gateway,preserveStoredRun:true});
   f.controller.resultRankingContext={name:record.name,record,client,start:Promise.resolve(client.snapshot())};f.controller.lastResult=record.result!;
   await f.controller.retryRanking(record.result!);
  }
  expect(f.gateway.submissions.slice(2)).toEqual(originals);expect(reload.listPending()).toHaveLength(0);
 });
 it('a durable pending start retains its old version after an application update',async()=>{
  const f=setup(),record=f.store.create('A')!,scope=f.store.scopedStorage(record.id);
  scope.setItem(RANKING_START_PENDING_KEY,JSON.stringify({startId:'original-start',displayName:'A',gameSlug:'kakomare',clientVersion:'old-client',ruleVersion:'old-rules'}));
  const client=new RankingClient({storage:scope,gateway:f.gateway,preserveStoredRun:true});await client.retryStart('A');
  expect(f.gateway.starts[0]).toMatchObject({startId:'original-start',clientVersion:'old-client',ruleVersion:'old-rules'});expect(client.snapshot().session?.clientVersion).toBe('old-client');
 });
 it('session write failure keeps the durable original start ID; a reload cannot invent a new one',async()=>{
  const f=setup(),record=f.store.create('A')!,scope=f.store.scopedStorage(record.id);
  const partial={...scope,setItem:(key:string,value:string)=>{if(key===RANKING_SESSION_KEY)throw Error('quota');scope.setItem(key,value);}};
  const first=new RankingClient({storage:partial,gateway:f.gateway,preserveStoredRun:true});await first.start('A');
  const next=new RankingClient({storage:scope,gateway:f.gateway,preserveStoredRun:true});await next.start('A');
  expect(f.gateway.starts).toHaveLength(2);expect(f.gateway.starts[0]?.startId).toBe(f.gateway.starts[1]?.startId);
 });
 it('quota denial or corrupted pending state never creates an untracked external submission',async()=>{
  const f=setup();const denied={getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem:()=>{}};
  const client=new RankingClient({storage:denied,gateway:f.gateway,preserveStoredRun:true});expect((await client.start('A')).status).toBe('retryable_failed');expect(f.gateway.starts).toHaveLength(0);
  const record=f.store.create('A')!,scope=f.store.scopedStorage(record.id);scope.setItem(RANKING_PENDING_KEY,'future schema');
  const invalid=new RankingClient({storage:scope,gateway:f.gateway,preserveStoredRun:true});expect((await invalid.start('A')).status).toBe('permanent_failed');expect(scope.getItem(RANKING_PENDING_KEY)).toBe('future schema');expect(f.gateway.starts).toHaveLength(0);
 });
});
