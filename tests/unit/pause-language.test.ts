// @vitest-environment happy-dom
import { expect,it,vi } from 'vitest';
vi.mock('../../src/game/GameHost',()=>({GameHost:class{stop(){}pause(){}isUpgrading(){return false;}startBattle(){}}}));
import { AppController } from '../../src/app/AppController';
import { languageService } from '../../src/services/LanguageService';
interface Controller{renderBattle():void;openPause(hidden:boolean):void;state:{view:string};runLifecycle:{start():boolean};}
it('explains pause and retirement in the selected language without exposing a language reset during play',()=>{
 languageService.select('en');const root=document.createElement('main');document.body.append(root);
 const controller=new AppController(root) as unknown as Controller;controller.state.view='battle';controller.runLifecycle.start();controller.renderBattle();controller.openPause(false);
 const dialog=root.querySelector('.pause-dialog')!;
 expect(dialog.textContent).toContain('Battle paused');expect(dialog.textContent).toContain('Game time and enemies stay stopped until you resume.');expect(dialog.querySelector('[data-testid="language-select"]')).toBeNull();
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 [...dialog.querySelectorAll('button')].find(b=>b.textContent==='Retire')!.click();
 expect(confirm).toHaveBeenCalledWith('End this play? The score will not be confirmed.');
});
