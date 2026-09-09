export class Core {
  public maxHealth: number;
  public health: number;

  public constructor(maxHealth = 100) {
    this.maxHealth = maxHealth;
    this.health = maxHealth;
  }

  public damage(amount: number): number {
    const actual = Math.max(0, Math.min(this.health, amount));
    this.health -= actual;
    return actual;
  }

  public heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + Math.max(0, amount));
  }

  /** Increase capacity and restore the same amount, including from full health. */
  public reinforce(amount: number): void {
    const safeAmount = Math.max(0, amount);
    this.maxHealth += safeAmount;
    this.health = Math.min(this.maxHealth, this.health + safeAmount);
  }
}
