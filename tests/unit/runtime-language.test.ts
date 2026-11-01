import { expect,it } from 'vitest';
import { createRuntimeTranslator } from '../../src/services/RuntimeTranslationService';
it('translates trusted game labels and nested templates without mutating source records',()=>{
 const catalog={ja:{weapon:'連針砲',level:'{p0} Lv{p1}',picked:'{p0}を取得しました'},en:{weapon:'Needle Cannon',level:'{p0} Lv{p1}',picked:'Acquired {p0}'}};
 const source={title:'連針砲 Lv2',status:'連針砲 Lv2を取得しました'};
 const translate=createRuntimeTranslator(catalog);
 expect(translate(source.status,'en')).toBe('Acquired Needle Cannon Lv2');
 expect(source).toEqual({title:'連針砲 Lv2',status:'連針砲 Lv2を取得しました'});
 expect(translate('unknown text','en')).toBe('unknown text');
 expect(translate(source.status,'ja')).toBe(source.status);
});
it('escapes literal regex symbols and does not reinterpret replacement characters',()=>{
 const translate=createRuntimeTranslator({ja:{label:'強化+({p0})'},en:{label:'Upgrade ({p0})'}});
 expect(translate('強化+($&<tag>)','en')).toBe('Upgrade ($&<tag>)');
 expect(translate('強化ZZtest','en')).toBe('強化ZZtest');
});
it('does not guess between colliding source labels with different meanings',()=>{
 const translate=createRuntimeTranslator({ja:{a:'同じ',b:'同じ'},en:{a:'Same A',b:'Same B'}});
 expect(translate('同じ','en')).toBe('同じ');
});
