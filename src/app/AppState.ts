import type { StageId } from '../types/content';
import type { SaveData } from '../types/save';
import type { AppView } from './routes';

export interface AppState {
  view: AppView;
  save: SaveData;
  selectedStage: StageId;
  notice: string;
}

export function createAppState(save: SaveData): AppState {
  return {
    view: save.profile.name ? 'home' : 'name-entry',
    save,
    selectedStage: 'stage-1',
    notice: '',
  };
}
