// @vitest-environment happy-dom
import { expect,it,vi } from 'vitest';
const calls=vi.hoisted(()=>({options:null as unknown}));
vi.mock('../../src/game/GameHost',()=>({GameHost:class{stop(){}startBattle(_mount:unknown,options:unknown){calls.options=options;}}}));
import { AppController } from '../../src/app/AppController';
import { languageService } from '../../src/services/LanguageService';
interface Controller { renderBattle():void; audio:{cue(cue:string):void} }
it('renders translated status but dispatches audio using the original engine message',()=>{
 languageService.select('en');const root=document.createElement('main');document.body.append(root);
 const controller=new AppController(root) as unknown as Controller;const cue=vi.spyOn(controller.audio,'cue').mockImplementation(()=>{});
 controller.renderBattle();
 const callbacks=(calls.options as {callbacks:{onStatus(message:string):void}}).callbacks;
 callbacks.onStatus('戦闘開始');
 expect(root.querySelector('[data-testid="battle-status"]')?.textContent).toBe('Battle started');
 expect(cue).toHaveBeenLastCalledWith('start');
 callbacks.onStatus('未知の状態');
 expect(root.querySelector('[data-testid="battle-status"]')?.textContent).toBe('未知の状態');
});
