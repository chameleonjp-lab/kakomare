export class Core {
  public readonly maxHealth: number;
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
}
