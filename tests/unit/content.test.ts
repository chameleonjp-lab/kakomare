import { describe, expect, it } from 'vitest';
import { BOSSES } from '../../src/data/bosses';
import { ENEMIES, ENEMY_ORDER } from '../../src/data/enemies';
import { STAGES, STAGE_ORDER } from '../../src/data/stages';
import { SUPPORTS, SUPPORT_ORDER } from '../../src/data/supports';
import { WEAPONS, WEAPON_ORDER } from '../../src/data/weapons';

describe('V5 content registry', () => {
  it('contains the complete planned content without duplicate ids', () => {
    expect(WEAPON_ORDER).toHaveLength(50);
    expect(SUPPORT_ORDER).toHaveLength(20);
    expect(ENEMY_ORDER).toHaveLength(12);
    expect(Object.keys(BOSSES)).toHaveLength(6);
    expect(STAGE_ORDER).toEqual(['stage-1', 'stage-2', 'stage-3', 'endless', 'stage-4', 'stage-5', 'stage-6']);
    expect(new Set(WEAPON_ORDER).size).toBe(50);
    expect(new Set(SUPPORT_ORDER).size).toBe(20);
    expect(new Set(ENEMY_ORDER).size).toBe(12);
    expect(Object.values(SUPPORTS).every((support) => support.levels.length === support.maxLevel)).toBe(true);
  });

  it('gives every runtime weapon eight levels, two branches per milestone, and one evolution', () => {
    for (const id of WEAPON_ORDER) {
      expect(WEAPONS[id].levels).toHaveLength(8);
      expect(WEAPONS[id].branches).toHaveLength(4);
      expect(WEAPONS[id].branches.filter((branch) => branch.atLevel === 3)).toHaveLength(2);
      expect(WEAPONS[id].branches.filter((branch) => branch.atLevel === 5)).toHaveLength(2);
      expect(WEAPONS[id].evolutions).toHaveLength(1);
      expect(WEAPONS[id].maxLevel).toBe(8);
    }
  });

  it('introduces stage enemies gradually and keeps endless mode unbounded', () => {
    expect(STAGES['stage-1'].enemies).toEqual(['shard', 'runner', 'lattice', 'spore']);
    expect(STAGES['stage-2'].enemies).toContain('dropper');
    expect(STAGES['stage-3'].enemies).toContain('phase');
    expect(STAGES.endless.enemies).toContain('factory');
    expect(STAGES['stage-4'].boss).toBe('gate');
    expect(STAGES['stage-5'].enemies).toContain('repair');
    expect(STAGES['stage-6'].boss).toBe('reactor');
    expect(STAGES.endless.isEndless).toBe(true);
    expect(STAGES.endless.timeLimit).toBe(Infinity);
    expect(Object.values(ENEMIES).every((enemy) => enemy.threatCost > 0)).toBe(true);
  });
});
