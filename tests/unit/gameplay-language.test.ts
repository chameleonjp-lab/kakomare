// @vitest-environment happy-dom
import { expect,it,vi } from 'vitest';
vi.mock('../../src/game/GameHost',()=>({GameHost:class{stop(){}}}));
import { AppController } from '../../src/app/AppController';
import { languageService } from '../../src/services/LanguageService';
interface Controller { renderBoot():void; renderBootError():void; root:HTMLElement; }
it('localizes loading and failure states without relying on successful startup',()=>{
 languageService.select('en');const root=document.createElement('main');const controller=new AppController(root) as unknown as Controller;
 controller.renderBoot(); expect(root.textContent).toContain('Preparing');expect(root.textContent).not.toMatch(/[ぁ-んァ-ヶ]/u);
 controller.renderBootError();expect(root.textContent).toContain('Could not load');expect(root.textContent).toContain('Try again');
});
