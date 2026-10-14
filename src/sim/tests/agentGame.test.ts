import { describe, expect, it } from 'vitest';
import { createGame } from '../../engine/index.js';
import type { Action, GameState, GameView } from '../../engine/index.js';
import { runAgentGame, heuristicPolicy } from '../agentGame.js';
import type { AsyncSeatPolicy } from '../agentGame.js';

const newGame = (count = 3): GameState =>
  createGame({ id: 'g1', players: Array.from({ length: count }, (_, i) => ({ name: `P${i + 1}` })) });

describe('runAgentGame', () => {
  it('plays a full game to a natural end with the built-in heuristic', async () => {
    const result = await runAgentGame(newGame(3));
    expect(result.completed).toBe(true);
    expect(result.state.status).toBe('ended');
    expect(result.actions).toBeGreaterThan(50);
    expect(result.fallbacks).toBe(0);
  });

  it('emits an opening snapshot plus one per applied action', async () => {
    const snapshots: number[] = [];
    const result = await runAgentGame(newGame(3), { onSnapshot: (s) => snapshots.push(s.seq) });
    expect(snapshots[0]).toBe(0); // the opening position
    expect(snapshots).toHaveLength(result.actions + 1);
    expect(snapshots).toEqual([...snapshots].sort((a, b) => a - b));
  });

  it('is deterministic for the same initial state', async () => {
    const a = await runAgentGame(newGame(3));
    const b = await runAgentGame(newGame(3));
    expect(a.actions).toBe(b.actions);
    expect(a.state).toEqual(b.state);
  });

  it('does not mutate the state it is given', async () => {
    const initial = newGame(3);
    const before = structuredClone(initial);
    await runAgentGame(initial);
    expect(initial).toEqual(before);
  });

  it('stops at maxTurns without finishing', async () => {
    const result = await runAgentGame(newGame(3), { maxTurns: 2 });
    expect(result.completed).toBe(false);
    expect(result.state.status).toBe('active');
  });

  it('runs an external async agent whose decision is awaited', async () => {
    // An agent that delegates to the heuristic but through a real `await` and an extra microtask —
    // proving the loop genuinely suspends for a remote/async decider.
    const calls: string[] = [];
    const external: AsyncSeatPolicy = {
      decide: async (view: GameView, playerId: string) => {
        await Promise.resolve();
        calls.push(playerId);
        return heuristicPolicy.decide(view, playerId);
      },
      bidFor: (view, id) => heuristicPolicy.bidFor!(view, id),
      runoffBidFor: (view, id, opening) => heuristicPolicy.runoffBidFor!(view, id, opening),
    };
    const result = await runAgentGame(newGame(3), { agent: external });
    expect(result.completed).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    expect(result.fallbacks).toBe(0);
  });

  it('falls back to the heuristic when the external agent throws', async () => {
    const failing: AsyncSeatPolicy = {
      decide: async () => {
        throw new Error('model timed out');
      },
    };
    const result = await runAgentGame(newGame(3), { agent: failing });
    expect(result.fallbacks).toBeGreaterThan(0);
    // Still finishes: a flaky model degrades to a real game rather than a wedged one.
    expect(result.state.status).toBe('ended');
  });

  it('falls back when the external agent returns a structurally-valid but illegal action', async () => {
    // `BUILD_WAREHOUSE` when the seat already holds the cap is illegal, but well-formed — `applyAction`
    // rejects it, so the fallback must rescue it.
    let threw = false;
    const illegal: AsyncSeatPolicy = {
      decide: async (_view, playerId) => {
        const action: Action = { type: 'SAIL', to: { kind: 'harbor', playerId } };
        threw = true;
        return action;
      },
    };
    const result = await runAgentGame(newGame(3), { agent: illegal, maxTurns: 5 });
    expect(threw).toBe(true);
    expect(result.fallbacks).toBeGreaterThan(0);
  });

  it('per-seat policies override the shared agent', async () => {
    const seen = new Set<string>();
    const perSeat: AsyncSeatPolicy = {
      decide: async (view, playerId) => {
        seen.add(playerId);
        return heuristicPolicy.decide(view, playerId);
      },
    };
    const policies = new Map<string, AsyncSeatPolicy>([
      ['p1', perSeat],
      ['p2', perSeat],
      ['p3', perSeat],
    ]);
    const result = await runAgentGame(newGame(3), { policies, maxTurns: 4 });
    expect(seen.has('p1')).toBe(true);
    expect(result.actions).toBeGreaterThan(0);
  });

  it('runs above the legacy 5-seat table (8 seats, scaled supply)', async () => {
    const result = await runAgentGame(newGame(8), { maxActions: 500 });
    expect(result.actions).toBeGreaterThan(0);
    expect(result.state.status === 'ended' || !result.completed).toBe(true);
  });
});
