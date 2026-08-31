import Phaser from 'phaser';
import type { SupportSnapshot, WeaponSnapshot } from '../../types/game';
import { drawHex, drawPolygon, polygonPoints } from './ShapeFactory';

const WEAPON_COLORS: Record<WeaponSnapshot['id'], number> = {
  needle: 0x63d7e6, ray: 0xffbe5c, cluster: 0xa78bfa, repulse: 0x76e6a7,
  chain: 0xff8bd8, orbit: 0xf4e285, disc: 0x78a8ff, gravity: 0xc084fc,
};

const SUPPORT_COLORS: Record<SupportSnapshot['id'], number> = {
  output: 0xffbe5c, rhythm: 0x63d7e6, branch: 0xff8bd8, focus: 0x78a8ff, observe: 0xf4e285, brake: 0x76e6a7,
};

export function drawDevice(graphics: Phaser.GameObjects.Graphics, centerX: number, centerY: number, weapons: WeaponSnapshot[], supports: SupportSnapshot[]): void {
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 3;
    return { x: centerX + Math.cos(angle) * 118, y: centerY + Math.sin(angle) * 118 };
  });
  graphics.lineStyle(2, 0x163246, 0.9);
  graphics.beginPath();
  graphics.moveTo(points[0]?.x ?? centerX, points[0]?.y ?? centerY);
  for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
  graphics.closePath(); graphics.strokePath();
  graphics.lineStyle(2, 0x63d7e6, 0.3);
  for (let index = 0; index < 6; index += 1) graphics.lineBetween(centerX, centerY, points[index]?.x ?? centerX, points[index]?.y ?? centerY);
  for (let index = 0; index < 3; index += 1) {
    const weapon = weapons[index];
    const point = points[index * 2];
    if (point && weapon) {
      const color = WEAPON_COLORS[weapon.id];
      drawHex(graphics, point.x, point.y, 28, color, 0.28, color);
      graphics.lineStyle(3, color, 0.9);
      graphics.lineBetween(centerX, centerY, point.x, point.y);
      drawWeaponGlyph(graphics, point.x, point.y, weapon.id, color);
      if (weapon.branch) { graphics.lineStyle(2, 0xfff1a8, 0.9); graphics.strokeCircle(point.x, point.y, 33); }
      if (weapon.finalBranch) { graphics.lineStyle(2, color, 0.95); graphics.strokeCircle(point.x, point.y, 37); }
    } else if (point) drawHex(graphics, point.x, point.y, 28, 0x07131f, 0.4, 0x163246);
  }
  for (let index = 0; index < 3; index += 1) {
    const support = supports[index];
    const point = points[index * 2 + 1];
    if (point && support) {
      const color = SUPPORT_COLORS[support.id];
      drawHex(graphics, point.x, point.y, 24, color, 0.22, color);
      graphics.lineStyle(2, color, 0.72);
      graphics.lineBetween(centerX, centerY, point.x, point.y);
      graphics.lineStyle(1, color, 0.9);
      graphics.strokeCircle(point.x, point.y, 15 + support.level * 2);
    } else if (point) drawHex(graphics, point.x, point.y, 24, 0x07131f, 0.4, 0x163246);
  }
  graphics.lineStyle(2, 0xf2f0e8, 0.9);
  graphics.strokeCircle(centerX, centerY, 47);
  graphics.fillStyle(0xf2f0e8, 0.95);
  graphics.fillCircle(centerX, centerY, 29);
  graphics.fillStyle(0x63d7e6, 0.85);
  graphics.fillCircle(centerX, centerY, 12);
}

function drawWeaponGlyph(graphics: Phaser.GameObjects.Graphics, x: number, y: number, id: WeaponSnapshot['id'], color: number): void {
  graphics.lineStyle(2, 0xf2f0e8, 0.86);
  if (id === 'needle') graphics.lineBetween(x - 10, y, x + 10, y);
  else if (id === 'ray') graphics.lineBetween(x - 11, y, x + 11, y);
  else if (id === 'cluster') graphics.strokeCircle(x, y, 8);
  else if (id === 'repulse') graphics.strokeCircle(x, y, 10);
  else if (id === 'chain') graphics.lineBetween(x - 8, y - 7, x + 8, y + 7);
  else if (id === 'orbit') graphics.strokeCircle(x, y, 9);
  else if (id === 'disc') graphics.fillCircle(x, y, 7);
  else graphics.strokeCircle(x, y, 7);
  graphics.lineStyle(1, color, 0.75);
  if (id === 'chain' || id === 'gravity') drawPolygon(graphics, polygonPoints(x, y, 11, 4, Math.PI / 4), color, 0.22, color);
}
