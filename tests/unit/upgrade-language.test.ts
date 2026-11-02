import { expect,it } from 'vitest';
import { languageService } from '../../src/services/LanguageService';
import { localizeUpgradeCopy } from '../../src/ui/UpgradeCopy';
import { WEAPONS } from '../../src/data/weapons';
import type { UpgradeCandidate } from '../../src/types/game';
it('localizes a candidate display projection without changing selection identity or original strings',()=>{
 languageService.select('en');
 const source={id:'weapon:needle:level',kind:'weapon',targetId:'needle',title:'連針砲 Lv2',description:WEAPONS.needle.description+'威力を上げます。',before:'威力 10',after:'威力 12',role:WEAPONS.needle.role,isExisting:true} as UpgradeCandidate;
 const before=JSON.stringify(source);const copy=localizeUpgradeCopy(source);
 expect(copy.title).toBe('Needle Cannon Lv2');expect(copy.before).toBe('Power 10');expect(copy.after).toBe('Power 12');
 expect(copy.description).not.toMatch(/[ぁ-んァ-ヶ一-龯]/u);
 expect(JSON.stringify(source)).toBe(before);
 expect(copy).not.toHaveProperty('id');
});

import { Weapon } from '../../src/game/entities/Weapon';
import { SupportModule } from '../../src/game/entities/SupportModule';
import { WEAPON_ORDER } from '../../src/data/weapons';
import { SUPPORT_ORDER } from '../../src/data/supports';
import { createUpgradeCandidateList } from '../../src/game/systems/UpgradeSystem';
import { DeterministicRng } from '../../src/game/systems/SpawnDirector';
it('localizes real upgrade candidates at each growth boundary while retaining their source payloads',()=>{
 languageService.select('en');
 for(const level of [1,3,4,7,8])for(const id of WEAPON_ORDER)for(let seed=1;seed<=20;seed++){
  const weapon=new Weapon(id,0);weapon.level=level;
  const support=new SupportModule(SUPPORT_ORDER[seed%SUPPORT_ORDER.length]!,0);support.level=Math.min(level,3);
  for(const candidate of createUpgradeCandidateList([weapon],[support],70,new DeterministicRng(seed),new Set(),100,{}, {competitive:true,enableReplacements:true})){
   const before=JSON.stringify(candidate),copy=localizeUpgradeCopy(candidate);
   expect(JSON.stringify(copy),candidate.id).not.toMatch(/[ぁ-んァ-ヶ一-龯]/u);
   expect(JSON.stringify(candidate)).toBe(before);
  }
 }
});

it.each(['en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'])('translates growth-boundary candidate copy in %s',language=>{
 languageService.select(language);
 for(const level of [1,3,4,7,8])for(const id of WEAPON_ORDER)for(let seed=1;seed<=2;seed++){
  const weapon=new Weapon(id,0);weapon.level=level;
  const support=new SupportModule(SUPPORT_ORDER[seed]!,0);support.level=Math.min(level,3);
  for(const candidate of createUpgradeCandidateList([weapon],[support],70,new DeterministicRng(seed),new Set(),100,{}, {competitive:true,enableReplacements:true})){
   expect(JSON.stringify(localizeUpgradeCopy(candidate)),`${language}/${candidate.id}`).not.toMatch(/[ぁ-んァ-ヶ]/u);
  }
 }
});
