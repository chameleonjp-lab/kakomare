export interface ProgressionSnapshot {
  level: number;
  experience: number;
  nextExperience: number;
  pendingChoices: number;
}

export interface ProgressionInitialState {
  level?: number;
  experience?: number;
}

/**
 * Owns the run-local level and experience ledger.
 *
 * Experience stays in the ledger until a candidate is actually confirmed.
 * This keeps the displayed choices and the accounting transaction separate:
 * opening a dialog never consumes a level-up.
 */
export class ProgressionSystem {
  private _level: number;
  private _experience: number;

  public constructor(initial: ProgressionInitialState = {}) {
    this._level = Math.max(1, Math.floor(initial.level ?? 1));
    this._experience = Math.max(0, initial.experience ?? 0);
  }

  public get level(): number { return this._level; }
  public get experience(): number { return this._experience; }
  public get nextExperience(): number { return experienceRequiredForLevel(this._level); }

  public addExperience(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this._experience += amount;
  }

  public canChoose(): boolean {
    return this._experience >= this.nextExperience;
  }

  /** Number of level-up choices that can be confirmed without new experience. */
  public get pendingChoices(): number {
    let level = this._level;
    let experience = this._experience;
    let choices = 0;
    while (experience >= experienceRequiredForLevel(level)) {
      experience -= experienceRequiredForLevel(level);
      level += 1;
      choices += 1;
    }
    return choices;
  }

  /**
   * Consume exactly one level-up only after the caller has validated a choice.
   * Returns false without changing state when no choice is affordable.
   */
  public confirmChoice(): boolean {
    if (!this.canChoose()) return false;
    this._experience -= this.nextExperience;
    this._level += 1;
    return true;
  }

  public snapshot(): ProgressionSnapshot {
    return {
      level: this.level,
      experience: this.experience,
      nextExperience: this.nextExperience,
      pendingChoices: this.pendingChoices,
    };
  }
}

export function experienceRequiredForLevel(level: number): number {
  return 16 + Math.max(1, Math.floor(level)) * 9;
}

