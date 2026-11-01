// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
vi.mock('../../src/game/GameHost', () => ({ GameHost: class {} }));
import { AppController } from '../../src/app/AppController';
import { languageService } from '../../src/services/LanguageService';
import type { BattleResult } from '../../src/types/game';
interface ShareController { shareHome(): Promise<void>; shareResult(result: BattleResult): Promise<void>; shareService: { share(title: string,text:string): Promise<{success:boolean;method:string}> }; }
it('shares localized home and confirmed current result without leaking the player name', async () => {
  languageService.select('en');
  const controller = new AppController(document.createElement('main')) as unknown as ShareController;
  const texts: string[]=[];
  controller.shareService={share:async(_title,text)=>{texts.push(text);return {success:true,method:'x'};}};
  await controller.shareHome();
  await controller.shareResult({ score:1234,survivalTime:42,kills:8 } as BattleResult);
  expect(texts[0]).toContain('Defend against enemies from six directions');
  expect(texts[1]).toBe('Kakomare: 1,234 points, survived 42s, defeated 8.');
  expect(texts.join(' ')).not.toMatch(/[ぁ-んァ-ヶ]/u);
});
