import { describe, expect, it } from 'vitest';
import { Enemy } from '../../src/game/entities/Enemy';
import { selectTarget } from '../../src/game/systems/TargetingSystem';

describe('TargetingSystem', () => {
  it('prefers an urgent enemy in the manual direction', () => {
    const manual = new Enemy(1, 'shard', 0, 120);
    const other = new Enemy(2, 'runner', Math.PI, 60);
    const target = selectTarget([manual, other], { x: 0, y: 0 }, { angle: 0, manual: true }, 600, 0);
    expect(target?.id).toBe(manual.id);
  });

  it('does not select an enemy outside weapon range', () => {
    const distant = new Enemy(1, 'shard', 0, 700);
    expect(selectTarget([distant], { x: 0, y: 0 }, { angle: 0, manual: false }, 560, 0)).toBeNull();
  });
});
