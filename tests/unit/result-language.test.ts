// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createResultView } from '../../src/ui/ResultView';
import { languageService } from '../../src/services/LanguageService';
import type { BattleResult } from '../../src/types/game';
const result = { stageId:'endless',outcome:'defeat',score:1234,survivalTime:42,coreRemaining:0,kills:8,bossesDefeated:1,mainCause:'確認',weaponDamage:{},supportUsage:{},retired:false } as BattleResult;
describe('result localization without record mutation', () => {
  it('translates actions, confirmed score and network states without changing the result', () => {
    languageService.select('en');
    const before = JSON.stringify(result);
    const view = createResultView(result, { again:()=>{},home:()=>{},share:()=>{},ranking:{status:'retryable_failed',diagnosticCode:'network',topRankingStatus:'failed',topRanking:[]} as never,retryRanking:()=>{} });
    expect(view.textContent).toContain('1,234 points');
    expect(view.textContent).toContain('Retry score submission');
    expect(view.textContent).toContain('Could not load the top 30');
    expect(view.querySelector('[data-testid="share-result"]')?.textContent).toBe('Share on X');
    expect(JSON.stringify(result)).toBe(before);
  });
  it('keeps unconfirmed results unconfirmed and names as plain text in rankings', () => {
    languageService.select('fr');
    const view = createResultView({...result,retired:true}, { again:()=>{},home:()=>{},share:()=>{},ranking:{status:'idle',diagnosticCode:'unconfirmed_result',topRankingStatus:'loaded',topRanking:[{rank:1,displayName:'<b>A</b>',bestScore:1234,playCount:2}]} as never });
    expect(view.textContent).toContain('Le score n’est pas confirmé');
    expect(view.querySelector('b')).toBeNull();
    expect(view.textContent).toContain('<b>A</b>');
    expect(view.querySelector('[data-testid="share-result"]')).toBeNull();
  });
});

it('does not translate a player name that matches a game-data label',()=>{
 languageService.select('en');
 const view=createResultView(result,{again:()=>{},home:()=>{},share:()=>{},ranking:{status:'idle',topRankingStatus:'loaded',topRanking:[{rank:1,displayName:'連針砲',bestScore:1234,playCount:1}]} as never});
 expect(view.textContent).toContain('連針砲');expect(view.textContent).not.toContain('Needle Cannon');
});
