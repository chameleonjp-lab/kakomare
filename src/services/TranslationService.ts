import { languageService, type Language } from './LanguageService';
import messages from '../i18n/interface.json';
export function translate(key: string, params: Record<string, string | number> = {}, language: Language = languageService.language): string {
  const catalog = messages[language] as Record<string, string>;
  const message = catalog[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (token, name: string) => Object.hasOwn(params, name) ? String(params[name]) : token);
}
export function formatNumber(value: number): string { return value.toLocaleString(languageService.language); }
