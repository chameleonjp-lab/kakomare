import { synergyTagDefinitions, type SynergyTagId } from '../data/synergyTags';
import { element } from './viewUtils';

/** Render colour-coded, text-labelled tags. Colour is supportive, not the only cue. */
export function renderSynergyTags(ids: readonly SynergyTagId[], label = '相性タグ'): HTMLElement {
  const wrapper = element('div', 'synergy-tags');
  wrapper.setAttribute('aria-label', label);
  wrapper.append(element('span', 'synergy-tags-label', label));
  const tags = element('div', 'synergy-tag-list');
  for (const tagDefinition of synergyTagDefinitions(ids)) {
    const tag = element('span', 'synergy-tag', tagDefinition.label);
    tag.dataset.tag = tagDefinition.id;
    tag.title = tagDefinition.description;
    tag.setAttribute('aria-label', `${tagDefinition.label}：${tagDefinition.description}`);
    tag.style.setProperty('--synergy-tag-color', tagDefinition.color);
    tags.append(tag);
  }
  wrapper.append(tags);
  return wrapper;
}
