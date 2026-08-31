import { describe, expect, it } from 'vitest';
import { isLocalTestHost } from '../../src/app/testMode';

describe('test mode host gate', () => {
  it.each(['localhost', '127.0.0.1', '[::1]', 'LOCALHOST'])('allows local development host %s', (host) => {
    expect(isLocalTestHost(host)).toBe(true);
  });

  it.each(['chameleonjp-lab.github.io', 'example.com', 'localhost.example.com'])('rejects public host %s', (host) => {
    expect(isLocalTestHost(host)).toBe(false);
  });
});
