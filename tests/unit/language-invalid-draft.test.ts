// @vitest-environment happy-dom
import {expect,it} from 'vitest';
import {createHomeView} from '../../src/ui/HomeView';
import {createDefaultSave} from '../../src/types/save';
import {languageService} from '../../src/services/LanguageService';
it('does not silently restore previous public name after an invalid draft plus language switch',()=>{
 const save=createDefaultSave();save.profile.name='PreviousPublicName';let view:HTMLElement;
 const render=()=>{view=createHomeView(save,{start(){},changeName:n=>{save.profile.name=n},changeLanguage:l=>{languageService.select(l);render()}})};render();
 const input=view!.querySelector<HTMLInputElement>('#player-name')!;
 input.value='X'.repeat(21);input.dispatchEvent(new Event('input'));
 expect(view!.querySelector<HTMLButtonElement>('[data-testid="start-game"]')!.disabled).toBe(true);
 const select=view!.querySelector<HTMLSelectElement>('[data-testid="language-select"]')!;select.value='fr';select.dispatchEvent(new Event('change'));
 expect(view!.querySelector<HTMLInputElement>('#player-name')!.value).toBe('X'.repeat(21));
});
