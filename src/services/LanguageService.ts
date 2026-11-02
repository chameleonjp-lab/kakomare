export const LANGUAGE_OPTIONS = [
  ['ja', '日本語'], ['en', 'English'], ['es', 'Español'], ['pt-BR', 'Português (Brasil)'],
  ['zh-Hans', '简体中文'], ['fr', 'Français'], ['de', 'Deutsch'], ['ko', '한국어'],
  ['ru', 'Русский'], ['it', 'Italiano'], ['zh-Hant', '繁體中文'], ['id', 'Bahasa Indonesia'],
  ['tr', 'Türkçe'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'],
] as const;
export type Language = typeof LANGUAGE_OPTIONS[number][0];
const isLanguage = (value: string): value is Language => LANGUAGE_OPTIONS.some(([id]) => id === value);
const STORAGE_KEY = 'kakomare.language.v1';
export function resolveLanguage(languages: readonly string[]): Language {
  for (const value of languages) {
    if (isLanguage(value)) return value;
    const lower = value.toLowerCase();
    if (lower.startsWith('zh')) return /hant|tw|hk|mo/.test(lower) ? 'zh-Hant' : 'zh-Hans';
    if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
    const base = lower.split('-')[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}
export class LanguageService {
  public language: Language;
  public constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null, languages: readonly string[]) {
    this.language = resolveLanguage(languages);
    try { const saved = storage?.getItem(STORAGE_KEY); if (saved && isLanguage(saved)) this.language = saved; } catch { /* Private browsing must not prevent playing. */ }
  }
  public select(language: string): boolean {
    if (!isLanguage(language)) return false;
    this.language = language;
    try { this.storage?.setItem(STORAGE_KEY, language); } catch { /* Keep the choice for this session. */ }
    return true;
  }
}
function browserStorage(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
export const languageService = new LanguageService(browserStorage(), typeof navigator === 'undefined' ? ['ja'] : navigator.languages?.length ? navigator.languages : [navigator.language]);
