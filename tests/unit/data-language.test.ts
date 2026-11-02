import { expect,it } from 'vitest';
import { WEAPONS } from '../../src/data/weapons';
import { languageService } from '../../src/services/LanguageService';
import { translateGameText,translateData } from '../../src/services/GameTextService';
it('translates trusted weapon labels at display time while preserving game records',()=>{
 languageService.select('en');const original=WEAPONS.needle.name;
 expect(translateData('data.weapons.name.needle', original)).toBe('Needle Cannon');
 expect(translateGameText(original)).toBe('Needle Cannon');
 expect(WEAPONS.needle.name).toBe('連針砲');
});

it('provides all 920 data fields in all 15 selected languages without changing IDs',()=>{
 const files=import.meta.glob('../../src/i18n/data/*.json',{eager:true,import:'default'}) as Record<string,Record<string,string>>;
 const ja=files['../../src/i18n/data/ja.json']!;
 expect(Object.keys(files)).toHaveLength(15);expect(Object.keys(ja)).toHaveLength(920);
 for(const [path,values] of Object.entries(files)){
  const locale=path.split('/').at(-1)!.replace('.json','');
  expect(Object.keys(values).sort(),locale).toEqual(Object.keys(ja).sort());
  languageService.select(locale);
  for(const [key,source] of Object.entries(ja)) expect(translateData(key,source),`${locale}/${key}`).toBe(values[key]);
 }
 languageService.select('ja');
});
