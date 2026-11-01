import { expect,it } from 'vitest';
import { translateGameText } from '../../src/services/GameTextService';
import { languageService } from '../../src/services/LanguageService';
it('translates storage recovery notices only for display and keeps unknown notices honest',()=>{
 languageService.select('en');
 expect(translateGameText('途中状態が壊れているため、再開できません。')).toBe('The saved play is damaged and cannot be resumed.');
 expect(translateGameText('新しい保存データを読み込めなかったため、以前の保存から復元しました。')).toBe('The latest save could not be loaded. Restored an earlier save.');
 expect(translateGameText('unknown status 42')).toBe('unknown status 42');
});
