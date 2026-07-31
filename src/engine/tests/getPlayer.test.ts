import { describe, expect, it } from 'vitest';
import { getPlayer } from '../index.js';
import { expectError, newGame } from './helpers.js';

describe('getPlayer', () => {
  it('returns the player by id', () => {
    expect(getPlayer(newGame(), 'p2').id).toBe('p2');
  });

  it('throws PLAYER_NOT_FOUND for an unknown id', () => {
    expectError(() => getPlayer(newGame(), 'nope'), 'PLAYER_NOT_FOUND');
  });
});
