import { describe, expect, it } from 'vitest';
import { DamageNumberPool } from '../../src/game/systems/DamageNumberPool';

describe('damage number pool', () => {
  it('does not exceed the configured active limit', () => {
    const pool = new DamageNumberPool();
    pool.emit(0, 0, 8, 0x63d7e6, 2);
    pool.emit(80, 0, 12, 0xffbe5c, 2);
    pool.emit(160, 0, 20, 0xa78bfa, 2);

    expect(pool.active()).toHaveLength(2);
    expect(pool.size).toBe(2);
  });

  it('combines rapid hits near the same enemy', () => {
    const pool = new DamageNumberPool();
    pool.emit(100, 100, 8, 0x63d7e6, 18);
    pool.emit(112, 104, 4, 0x63d7e6, 18);

    expect(pool.active()).toHaveLength(1);
    expect(pool.active()[0]?.amount).toBe(12);
  });

  it('disables the effect at the minimum budget and expires old entries', () => {
    const pool = new DamageNumberPool();
    pool.emit(0, 0, 8, 0x63d7e6, 0);
    expect(pool.active()).toHaveLength(0);

    pool.emit(0, 0, 8, 0x63d7e6, 1);
    pool.update(0.56, false);
    expect(pool.active()).toHaveLength(0);
  });

  it('only floats when motion reduction is disabled', () => {
    const pool = new DamageNumberPool();
    pool.emit(0, 20, 8, 0x63d7e6, 1);
    pool.update(0.1, true);
    expect(pool.active()[0]?.y).toBe(20);
    pool.update(0.1, false);
    expect(pool.active()[0]?.y).toBe(18.2);
  });
});
