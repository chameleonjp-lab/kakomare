import { describe, expect, it } from 'vitest';
import { Enemy } from '../../src/game/entities/Enemy';
import { selectTarget, targetPriority } from '../../src/game/systems/TargetingSystem';

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

  it('keeps manual aim inside the sixty-degree fan when another enemy is more urgent', () => {
    const aimed = new Enemy(1, 'shard', 0, 180);
    const urgent = new Enemy(2, 'runner', Math.PI, 58);
    expect(selectTarget([aimed, urgent], { x: 0, y: 0 }, { angle: 0, manual: true }, 600, 0, 'needle')?.id).toBe(aimed.id);
  });

  it('keeps a valid locked target until it leaves the eligible set', () => {
    const locked = new Enemy(1, 'shard', 0, 180);
    const urgent = new Enemy(2, 'runner', Math.PI, 60);
    expect(selectTarget([locked, urgent], { x: 0, y: 0 }, { angle: 0, manual: false }, 600, 0, 'needle', locked.id)?.id).toBe(locked.id);
  });

  it('gives group weapons a bonus against enemies with nearby partners', () => {
    const target = new Enemy(1, 'shard', 0, 180);
    const partner = new Enemy(2, 'shard', 0.1, 190);
    expect(selectTarget([target, partner], { x: 0, y: 0 }, { angle: 0, manual: false }, 600, 0, 'cluster')?.id).toBe(target.id);
  });

  it('includes a marker speed boost when estimating arrival danger', () => {
    const marked = new Enemy(1, 'shard', 0, 160);
    const unmarked = new Enemy(2, 'shard', Math.PI, 145);
    const marker = new Enemy(3, 'marker', 0, 270);
    const enemies = [marked, unmarked, marker];
    expect(targetPriority(marked, { angle: 0, manual: false }, 0, 'needle', enemies))
      .toBeGreaterThan(targetPriority(unmarked, { angle: 0, manual: false }, 0, 'needle', enemies));
  });
});
