import { describe, expect, it } from 'vitest';
import { LanguageService, resolveLanguage } from '../../src/services/LanguageService';

const storage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
describe('language selection without game state writes', () => {
  it('uses the saved choice before the browser and preserves other game keys', () => {
    const saved = storage({ 'kakomare.language.v1': 'fr', 'kakomare-save-v2': 'existing game' });
    const service = new LanguageService(saved, ['ja-JP']);
    expect(service.language).toBe('fr');
    service.select('th');
    expect(new LanguageService(saved, ['en-US']).language).toBe('th');
    expect(saved.getItem('kakomare-save-v2')).toBe('existing game');
  });
  it.each([['pt-PT', 'pt-BR'], ['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-CN', 'zh-Hans'], ['ko-KR', 'ko'], ['xx', 'en']])('resolves %s to %s', (input, expected) => {
    expect(resolveLanguage([input])).toBe(expected);
  });
  it('tries every browser preference before English and rejects invalid saved settings', () => {
    expect(new LanguageService(storage({ 'kakomare.language.v1': 'invalid' }), ['xx', 'de-DE']).language).toBe('de');
  });
  it('keeps selection usable when storage is unavailable without touching game data', () => {
    const service = new LanguageService({ getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('quota'); } }, ['vi']);
    expect(service.language).toBe('vi');
    expect(() => service.select('en')).not.toThrow();
    expect(service.language).toBe('en');
    expect(service.select('invalid')).toBe(false);
    expect(service.language).toBe('en');
  });
});

import { translate } from '../../src/services/TranslationService';
describe('localized player-facing text', () => {
  it('renders the chosen language and safely interpolates a player name as text', () => {
    expect(translate('home.greeting', { name: '<img src=x>' }, 'en')).toBe('<img src=x>, protect the core.');
    expect(translate('common.share', {}, 'ja')).toBe('Xでシェア');
    expect(translate('common.ranking', {}, 'ja')).toBe('ランキング');
    expect(translate('home.play', {}, 'fr')).toBe('Jouer');
  });
  it.each(['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'] as const)('has actual home and settings copy for %s', (language) => {
    for (const key of ['home.description','home.nameHelp','settings.description','settings.effects','settings.sound']) {
      const text = translate(key, {}, language);
      expect(text).not.toBe(key);
      expect(text.length).toBeGreaterThan(0);
      if (language !== 'ja') expect(text).not.toMatch(/[ぁ-んァ-ヶ]/u);
    }
  });
});
