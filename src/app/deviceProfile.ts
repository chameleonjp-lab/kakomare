/**
 * The game has one rule and input contract, but its surrounding layout needs
 * to know whether it is being used as a touch-first phone/tablet experience
 * or as a mouse/keyboard-first PC experience.
 *
 * A small viewport is treated as the compact profile even when a test browser
 * does not expose a coarse pointer. This keeps the layout safe in embedded
 * mobile webviews and makes narrow-window behaviour deterministic.
 */
export type DeviceProfile = 'mobile' | 'desktop';

const COMPACT_WIDTH = 760;
const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|IEMobile|Windows Phone/i;

export function detectDeviceProfile(view: Pick<Window, 'innerWidth' | 'matchMedia' | 'navigator'> = window): DeviceProfile {
  const compactViewport = view.innerWidth > 0 && view.innerWidth <= COMPACT_WIDTH;
  const coarsePointer = view.matchMedia?.('(pointer: coarse)').matches ?? false;
  const noHover = view.matchMedia?.('(hover: none)').matches ?? false;
  const touchPoints = view.navigator.maxTouchPoints ?? 0;
  const mobileUserAgent = MOBILE_USER_AGENT.test(view.navigator.userAgent);
  return compactViewport || coarsePointer || noHover || touchPoints > 0 || mobileUserAgent ? 'mobile' : 'desktop';
}

export function applyDeviceProfile(root: HTMLElement, profile: DeviceProfile): void {
  root.dataset.deviceProfile = profile;
  root.classList.toggle('app-root-mobile', profile === 'mobile');
  root.classList.toggle('app-root-desktop', profile === 'desktop');
}
