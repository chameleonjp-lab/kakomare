// @vitest-environment happy-dom
import { expect,it,vi } from 'vitest';
vi.mock('../../src/game/GameHost',()=>({GameHost:class{stop(){}}}));
import { AppController } from '../../src/app/AppController';
import { languageService } from '../../src/services/LanguageService';
interface Controller { homeView():HTMLElement; rankingRunStore:{listPending():unknown[]}; rankingClient:{snapshot():{submission:null}}; }
it('localizes pending-result controls without altering their saved score',()=>{
 languageService.select('en');const controller=new AppController(document.createElement('main')) as unknown as Controller;
 const record={id:'original',name:'original',result:{score:1234}};
 controller.rankingRunStore={listPending:()=>[record]};controller.rankingClient={snapshot:()=>({submission:null})};
 const view=controller.homeView();expect(view.querySelector('[data-testid="pending-ranking-result"]')?.textContent).toBe('Unsent result: 1,234 points');
 expect(record.result.score).toBe(1234);
});
