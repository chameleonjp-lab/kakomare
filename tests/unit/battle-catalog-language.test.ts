import { expect,it } from 'vitest';
import runtime from '../../src/i18n/runtime.json';
import { languageService } from '../../src/services/LanguageService';
import { translateGameText } from '../../src/services/GameTextService';
it.each(['en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'])('renders every BattleScene status template in %s without changing substituted values',language=>{
 languageService.select(language);
 for(const [key,source] of Object.entries(runtime.ja).filter(([key])=>key.startsWith('battleStatus.'))){
  const values:Record<string,string>={};
  const original=source.replace(/\{(p\d+)\}/g,(_,name:string)=>values[name]=`VALUE_${name}_42`);
  const actual=translateGameText(original);
  expect(actual,key).not.toMatch(/[ぁ-んァ-ヶ]/u);
  for(const value of Object.values(values))expect(actual,key).toContain(value);
 }
});

it('translates actual device-kind values in move/swap messages, not just numeric sentinels',()=>{
 languageService.select('en');
 expect(translateGameText('武器を面3へ移設しました')).not.toMatch(/[ぁ-んァ-ヶ一-龯]/u);
 expect(translateGameText('補助の配置を入れ替えました')).not.toMatch(/[ぁ-んァ-ヶ一-龯]/u);
});
