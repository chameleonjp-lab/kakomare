// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHomeView } from '../../src/ui/HomeView';
import { createSettingsView } from '../../src/ui/SettingsView';
import { createDefaultSave } from '../../src/types/save';
import { languageService } from '../../src/services/LanguageService';
beforeEach(() => { document.body.replaceChildren(); languageService.select('en'); });
describe('localized home and settings', () => {
  it('renders translated names/help and offers every supported language without starting play', () => {
    const start = vi.fn(), changeLanguage = vi.fn();
    const view = createHomeView(createDefaultSave(), { start, changeLanguage });
    document.body.append(view);
    expect(view.textContent).toContain('Name (optional)');
    expect(view.textContent).toContain('You can play without a name.');
    const select = view.querySelector<HTMLSelectElement>('[data-testid="language-select"]')!;
    expect(select.options).toHaveLength(15);
    select.value = 'fr'; select.dispatchEvent(new Event('change'));
    expect(changeLanguage).toHaveBeenCalledWith('fr');
    expect(start).not.toHaveBeenCalled();
  });
  it('defers a language request until name composition is committed', () => {
    const events: string[] = [];
    const view = createHomeView(createDefaultSave(), { start: () => {}, changeName: name => events.push('name:'+name), changeLanguage: lang => events.push('language:'+lang) });
    const input = view.querySelector<HTMLInputElement>('#player-name')!;
    const select = view.querySelector<HTMLSelectElement>('[data-testid="language-select"]')!;
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = 'テスト'; select.value = 'fr'; select.dispatchEvent(new Event('change'));
    expect(events).toEqual([]);
    input.dispatchEvent(new CompositionEvent('compositionend'));
    expect(events).toEqual(['name:テスト','language:fr']);
  });
  it('keeps explicit zero sound settings and name edits when selecting another language', () => {
    const save = createDefaultSave(); save.settings.audio = 0; save.settings.music = 0;
    const names: string[] = [], languages: string[] = [];
    const view = createSettingsView(save, { change: () => {}, changeName: name => names.push(name), changeLanguage: lang => languages.push(lang), back: () => {} });
    expect(view.textContent).toContain('Sound effects');
    expect(view.querySelector<HTMLInputElement>('#settings-audio')!.value).toBe('0');
    const input = view.querySelector<HTMLInputElement>('#settings-name')!;
    input.value = 'New name'; input.dispatchEvent(new Event('change'));
    const select = view.querySelector<HTMLSelectElement>('[data-testid="language-select"]')!;
    select.value = 'th'; select.dispatchEvent(new Event('change'));
    expect(names).toEqual(['New name']); expect(languages).toEqual(['th']);
    expect(save.settings.audio).toBe(0);
  });
});

vi.mock('../../src/game/GameHost', () => ({ GameHost: class { stop() {} } }));
import { AppController } from '../../src/app/AppController';
interface LanguageController {
  state: { view: string }; changeLanguage(language: string): void; render(view: string): void;
}
describe('controller language boundary', () => {
  it.each(['battle','countdown','paused','result'])('does not rerender or stop %s for language changes', view => {
    const controller = new AppController(document.createElement('main')) as unknown as LanguageController;
    controller.state.view = view; const render = vi.spyOn(controller, 'render');
    controller.changeLanguage('fr');
    expect(render).not.toHaveBeenCalled();
    expect(languageService.language).toBe('en');
  });
  it.each(['home','settings'])('refreshes only %s without resetting saved game settings', view => {
    const controller = new AppController(document.createElement('main')) as unknown as LanguageController;
    controller.state.view = view; const render = vi.spyOn(controller, 'render').mockImplementation(() => {});
    controller.changeLanguage('fr');
    expect(languageService.language).toBe('fr');
    expect(render).toHaveBeenCalledExactlyOnceWith(view);
    expect(document.documentElement.lang).toBe('fr');
  });
});
