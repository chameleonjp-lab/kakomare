import { LANGUAGE_OPTIONS, languageService } from '../services/LanguageService';
import { translate } from '../services/TranslationService';
import { element } from './viewUtils';

export function createLanguageSelect(onChange: (language: string) => void): HTMLElement {
  const label = element('label', 'setting-row', translate('common.language'));
  const select = element('select');
  select.dataset.testid = 'language-select';
  select.setAttribute('aria-label', translate('common.language'));
  for (const [id, name] of LANGUAGE_OPTIONS) {
    const option = element('option', '', name);
    option.value = id; option.selected = id === languageService.language;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  label.append(select);
  return label;
}
