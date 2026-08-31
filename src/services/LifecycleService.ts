export class LifecycleService {
  private readonly onHidden: () => void;
  private readonly onBeforeClose: () => void;

  public constructor(onHidden: () => void, onBeforeClose: () => void) {
    this.onHidden = onHidden;
    this.onBeforeClose = onBeforeClose;
  }

  public start(): () => void {
    const handleVisibility = (): void => {
      if (document.visibilityState === 'hidden') this.onHidden();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', this.onBeforeClose);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', this.onBeforeClose);
    };
  }
}
