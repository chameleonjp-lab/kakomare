// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../src/game/GameHost', () => ({ GameHost: class {} }));
import { AppController } from '../../src/app/AppController';
import { languageService } from '../../src/services/LanguageService';
import { ShareService } from '../../src/services/ShareService';
import type { BattleResult } from '../../src/types/game';
interface ShareController {shareHome():Promise<void>;shareResult(result:BattleResult):Promise<void>;shareService:{share(title:string,text:string):Promise<{success:boolean;method:string}>};}
const languages=['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'];
function weighted(text:string):number{return [...text.replace(/https:\/\/\S+/g,'x'.repeat(23))].reduce((n,ch)=>{const c=ch.codePointAt(0)!;return n+((c<=4351||(c>=8192&&c<=8205)||(c>=8208&&c<=8223)||(c>=8242&&c<=8247))?1:2)},0);}
afterEach(()=>vi.unstubAllGlobals());
for(const language of languages)it(`${language}: actual home/result keep details, canonical URL and two formal hashtags`,async()=>{
 languageService.select(language);const controller=new AppController(document.createElement('main')) as unknown as ShareController;const texts:string[]=[];const service=new ShareService();
 controller.shareService={share:async(_title,text)=>{texts.push(text);return {success:true,method:'x'}}};
 await controller.shareHome();for(const score of [0,2147483647])await controller.shareResult({score,survivalTime:999999,kills:999999}as BattleResult);
 let opened='';vi.stubGlobal('window',{open:(url:string)=>{opened=url;return {opener:null}}});
 for(const text of texts){await service.share('title',text);const posted=new URL(opened).searchParams.get('text')!;expect(posted).toContain(text);expect(posted).toContain('#カコマレ #ゲーム制作');expect(posted.endsWith(service.getShareUrl())).toBe(true);expect(weighted(posted)).toBeLessThanOrEqual(280);}
});
