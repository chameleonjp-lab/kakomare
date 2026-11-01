// @vitest-environment happy-dom
import { expect,it } from 'vitest';
import { createPlacementPreview,placementLabel,placementNodes } from '../../src/ui/PlacementPreview';
import { languageService } from '../../src/services/LanguageService';
it('translates placement labels without altering node positions, slot IDs or activation',()=>{
 languageService.select('ja');const original=JSON.stringify(placementNodes(null));const originalLabel=placementLabel('weapon',0);
 languageService.select('en');expect(placementLabel('weapon',0)).not.toBe(originalLabel);
 const selected:unknown[]=[];const view=createPlacementPreview(null,{kind:'weapon',onNodeSelect:(kind,slot)=>selected.push([kind,slot])});
 expect(view.textContent).not.toMatch(/[ぁ-んァ-ヶ一-龯]/u);
 const first=view.querySelector<SVGGElement>('[data-kind="weapon"][data-slot="0"]')!;
 first.dispatchEvent(new MouseEvent('click',{bubbles:true}));expect(selected).toEqual([['weapon',0]]);
 expect(JSON.stringify(placementNodes(null))).toBe(original);
});
