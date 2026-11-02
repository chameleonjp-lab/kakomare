import { translateData,translatePlacementText } from '../services/GameTextService';
import { synergyTagDefinitions, type SynergyTagId } from '../data/synergyTags';
import { element } from './viewUtils';

/** Render colour-coded, text-labelled tags. Colour is supportive, not the only cue. */
export function renderSynergyTags(ids: readonly SynergyTagId[], label = '相性タグ'): HTMLElement {
  label = translatePlacementText(label);
  const wrapper = element('div', 'synergy-tags');
  wrapper.setAttribute('aria-label', label);
  wrapper.append(element('span', 'synergy-tags-label', label));
  const tags = element('div', 'synergy-tag-list');
  for (const tagDefinition of synergyTagDefinitions(ids)) {
    const text = translateData(`data.synergyTags.label.${tagDefinition.id}`,tagDefinition.label);
    const description = translateData(`data.synergyTags.description.${tagDefinition.id}`,tagDefinition.description);
    const tag = element('span', 'synergy-tag', text);
    tag.dataset.tag = tagDefinition.id;
    tag.title = description;
    tag.setAttribute('aria-label', `${text}：${description}`);
    tag.style.setProperty('--synergy-tag-color', tagDefinition.color);
    tags.append(tag);
  }
  wrapper.append(tags);
  return wrapper;
}

