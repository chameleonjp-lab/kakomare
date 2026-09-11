import { describe, expect, it } from 'vitest';
import { isValidPlayerName } from '../../src/ui/viewUtils';

describe('player name validation', () => {
  it('accepts one to twenty visible characters after trimming', () => {
    expect(isValidPlayerName(' ひかり ')).toBe(true);
    expect(isValidPlayerName('あ'.repeat(20))).toBe(true);
  });

  it('rejects empty, overlong, and control-character names', () => {
    expect(isValidPlayerName('   ')).toBe(false);
    expect(isValidPlayerName('あ'.repeat(21))).toBe(false);
    expect(isValidPlayerName(`守り${String.fromCodePoint(0x1f)}手`)).toBe(false);
    expect(isValidPlayerName(`守り${String.fromCodePoint(0x7f)}手`)).toBe(false);
  });
});
