import { expect,it } from 'vitest';
import { translate } from '../../src/services/TranslationService';
it('formats upgrade and replacement instructions without changing quantities or user-provided text',()=>{
 expect(translate('upgrade.pending',{count:3},'en')).toBe('Unselected upgrades: 3');
 expect(translate('upgrade.chooseAria',{title:'<needle> $&',description:'Power 12'},'en')).toBe('Choose <needle> $&. Power 12');
 expect(translate('upgrade.replaceCopy',{name:'Needle Cannon',level:8,resultLevel:4},'en')).toBe('Remove Needle Cannon Lv8 and place the new device at Lv4. Its previous branch and evolution are not carried over.');
});
