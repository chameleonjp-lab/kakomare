import { describe, expect, it } from 'vitest';
import { BOSSES } from '../../src/data/bosses';
import { ENEMIES, ENEMY_ORDER } from '../../src/data/enemies';
import { STAGES, STAGE_ORDER } from '../../src/data/stages';
import { SUPPORTS, SUPPORT_ORDER } from '../../src/data/supports';
import { WEAPONS, WEAPON_ORDER } from '../../src/data/weapons';

describe('PR2 content registry', () => {
  it('contains the complete planned content without duplicate ids', () => {
    expect(WEAPON_ORDER).toHaveLength(8);
    expect(SUPPORT_ORDER).toHaveLength(6);
    expect(ENEMY_ORDER).toHaveLength(8);
    expect(Object.keys(BOSSES)).toHaveLength(3);
    expect(STAGE_ORDER).toEqual(['stage-1', 'stage-2', 'stage-3', 'endless']);
    expect(new Set(WEAPON_ORDER).size).toBe(8);
    expect(new Set(SUPPORT_ORDER).size).toBe(6);
    expect(new Set(ENEMY_ORDER).size).toBe(8);
    expect(Object.values(SUPPORTS).every((support) => support.levels.length === support.maxLevel)).toBe(true);
  });

  it('gives every weapon five levels and two planned branches', () => {
    for (const id of WEAPON_ORDER) {
      expect(WEAPONS[id].levels).toHaveLength(5);
      expect(WEAPONS[id].branches).toHaveLength(2);
      expect(WEAPONS[id].branches.every((branch) => branch.atLevel === 3)).toBe(true);
    }
  });

  it('introduces stage enemies gradually and keeps endless mode unbounded', () => {
    expect(STAGES['stage-1'].enemies).toEqual(['shard', 'runner', 'lattice', 'spore']);
    expect(STAGES['stage-2'].enemies).toContain('dropper');
    expect(STAGES['stage-3'].enemies).toContain('phase');
    expect(STAGES.endless.isEndless).toBe(true);
    expect(STAGES.endless.timeLimit).toBe(Infinity);
    expect(Object.values(ENEMIES).every((enemy) => enemy.threatCost > 0)).toBe(true);
  });
});
