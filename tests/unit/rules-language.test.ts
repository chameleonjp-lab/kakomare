// @vitest-environment happy-dom
import { expect,it } from 'vitest';
import { createRulesView } from '../../src/ui/RulesView';
import { languageService } from '../../src/services/LanguageService';
it('explains unchanged numeric rules in English without Japanese copy', () => {
 languageService.select('en');
 const text=createRulesView(()=>{}).textContent!;
 expect(text).toContain('30'); expect(text).toContain('0.8'); expect(text).toContain('Lv3');
 expect(text).not.toMatch(/[ぁ-んァ-ヶ一-龯]/u);
 expect(text).toContain('no time limit');
});
it.each(['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'] as const)('shows the complete rule conditions for %s',language=>{
 languageService.select(language);const text=createRulesView(()=>{}).textContent!;
 for(const value of ['0.8','30','Lv3']) expect(text).toContain(value);
 expect(text).not.toContain('rules.');
 if(language!=='ja')expect(text).not.toMatch(/[ぁ-んァ-ヶ]/u);
});
