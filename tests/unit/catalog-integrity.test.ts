import placement from '../../src/i18n/placement.json';
import { expect,it } from 'vitest';
import messages from '../../src/i18n/interface.json';
import runtime from '../../src/i18n/runtime.json';
function tokens(value:string):string[]{return [...value.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort();}
it('keeps every interface and runtime placeholder present in each language',()=>{
 for(const catalog of [messages,runtime,placement]){
  const ja=catalog.ja as Record<string,string>;
  expect(Object.keys(catalog)).toHaveLength(15);
  for(const [locale,raw] of Object.entries(catalog)){
   const entries=raw as Record<string,string>;
   expect(Object.keys(entries).sort(),locale).toEqual(Object.keys(ja).sort());
   for(const key of Object.keys(ja)){
    expect(entries[key]?.trim(),`${locale}/${key}`).not.toBe('');
    expect(tokens(entries[key]!),`${locale}/${key}`).toEqual(tokens(ja[key]!));
   }
  }
 }
});
