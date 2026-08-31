export class LifecycleService {
  private readonly onHidden: () => void;
  private readonly onBeforeClose: () => void;
  private readonly onViewportChange?: () => void;
  private readonly onOrientationChange?: () => void;

  public constructor(onHidden: () => void, onBeforeClose: () => void, onViewportChange?: () => void, onOrientationChange?: () => void) {
    this.onHidden = onHidden;
    this.onBeforeClose = onBeforeClose;
    this.onViewportChange = onViewportChange;
    this.onOrientationChange = onOrientationChange;
  }

  public start(): () => void {
    const handleVisibility = (): void => {
      if (document.visibilityState === 'hidden') this.onHidden();
    };
    const handlePageHide = (): void => {
      this.onBeforeClose();
      this.onHidden();
    };
    const handleViewportChange = (): void => this.onViewportChange?.();
    const handleOrientationChange = (): void => this.onOrientationChange?.();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    this.onViewportChange?.();
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
    };
  }
}
