import { describe, expect, it } from 'vitest';
import { SUPPORTS, SUPPORT_ORDER } from '../../src/data/supports';
import { WEAPONS, WEAPON_ORDER } from '../../src/data/weapons';
import { getEquipmentHelp, getSupportHelp, getWeaponHelp } from '../../src/ui/EquipmentHelp';
import { nodeIdForSlot } from '../../src/game/deviceLayout';
import type { SupportSnapshot, WeaponSnapshot } from '../../src/types/game';

function weaponSnapshot(id: (typeof WEAPON_ORDER)[number], slot: number, overrides: Partial<WeaponSnapshot> = {}): WeaponSnapshot {
  return {
    id,
    instanceId: `weapon-${id}-${slot}`,
    nodeId: nodeIdForSlot('weapon', slot),
    slot,
    level: 8,
    damageDealt: 0,
    branch: null,
    finalBranch: null,
    evolutionId: null,
    ...overrides,
  };
}

function supportSnapshot(id: (typeof SUPPORT_ORDER)[number], slot: number, level = 3): SupportSnapshot {
  return {
    id,
    instanceId: `support-${id}-${slot}`,
    nodeId: nodeIdForSlot('support', slot),
    slot,
    level,
  };
}

describe('equipment help copy and snapshot connections', () => {
  it('does not promise enemy-following drones or shield-ignoring lances in the candidate summary', () => {
    expect(WEAPONS.drone.description).toContain('設置した武器の周り');
    expect(getWeaponHelp('drone').current).toContain('設置した武器の周り');
    expect(WEAPONS.lance.description).toContain('防御は無視できません');
    expect(WEAPONS.grid.description).toContain('同時に');
  });
  it('provides non-empty user-facing copy for all 50 weapons and all 20 supports', () => {
    expect(WEAPON_ORDER).toHaveLength(50);
    expect(SUPPORT_ORDER).toHaveLength(20);
    expect(new Set(WEAPON_ORDER).size).toBe(50);
    expect(new Set(SUPPORT_ORDER).size).toBe(20);

    const weapons = WEAPON_ORDER.map((id, index) => weaponSnapshot(id, index % 18));
    const supports = SUPPORT_ORDER.map((id, index) => supportSnapshot(id, index % 18));
    const bundle = getEquipmentHelp({ weapons, supports });
    expect(bundle.weapons).toHaveLength(50);
    expect(bundle.supports).toHaveLength(20);

    for (const help of [...bundle.weapons, ...bundle.supports]) {
      expect(help.name.trim()).not.toBe('');
      expect(help.role.trim()).not.toBe('');
      expect(help.summary.trim()).not.toBe('');
      expect(help.current.trim()).not.toBe('');
      expect(help.effects.length).toBeGreaterThan(0);
      expect(help.conditions.length).toBeGreaterThan(0);
      expect(help.connections.length).toBeGreaterThan(0);
      expect(help.synergies.length).toBeGreaterThan(0);
      expect(help.limits.length).toBeGreaterThan(0);
      const visibleCopy = [help.summary, help.current, ...help.effects, ...help.conditions, ...help.limits].join('\n');
      expect(visibleCopy).not.toContain('現行の');
    }
  });

  it('uses the installed face snapshot to report adjacent and relay connections', () => {
    const weapons = [
      weaponSnapshot('needle', 0),
      weaponSnapshot('ray', 1),
      weaponSnapshot('cluster', 3),
    ];
    const supports = [
      supportSnapshot('output', 0),
      supportSnapshot('relay', 3),
      supportSnapshot('ignite', 8),
    ];
    const needleHelp = getWeaponHelp(weapons[0]!, supports, weapons);
    expect(needleHelp.connections.some((line) => line.startsWith('出力環 Lv3'))).toBe(true);
    expect(needleHelp.connections.some((line) => line.startsWith('継電環'))).toBe(true);
    expect(needleHelp.synergies.some((line) => line.includes('誘爆環') && line.includes('連針砲'))).toBe(true);

    const relayHelp = getSupportHelp(supports[1]!, weapons);
    expect(relayHelp.connections.some((line) => line.includes('連針砲') && line.includes('内側'))).toBe(true);
    expect(relayHelp.connections.some((line) => line.includes('群集弾'))).toBe(true);
    expect(relayHelp.conditions.join(' ')).toContain('内側');
  });

  it('shows concrete runtime conditions for ignite, shatter, and pulse', () => {
    const weapons = [
      weaponSnapshot('barrage', 0, { branch: 'piercing', evolutionId: 'scatter-fan' }),
      weaponSnapshot('ray', 1),
    ];
    const supports = [
      supportSnapshot('ignite', 5),
      supportSnapshot('shatter', 0),
      supportSnapshot('pulse', 0, 2),
    ];
    const igniteHelp = getSupportHelp(supports[0]!, weapons);
    expect(igniteHelp.connections[0]).toContain('配置全体に作用');
    expect(igniteHelp.conditions.join(' ')).toContain('印または燃焼');
    expect(igniteHelp.synergies.join(' ')).toContain('最初の散弾幕');
    expect(igniteHelp.effects.join(' ')).toContain('その時点の威力の');
    expect(igniteHelp.effects.join(' ')).not.toContain('基礎威力');

    const barrageHelp = getWeaponHelp(weapons[0]!, supports, weapons);
    expect(barrageHelp.effects.join(' ')).toContain('集中深化');
    expect(barrageHelp.effects.join(' ')).toContain('追加貫通');
    expect(barrageHelp.limits.join(' ')).toContain('集中深化');

    const pulseHelp = getSupportHelp(supports[2]!, weapons);
    expect(pulseHelp.effects.join(' ')).toContain('2.4秒');
    expect(pulseHelp.synergies.join(' ')).toContain('散弾幕');
  });

  it('describes the live long lance branch and marks an inapplicable support connection', () => {
    const lance = weaponSnapshot('lance', 0, { branch: 'long' });
    const brake = supportSnapshot('brake', 0);
    const help = getWeaponHelp(lance, [brake], [lance]);
    const visibleEffects = help.effects.join(' ');
    const visibleLimits = help.limits.join(' ');

    expect(visibleEffects).toContain('長槍型');
    expect(visibleEffects).toContain('射程を18%');
    expect(visibleEffects).toContain('幅を4');
    expect(visibleLimits).toContain('長槍型は射程を18%、幅を4広げ');
    expect(visibleLimits).not.toContain('射程を変えず');
    expect(help.connections.join(' ')).toContain('制動環 Lv3: 接続されていますが、この武器には作用しません。');
    expect(help.connections.join(' ')).not.toContain('制動効果 +28%');
  });

  it('keeps every catalog level/evolution label available to the help path', () => {
    for (const id of WEAPON_ORDER) {
      const definition = WEAPONS[id];
      expect(definition.levels).toHaveLength(8);
      expect(definition.branches).toHaveLength(4);
      expect(definition.branches.every((branch) => branch.description.trim().length > 0)).toBe(true);
      expect(definition.evolutions).toHaveLength(1);
      expect(definition.evolutions[0]?.description.trim()).not.toBe('');
    }
    for (const id of SUPPORT_ORDER) {
      const definition = SUPPORTS[id];
      expect(definition.levels).toHaveLength(3);
      expect(definition.levels.every((level) => level.label.trim().length > 0)).toBe(true);
    }
  });
});
