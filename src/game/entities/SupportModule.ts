import { SUPPORTS } from '../../data/supports';
import type { SupportId } from '../../types/content';

export class SupportModule {
  public readonly id: SupportId;
  public level = 1;
  public readonly slot: number;

  public constructor(id: SupportId, slot: number) {
    this.id = id;
    this.slot = slot;
  }

  public get definition() {
    return SUPPORTS[this.id];
  }

  public get value() {
    return this.definition.levels[this.level - 1].value;
  }
}
