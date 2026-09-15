import { describe, expect, it } from 'vitest';
import { detectDeviceProfile } from '../../src/app/deviceProfile';

function view(width: number, matches: boolean, maxTouchPoints = 0, userAgent = 'desktop'): Pick<Window, 'innerWidth' | 'matchMedia' | 'navigator'> {
  return {
    innerWidth: width,
    matchMedia: () => ({ matches } as MediaQueryList),
    navigator: { maxTouchPoints, userAgent } as Navigator,
  };
}

describe('device profile', () => {
  it('keeps narrow windows and touch-first devices in the mobile profile', () => {
    expect(detectDeviceProfile(view(390, false))).toBe('mobile');
    expect(detectDeviceProfile(view(1280, true))).toBe('mobile');
    expect(detectDeviceProfile(view(1280, false, 5))).toBe('mobile');
    expect(detectDeviceProfile(view(1280, false, 0, 'iPhone'))).toBe('mobile');
  });

  it('uses the fixed desktop profile for a wide mouse-first window', () => {
    expect(detectDeviceProfile(view(1280, false))).toBe('desktop');
  });
});
