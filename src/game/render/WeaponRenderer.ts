import Phaser from 'phaser';
import type { SupportSnapshot, WeaponSnapshot } from '../../types/game';
import { itemAtExpandedSlot, DEVICE_SLOT_COUNT } from '../deviceLayout';
import { supportWeaponSlots } from '../entities/SupportModule';
import { drawHex, drawPolygon, polygonPoints } from './ShapeFactory';

const WEAPON_COLORS: Record<WeaponSnapshot['id'], number> = {
  needle: 0x63d7e6, ray: 0xffbe5c, cluster: 0xa78bfa, repulse: 0x76e6a7,
  chain: 0xff8bd8, orbit: 0xf4e285, disc: 0x78a8ff, gravity: 0xc084fc,
  grid: 0xf0a6ff, mine: 0xff8f70, lance: 0xffd166, drone: 0x6ee7b7,
};

const SUPPORT_COLORS: Record<SupportSnapshot['id'], number> = {
  output: 0xffbe5c, rhythm: 0x63d7e6, branch: 0xff8bd8, focus: 0x78a8ff, observe: 0xf4e285, brake: 0x76e6a7,
  relay: 0xff9f68, repair: 0x9be7ff,
};

export function drawDevice(graphics: Phaser.GameObjects.Graphics, centerX: number, centerY: number, weapons: WeaponSnapshot[], supports: SupportSnapshot[], unlockedLayer = 1): void {
  const layers = Math.max(1, Math.min(3, Math.floor(unlockedLayer)));
  const layerPoints = Array.from({ length: layers }, (_, layerIndex) => {
    const radius = 118 + layerIndex * 88;
    return Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 3;
      return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
    });
  });
  graphics.lineStyle(2, 0x163246, 0.9);
  for (let layerIndex = 0; layerIndex < layers; layerIndex += 1) {
    const points = layerPoints[layerIndex] ?? [];
    graphics.beginPath();
    graphics.moveTo(points[0]?.x ?? centerX, points[0]?.y ?? centerY);
    for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.closePath(); graphics.strokePath();
    graphics.lineStyle(2, 0x63d7e6, 0.3);
    for (let index = 0; index < 6; index += 1) graphics.lineBetween(centerX, centerY, points[index]?.x ?? centerX, points[index]?.y ?? centerY);
    const baseSlot = layerIndex * DEVICE_SLOT_COUNT;
    for (let sector = 0; sector < DEVICE_SLOT_COUNT; sector += 1) {
      const weaponSlot = baseSlot + sector;
      const supportSlot = baseSlot + sector;
      const weapon = itemAtExpandedSlot(weapons, weaponSlot);
      const support = itemAtExpandedSlot(supports, supportSlot);
      const weaponPoint = points[sector * 2];
      const supportPoint = points[sector * 2 + 1];
      if (weaponPoint && weapon) {
        const color = WEAPON_COLORS[weapon.id];
        drawHex(graphics, weaponPoint.x, weaponPoint.y, 28, color, 0.28, color);
        graphics.lineStyle(3, color, 0.9);
        graphics.lineBetween(centerX, centerY, weaponPoint.x, weaponPoint.y);
        drawWeaponGlyph(graphics, weaponPoint.x, weaponPoint.y, weapon.id, color);
        if (weapon.branch) { graphics.lineStyle(2, 0xfff1a8, 0.9); graphics.strokeCircle(weaponPoint.x, weaponPoint.y, 33); }
        if (weapon.finalBranch) { graphics.lineStyle(2, color, 0.95); graphics.strokeCircle(weaponPoint.x, weaponPoint.y, 37); }
        if (weapon.evolutionId) { graphics.lineStyle(3, 0xffffff, 0.95); graphics.strokeCircle(weaponPoint.x, weaponPoint.y, 42); }
      } else if (weaponPoint) drawHex(graphics, weaponPoint.x, weaponPoint.y, 28, 0x07131f, 0.4, 0x163246);
      if (supportPoint && support) {
        const color = SUPPORT_COLORS[support.id];
        drawHex(graphics, supportPoint.x, supportPoint.y, 24, color, 0.22, color);
        graphics.lineStyle(2, color, 0.72);
        graphics.lineBetween(centerX, centerY, supportPoint.x, supportPoint.y);
        graphics.lineStyle(1, color, 0.9);
        graphics.strokeCircle(supportPoint.x, supportPoint.y, 15 + support.level * 2);
        const connectedWeaponSlots = supportWeaponSlots(support.id, support.slot);
        for (const connectedSlot of connectedWeaponSlots) {
          const connectedLayer = Math.floor(connectedSlot / DEVICE_SLOT_COUNT);
          const connectedSector = connectedSlot % DEVICE_SLOT_COUNT;
          const connectedPoint = layerPoints[connectedLayer]?.[connectedSector * 2];
          if (!connectedPoint || !itemAtExpandedSlot(weapons, connectedSlot)) continue;
          graphics.lineStyle(3, color, Math.min(1, 0.35 + support.level * 0.18));
          graphics.lineBetween(supportPoint.x, supportPoint.y, connectedPoint.x, connectedPoint.y);
        }
      } else if (supportPoint) drawHex(graphics, supportPoint.x, supportPoint.y, 24, 0x07131f, 0.4, 0x163246);
    }
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
  if (id === 'needle') {
    graphics.lineBetween(x - 11, y + 7, x + 8, y - 7);
    graphics.lineBetween(x - 12, y, x + 10, y);
    graphics.lineBetween(x - 11, y - 7, x + 8, y + 7);
    graphics.fillTriangle(x + 10, y - 3, x + 10, y + 3, x + 14, y);
  } else if (id === 'ray') {
    graphics.fillStyle(color, 0.24);
    graphics.beginPath();
    graphics.moveTo(x - 13, y - 4);
    graphics.lineTo(x + 7, y - 4);
    graphics.lineTo(x + 13, y);
    graphics.lineTo(x + 7, y + 4);
    graphics.lineTo(x - 13, y + 4);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
    graphics.lineBetween(x - 9, y - 8, x - 9, y + 8);
  } else if (id === 'cluster') {
    graphics.fillStyle(color, 0.78);
    graphics.fillCircle(x, y, 3);
    graphics.fillTriangle(x - 10, y + 7, x - 3, y + 7, x - 7, y - 1);
    graphics.fillTriangle(x + 10, y + 7, x + 3, y + 7, x + 7, y - 1);
    graphics.fillTriangle(x, y - 11, x - 5, y - 3, x + 5, y - 3);
    graphics.lineBetween(x, y, x - 7, y + 4);
    graphics.lineBetween(x, y, x + 7, y + 4);
    graphics.lineBetween(x, y, x, y - 7);
  } else if (id === 'repulse') {
    graphics.strokeCircle(x, y, 5);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const inner = 8;
      const tip = 14;
      const spread = 0.38;
      graphics.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * tip, y + Math.sin(angle) * tip);
      graphics.lineBetween(x + Math.cos(angle) * tip, y + Math.sin(angle) * tip, x + Math.cos(angle - spread) * (tip - 4), y + Math.sin(angle - spread) * (tip - 4));
      graphics.lineBetween(x + Math.cos(angle) * tip, y + Math.sin(angle) * tip, x + Math.cos(angle + spread) * (tip - 4), y + Math.sin(angle + spread) * (tip - 4));
    }
  } else if (id === 'chain') {
    drawPolygon(graphics, polygonPoints(x - 7, y, 6, 4, Math.PI / 4), 0x07131f, 0, 0xf2f0e8);
    drawPolygon(graphics, polygonPoints(x + 7, y, 6, 4, Math.PI / 4), 0x07131f, 0, 0xf2f0e8);
    graphics.lineStyle(2, 0xf2f0e8, 0.86);
    graphics.lineBetween(x - 3, y - 3, x + 3, y - 3);
    graphics.lineBetween(x - 3, y + 3, x + 3, y + 3);
  } else if (id === 'orbit') {
    graphics.strokeEllipse(x, y, 24, 14);
    graphics.fillCircle(x - 9, y - 4, 3);
    graphics.fillTriangle(x + 7, y + 8, x + 13, y + 5, x + 10, y - 1);
    graphics.lineBetween(x - 9, y - 4, x - 4, y - 9);
  } else if (id === 'disc') {
    drawPolygon(graphics, polygonPoints(x, y, 9, 6), color, 0.55, 0xf2f0e8);
    graphics.strokeCircle(x, y, 3);
    graphics.lineBetween(x - 6, y + 6, x + 6, y - 6);
  } else if (id === 'gravity') {
    drawPolygon(graphics, polygonPoints(x, y, 9, 4, Math.PI / 4), 0x07131f, 0, 0xf2f0e8);
    graphics.lineStyle(2, 0xf2f0e8, 0.86);
    graphics.fillCircle(x, y, 3);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const tip = 12;
      graphics.lineBetween(x + Math.cos(angle) * tip, y + Math.sin(angle) * tip, x + Math.cos(angle) * 6, y + Math.sin(angle) * 6);
      graphics.lineBetween(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, x + Math.cos(angle - 0.42) * 8, y + Math.sin(angle - 0.42) * 8);
      graphics.lineBetween(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, x + Math.cos(angle + 0.42) * 8, y + Math.sin(angle + 0.42) * 8);
    }
  } else if (id === 'grid') {
    graphics.strokeRect(x - 11, y - 11, 22, 22);
    graphics.lineBetween(x - 11, y - 4, x + 11, y - 4); graphics.lineBetween(x - 11, y + 4, x + 11, y + 4);
    graphics.lineBetween(x - 4, y - 11, x - 4, y + 11); graphics.lineBetween(x + 4, y - 11, x + 4, y + 11);
  } else if (id === 'mine') {
    drawPolygon(graphics, polygonPoints(x, y, 10, 6, Math.PI / 6), color, 0.35, 0xf2f0e8);
    graphics.fillCircle(x, y, 3); graphics.strokeCircle(x, y, 14);
  } else if (id === 'lance') {
    graphics.lineStyle(4, color, 0.9); graphics.lineBetween(x - 12, y, x + 12, y);
    graphics.fillTriangle(x + 14, y, x + 5, y - 5, x + 5, y + 5); graphics.strokeCircle(x - 7, y, 5);
  } else {
    graphics.strokeCircle(x, y, 12); graphics.fillCircle(x, y, 4);
    graphics.lineBetween(x - 8, y - 8, x + 8, y + 8); graphics.lineBetween(x + 8, y - 8, x - 8, y + 8);
  }
}
