import { MAX_DEVICE_SLOT_COUNT,nodeIdForSlot } from '../../src/game/deviceLayout';
import type { WeaponSnapshot, SupportSnapshot } from '../../src/types/game';
import { expect,it } from 'vitest';
import { getEquipmentHelp,getWeaponHelp,getSupportHelp } from '../../src/ui/EquipmentHelp';
import { WEAPON_ORDER, WEAPONS } from '../../src/data/weapons';
import { SUPPORT_ORDER, SUPPORTS } from '../../src/data/supports';
import { languageService } from '../../src/services/LanguageService';
it('localizes every base equipment explanation on demand without changing source data or IDs',()=>{
 languageService.select('en');const before=JSON.stringify({WEAPONS,SUPPORTS});
 for(const id of WEAPON_ORDER){const help=getWeaponHelp(id);expect(help.id).toBe(id);expect(JSON.stringify(help),id).not.toMatch(/[ぁ-んァ-ヶ一-龯]/u);}
 for(const id of SUPPORT_ORDER){const help=getSupportHelp(id);expect(help.id).toBe(id);expect(JSON.stringify(help),id).not.toMatch(/[ぁ-んァ-ヶ一-龯]/u);}
 expect(JSON.stringify({WEAPONS,SUPPORTS})).toBe(before);
 languageService.select('ja');expect(getWeaponHelp('needle').name).toBe('連針砲');
});

it('translates installed equipment, connection descriptions and branches without changing snapshots',()=>{
 languageService.select('en');
 for(let offset=0;offset<WEAPON_ORDER.length;offset+=MAX_DEVICE_SLOT_COUNT){
 const weapons:WeaponSnapshot[]=WEAPON_ORDER.slice(offset,offset+MAX_DEVICE_SLOT_COUNT).map((id,index)=>({id,instanceId:`weapon-${id}`,nodeId:nodeIdForSlot('weapon',index),slot:index,level:8,damageDealt:0,branch:WEAPONS[id].branches[0]?.id??null,finalBranch:null,evolutionId:WEAPONS[id].evolution?.id??null}));
 const supports:SupportSnapshot[]=SUPPORT_ORDER.slice(offset%SUPPORT_ORDER.length,offset%SUPPORT_ORDER.length+MAX_DEVICE_SLOT_COUNT).map((id,index)=>({id,instanceId:`support-${id}`,nodeId:nodeIdForSlot('support',index),slot:index,level:3}));
 const snapshot={weapons,supports};const before=JSON.stringify(snapshot);
 const bundle=getEquipmentHelp(snapshot);
 for(const help of [...bundle.weapons,...bundle.supports]) expect(JSON.stringify(help),help.id).not.toMatch(/[ぁ-んァ-ヶ一-龯]/u);
 expect(JSON.stringify(snapshot)).toBe(before);
 }

});

it.each(['en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'])('renders the available %s equipment catalog without Japanese kana',language=>{
 languageService.select(language);
 for(const id of WEAPON_ORDER)expect(JSON.stringify(getWeaponHelp(id)),`${language}/${id}`).not.toMatch(/[ぁ-んァ-ヶ]/u);
 for(const id of SUPPORT_ORDER)expect(JSON.stringify(getSupportHelp(id)),`${language}/${id}`).not.toMatch(/[ぁ-んァ-ヶ]/u);
});
