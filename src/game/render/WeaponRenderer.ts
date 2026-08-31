import Phaser from 'phaser';
import type { SupportSnapshot, WeaponSnapshot } from '../../types/game';
import { drawHex } from './ShapeFactory';

const WEAPON_COLORS: Record<WeaponSnapshot['id'], number> = {
  needle: 0x63d7e6,
  ray: 0xffbe5c,
  cluster: 0xa78bfa,
  repulse: 0x76e6a7,
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
      drawHex(graphics, point.x, point.y, 28, WEAPON_COLORS[weapon.id], 0.28, WEAPON_COLORS[weapon.id]);
      graphics.lineStyle(3, WEAPON_COLORS[weapon.id], 0.9);
      graphics.lineBetween(centerX, centerY, point.x, point.y);
    } else if (point) drawHex(graphics, point.x, point.y, 28, 0x07131f, 0.4, 0x163246);
  }
  for (let index = 0; index < 3; index += 1) {
    const support = supports[index];
    const point = points[index * 2 + 1];
    if (point && support) {
      drawHex(graphics, point.x, point.y, 24, 0xffbe5c, 0.22, 0xffbe5c);
      graphics.lineStyle(2, 0xffbe5c, 0.72);
      graphics.lineBetween(centerX, centerY, point.x, point.y);
    } else if (point) drawHex(graphics, point.x, point.y, 24, 0x07131f, 0.4, 0x163246);
  }
  graphics.lineStyle(2, 0xf2f0e8, 0.9);
  graphics.strokeCircle(centerX, centerY, 47);
  graphics.fillStyle(0xf2f0e8, 0.95);
  graphics.fillCircle(centerX, centerY, 29);
  graphics.fillStyle(0x63d7e6, 0.85);
  graphics.fillCircle(centerX, centerY, 12);
}
