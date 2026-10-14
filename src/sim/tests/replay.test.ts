import { describe, expect, it } from 'vitest';
import { createGame } from '../../engine/index.js';
import type { GameState } from '../../engine/index.js';
import { buildReplay, parseReplay, REPLAY_SCHEMA_VERSION, ReplaySchemaUnsupportedError } from '../replay.js';
import { scoreState } from '../run.js';
import { playSelfPlay } from '../../bot/index.js';

const newGame = (count = 3): GameState =>
  createGame({ id: 'g1', players: Array.from({ length: count }, (_, i) => ({ name: `P${i + 1}` })) });

describe('replay envelope', () => {
  it('carries the seats, schema version, and every snapshot', () => {
    const initial = newGame(4);
    const snapshots = [
      { seq: 0, version: 0, state: initial },
      { seq: 1, version: 1, state: initial },
    ];
    const replay = buildReplay(initial, snapshots, false);
    expect(replay.schemaVersion).toBe(REPLAY_SCHEMA_VERSION);
    expect(replay.gameType).toBe('container');
    expect(replay.gameId).toBe('g1');
    expect(replay.seats.map((s) => s.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(replay.snapshots).toHaveLength(2);
  });

  it('round-trips through JSON', () => {
    const initial = newGame(3);
    const replay = buildReplay(initial, [{ seq: 0, version: 0, state: initial }], false);
    const parsed = parseReplay(JSON.parse(JSON.stringify(replay)) as unknown);
    expect(parsed).toEqual(replay);
  });

  it('rejects a non-object payload', () => {
    expect(() => parseReplay('nope')).toThrow('Replay must be a JSON object');
  });

  it('rejects a missing schemaVersion', () => {
    expect(() => parseReplay({ gameType: 'container', snapshots: [] })).toThrow('missing schemaVersion');
  });

  it('rejects a non-Container replay', () => {
    expect(() => parseReplay({ schemaVersion: 1, gameType: 'spades', snapshots: [] })).toThrow('not a Container');
  });

  it('rejects missing snapshots', () => {
    expect(() => parseReplay({ schemaVersion: 1, gameType: 'container' })).toThrow('missing snapshots');
  });

  it('refuses a newer schema version loudly rather than rendering it wrong', () => {
    expect(() => parseReplay({ schemaVersion: 999, gameType: 'container', snapshots: [] })).toThrow(
      ReplaySchemaUnsupportedError,
    );
  });
});

describe('a replay reconstructs the final scoring exactly', () => {
  it('the last snapshot re-scores to the same result as the finished state', () => {
    const initial = newGame(4);
    const result = playSelfPlay(initial);
    if (result.state.status !== 'ended') throw new Error('expected ended');

    // The full state (with secret cards and the log) is what makes this faithful — the lossy `moves`
    // log alone could not reproduce it, because a losing delivery bid is never recorded.
    const replay = buildReplay(
      initial,
      [{ seq: result.actions, version: result.state.version, state: result.state }],
      true,
    );
    const last = replay.snapshots[replay.snapshots.length - 1]!.state;
    expect(scoreState(last)).toEqual(result.state.results);
  });
});
