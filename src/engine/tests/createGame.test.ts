import { describe, expect, it } from 'vitest';
import {
  ACTIONS_PER_TURN,
  bankAuctionTokens,
  containerSupply,
  createGame,
  factorySupplyPerColor,
  MAX_PLAYERS,
  STARTING_MONEY,
  warehouseSupplyTotal,
} from '../index.js';
import { expectError, newGame, sc } from './helpers.js';

describe('createGame', () => {
  it('creates a valid 3-player game with priced starting container and building supply', () => {
    const state = newGame(3);

    expect(state.players).toHaveLength(3);
    expect(state.activePlayerIndex).toBe(0);
    expect(state.actionsRemaining).toBe(ACTIONS_PER_TURN);
    expect(state.turn).toBe(1);

    const p1 = state.players[0];
    expect(p1).toMatchObject({ id: 'p1', money: STARTING_MONEY, factoryLimit: 2, warehouses: 1, harborLimit: 1 });
    expect(p1?.factories).toEqual([{ id: 'p1-f1', color: 'white' }]);
    expect(p1?.factoryStore).toEqual([sc('white', 2)]); // starting container in the $2 lot
    expect(p1?.harborStore).toEqual([]);
    expect(p1?.ship).toEqual({ location: { kind: 'ocean' }, cargo: [] }); // starts in the ocean
    expect(p1?.scoringArea).toEqual([]);
    // Each player is dealt a secret scoring card (default deal is by seat).
    expect(p1?.scoringCard.id).toBe('sc1');
    expect(state.players[1]?.scoringCard.id).toBe('sc2');
    expect(p1?.loans).toBe(0);
    expect(state.status).toBe('active');
    // The active arm of the end-state union carries no `results`/`winnerIds` at all (REVIEW.md §3.1).
    expect('results' in state).toBe(false);
    expect('winnerIds' in state).toBe(false);

    expect(state.supply.factories).toEqual({ white: 1, red: 1, green: 1, blue: 2, yellow: 2 });
    expect(state.supply.warehouses).toBe(12 - 3);
    // 3p: 11 containers/color, minus the starting container (white/red/green) minus the 3 Bank
    // containers (white, red in lot I; green in lot II).
    expect(state.supply.containers).toEqual({ white: 9, red: 9, green: 9, blue: 11, yellow: 11 });
    expect(p1?.holdingArea).toEqual([]);

    // Off-Shore Bank board.
    expect(state.bank).toEqual({
      cashLots: [1, 2, 3],
      containerLots: [['white', 'red'], ['green'], []],
      tokens: 1, // 3–4 players
      auctions: [],
    });
  });

  it('respects an explicit starting color', () => {
    const state = createGame({
      id: 'g1',
      players: [{ name: 'Ann', startingColor: 'yellow' }, { name: 'Bob' }, { name: 'Cid' }],
    });
    expect(state.players[0]?.factoryStore).toEqual([sc('yellow', 2)]);
  });

  it('assigns distinct colors and 5-player supply', () => {
    const state = newGame(5);
    expect(state.players.map((p) => p.factories[0]?.color)).toEqual(['white', 'red', 'green', 'blue', 'yellow']);
    expect(state.supply.factories).toEqual({ white: 3, red: 3, green: 3, blue: 3, yellow: 3 });
    expect(state.supply.warehouses).toBe(20 - 5);
    // 17/color − 1 starting − Bank seed (white/red/green).
    expect(state.supply.containers).toEqual({ white: 15, red: 15, green: 15, blue: 16, yellow: 16 });
    expect(state.bank.tokens).toBe(2); // 5 players
  });

  // The linear resource formulas are the whole N-seat change, so pin them to the legacy rulebook
  // table at 3/4/5 (byte-for-byte) and pin their behaviour above it. If a future edit retunes the
  // formulas, this is the test that says whether N=5 moved.
  it.each([3, 4, 5])('scales resources identically to the legacy table at N=%i', (n) => {
    expect(factorySupplyPerColor(n)).toBe({ 3: 2, 4: 3, 5: 4 }[n]);
    expect(warehouseSupplyTotal(n)).toBe({ 3: 12, 4: 16, 5: 20 }[n]);
    expect(containerSupply(n)).toBe({ 3: 11, 4: 14, 5: 17 }[n]);
    expect(bankAuctionTokens(n)).toBe({ 3: 1, 4: 1, 5: 2 }[n]);
  });

  it('scales linearly above the legacy table (N=100)', () => {
    expect(factorySupplyPerColor(100)).toBe(99);
    expect(warehouseSupplyTotal(100)).toBe(400);
    expect(containerSupply(100)).toBe(302);
    expect(bankAuctionTokens(100)).toBe(97);
  });

  it('builds a complete N=100-seat game with scaled supply and dealt cards', () => {
    const state = newGame(100);
    expect(state.players).toHaveLength(100);
    // Every seat gets a distinct starting factory colour and a scoring card (both wrap the five
    // legacy colours/cards via `seat % 5`).
    expect(new Set(state.players.map((p) => p.scoringCard.id)).size).toBe(5);
    // Supply is the closed-form total minus the N starting factories and minus the 3 seeded Bank
    // containers — always non-negative, which is what an economy that can't be dealt would break.
    expect(state.supply.warehouses).toBe(400 - 100);
    for (const color of ['white', 'red', 'green', 'blue', 'yellow'] as const) {
      expect(state.supply.containers[color]).toBeGreaterThanOrEqual(0);
      expect(state.supply.factories[color]).toBeGreaterThanOrEqual(0);
    }
    expect(state.status).toBe('active');
  });

  it('deals an explicitly chosen scoring card', () => {
    const state = createGame({
      id: 'g1',
      players: [{ name: 'Ann', scoringCardId: 'sc4' }, { name: 'Bob' }, { name: 'Cid' }],
    });
    expect(state.players[0]?.scoringCard.id).toBe('sc4');
  });

  it('rejects an unknown scoring card id', () => {
    expectError(
      () =>
        createGame({ id: 'g1', players: [{ name: 'Ann', scoringCardId: 'nope' }, { name: 'Bob' }, { name: 'Cid' }] }),
      'INVALID_SELECTION',
    );
  });

  it('rejects fewer than 3 players', () => {
    expectError(() => createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }] }), 'INVALID_PLAYER_COUNT');
  });

  it('rejects more than MAX_PLAYERS players', () => {
    const players = Array.from({ length: MAX_PLAYERS + 1 }, (_, i) => ({ name: `P${i}` }));
    expect(() => createGame({ id: 'g1', players })).toThrowError(new RegExp(`3–${MAX_PLAYERS} players`));
  });
});
