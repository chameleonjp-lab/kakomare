import { describe, expect, it } from 'vitest';
import { isValidPlayerName } from '../../src/ui/viewUtils';

describe('player name validation', () => {
  it('accepts one to twelve visible characters after trimming', () => {
    expect(isValidPlayerName(' ひかり ')).toBe(true);
    expect(isValidPlayerName('あ'.repeat(12))).toBe(true);
  });

  it('rejects empty, overlong, and control-character names', () => {
    expect(isValidPlayerName('   ')).toBe(false);
    expect(isValidPlayerName('あ'.repeat(13))).toBe(false);
    expect(isValidPlayerName(`守り${String.fromCodePoint(0x1f)}手`)).toBe(false);
    expect(isValidPlayerName(`守り${String.fromCodePoint(0x7f)}手`)).toBe(false);
  });
});
