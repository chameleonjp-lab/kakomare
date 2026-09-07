import { describe, expect, it } from 'vitest';
import { isRenderLayerAbove, RENDER_LAYERS } from '../../src/game/render/RenderLayer';

describe('battle render layers', () => {
  it('keeps danger warnings and hostile projectiles above ordinary effects', () => {
    expect(isRenderLayerAbove('telegraphs', 'friendly')).toBe(true);
    expect(isRenderLayerAbove('hostileProjectiles', 'telegraphs')).toBe(true);
    expect(isRenderLayerAbove('hostileProjectiles', 'background')).toBe(true);
  });

  it('keeps the battle layer order strictly back-to-front', () => {
    const order = [
      RENDER_LAYERS.background,
      RENDER_LAYERS.device,
      RENDER_LAYERS.friendly,
      RENDER_LAYERS.enemies,
      RENDER_LAYERS.feedback,
      RENDER_LAYERS.telegraphs,
      RENDER_LAYERS.hostileProjectiles,
      RENDER_LAYERS.hud,
    ];
    expect(order).toEqual([...order].sort((first, second) => first - second));
    expect(new Set(order).size).toBe(order.length);
  });

  it('keeps hit feedback below danger warnings', () => {
    expect(isRenderLayerAbove('telegraphs', 'feedback')).toBe(true);
    expect(isRenderLayerAbove('hostileProjectiles', 'feedback')).toBe(true);
  });
});
