import placement from '../i18n/placement.json';
import { languageService } from './LanguageService';
import { createRuntimeTranslator } from './RuntimeTranslationService';
import ja from '../i18n/data/ja.json';
import en from '../i18n/data/en.json';
import runtime from '../i18n/runtime.json';
import equipmentJa from '../i18n/equipment/ja.json';
import equipment1 from '../i18n/equipment/en.json';
import equipment2 from '../i18n/equipment/es.json';
import equipment3 from '../i18n/equipment/pt-BR.json';
import equipment4 from '../i18n/equipment/zh-Hans.json';
import equipment5 from '../i18n/equipment/fr.json';
import equipment6 from '../i18n/equipment/de.json';
import equipment7 from '../i18n/equipment/ko.json';
import equipment8 from '../i18n/equipment/ru.json';
import equipment9 from '../i18n/equipment/it.json';
import equipment10 from '../i18n/equipment/zh-Hant.json';
import equipment11 from '../i18n/equipment/id.json';
import equipment12 from '../i18n/equipment/tr.json';
import equipment13 from '../i18n/equipment/vi.json';
import equipment14 from '../i18n/equipment/th.json';
const equipment: Record<string,Record<string,string>> = {'ja':equipmentJa,'en':equipment1,'es':equipment2,'pt-BR':equipment3,'zh-Hans':equipment4,'fr':equipment5,'de':equipment6,'ko':equipment7,'ru':equipment8,'it':equipment9,'zh-Hant':equipment10,'id':equipment11,'tr':equipment12,'vi':equipment13,'th':equipment14};
import data0 from '../i18n/data/es.json';
import data1 from '../i18n/data/pt-BR.json';
import data2 from '../i18n/data/zh-Hans.json';
import data3 from '../i18n/data/fr.json';
import data4 from '../i18n/data/de.json';
import data5 from '../i18n/data/ko.json';
import data6 from '../i18n/data/ru.json';
import data7 from '../i18n/data/it.json';
import data8 from '../i18n/data/zh-Hant.json';
import data9 from '../i18n/data/id.json';
import data10 from '../i18n/data/tr.json';
import data11 from '../i18n/data/vi.json';
import data12 from '../i18n/data/th.json';
const catalogs: Record<string, Record<string,string>> = { ja, en, 'es':data0, 'pt-BR':data1, 'zh-Hans':data2, 'fr':data3, 'de':data4, 'ko':data5, 'ru':data6, 'it':data7, 'zh-Hant':data8, 'id':data9, 'tr':data10, 'vi':data11, 'th':data12 };
const runtimeCatalogs = Object.fromEntries(Object.entries(runtime).map(([language, entries]) => [language, { ...catalogs[language], ...entries }]));
const runtimeTranslator = createRuntimeTranslator(runtimeCatalogs);
/** Only call with trusted game-defined text. Never use for names or IDs. */
export function translateGameText(source: string): string { return runtimeTranslator(source, languageService.language); }
export function translateData(key: string, source: string): string { return catalogs[languageService.language]?.[key] ?? source; }

// EquipmentHelp is an explicit presentation context. Its authored descriptions
// win over a data-catalog paraphrase of the same Japanese source; no global
// ambiguity is resolved by guessing. Only secondary sources absent here are added.
const equipmentSources = new Set(Object.values(equipmentJa));
const dataOnlyKeys = Object.keys(ja).filter(key => !equipmentSources.has(ja[key as keyof typeof ja]));
const equipmentCatalogs = Object.fromEntries(Object.entries(runtime).map(([language]) => [language, {
  ...Object.fromEntries(dataOnlyKeys.filter(key => catalogs[language]?.[key] !== undefined).map(key => [key, catalogs[language]![key]!])),
  ...equipment[language],
}]));
const equipmentTranslator = createRuntimeTranslator(equipmentCatalogs);
export function translateEquipmentText(source: string): string { return equipmentTranslator(source, languageService.language); }

const placementTranslator = createRuntimeTranslator(placement);
/** Placement-only context: its short SVG labels must not match unrelated notices. */
export function translatePlacementText(source: string): string { return placementTranslator(source, languageService.language); }
