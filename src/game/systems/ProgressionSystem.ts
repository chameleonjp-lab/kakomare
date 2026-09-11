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

export const MAX_PROGRESSION_LEVEL = 10_000;
export const MAX_PROGRESSION_EXPERIENCE = 1_000_000_000;
export const MAX_PENDING_CHOICES = 10_000;

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
    if (!Number.isFinite(amount) || amount <= 0 || this._experience + amount > MAX_PROGRESSION_EXPERIENCE) return;
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
      if (choices > MAX_PENDING_CHOICES || level > MAX_PROGRESSION_LEVEL) return MAX_PENDING_CHOICES + 1;
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

  /** Restore only a validated safe-boundary snapshot. */
  public restore(snapshot: ProgressionSnapshot): boolean {
    if (!snapshot || !Number.isSafeInteger(snapshot.level) || snapshot.level < 1 || snapshot.level > MAX_PROGRESSION_LEVEL || !Number.isSafeInteger(snapshot.experience) || snapshot.experience < 0 || snapshot.experience > MAX_PROGRESSION_EXPERIENCE
      || snapshot.nextExperience !== experienceRequiredForLevel(snapshot.level) || !Number.isSafeInteger(snapshot.pendingChoices) || snapshot.pendingChoices < 0 || snapshot.pendingChoices > MAX_PENDING_CHOICES) return false;
    let expectedChoices = 0;
    let level = snapshot.level;
    let experience = snapshot.experience;
    while (experience >= experienceRequiredForLevel(level)) {
      experience -= experienceRequiredForLevel(level);
      level += 1;
      expectedChoices += 1;
      if (expectedChoices > snapshot.pendingChoices || expectedChoices > MAX_PENDING_CHOICES || level > MAX_PROGRESSION_LEVEL) return false;
    }
    if (expectedChoices !== snapshot.pendingChoices) return false;
    this._level = snapshot.level;
    this._experience = snapshot.experience;
    return true;
  }
}

export function experienceRequiredForLevel(level: number): number {
  return 16 + Math.max(1, Math.floor(level)) * 9;
}
