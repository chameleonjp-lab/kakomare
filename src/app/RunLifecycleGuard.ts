export class RunLifecycleGuard {
  private running: boolean;

  public constructor(running = false) {
    this.running = running;
  }

  public start(): boolean {
    if (this.running) return false;
    this.running = true;
    return true;
  }

  public finish(): boolean {
    if (!this.running) return false;
    this.running = false;
    return true;
  }

  public cancel(): void {
    this.running = false;
  }

  public get active(): boolean {
    return this.running;
  }
}
