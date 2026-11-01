// @vitest-environment happy-dom
import { expect,it } from 'vitest';
import { renderSynergyTags } from '../../src/ui/SynergyTags';
import { SYNERGY_TAGS } from '../../src/data/synergyTags';
import { languageService } from '../../src/services/LanguageService';
it('translates tag text by stable IDs and retains colors and IDs',()=>{
 languageService.select('en');const original=JSON.stringify(SYNERGY_TAGS);
 const view=renderSynergyTags(['charge']);const tag=view.querySelector<HTMLElement>('[data-tag="charge"]')!;
 expect(tag.textContent).toBe('Charge');expect(tag.title).not.toMatch(/[ぁ-んァ-ヶ一-龯]/u);
 expect(tag.style.getPropertyValue('--synergy-tag-color')).toBe(SYNERGY_TAGS.charge.color);
 expect(JSON.stringify(SYNERGY_TAGS)).toBe(original);
});
