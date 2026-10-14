import { createGame, finalScoring, SCORING_CARDS } from '../engine/index.js';
import type { GameState, NewPlayer, PlayerScore } from '../engine/index.js';
import { mulberry32 } from '@game-hub/kernel';
import { playSelfPlay } from '../bot/selfPlay.js';
import { runAgentGame } from './agentGame.js';
import { buildReplay } from './replay.js';
import type { Replay, ReplaySnapshot } from './replay.js';

/** Which driver plays the seats. */
export type SimMode = 'heuristic' | 'pi';

export interface SimOptions {
  /** Seats per game. Default 3 (Container's minimum). */
  readonly count?: number;
  /** Setup seed — shuffles the scoring-card deal so two runs differ reproducibly. */
  readonly seed?: number;
  /** Games to play. Default 1. */
  readonly games?: number;
  /**
   * Driver. `heuristic` is the synchronous `playSelfPlay`; `pi` is the async agent loop with the
   * built-in heuristic standing in for the model (a host wires a real decider through `runAgentGame`).
   */
  readonly mode?: SimMode;
  /** Cap turns per game (runaway guard). */
  readonly maxTurns?: number;
}

/** One played game's outcome. */
export interface GameResult {
  readonly index: number;
  readonly seed: number;
  readonly actions: number;
  readonly turns: number;
  readonly completed: boolean;
  readonly scores: readonly PlayerScore[];
  readonly winnerIds: readonly string[];
}

export interface SimResult {
  readonly games: readonly GameResult[];
  /** The replay of the last game only (the CLI emits one). */
  readonly replay: Replay | null;
}

/** A seed-dependent permutation of the scoring-card ids, so each game deals a different table. */
function shuffledCardIds(seed: number, count: number): string[] {
  const rng = mulberry32(seed * 2654435761 + 1);
  const ids = SCORING_CARDS.map((card) => card.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids.slice(0, count);
}

/** Deal a seeded game exactly as the strength bench does, so CLI and bench share one deal. */
function makeInitial(seed: number, count: number): GameState {
  const cardIds = shuffledCardIds(seed, count);
  const players: NewPlayer[] = Array.from({ length: count }, (_, i) => ({
    name: `P${i + 1}`,
    scoringCardId: cardIds[i],
  }));
  return createGame({ id: `sim-${seed}`, players });
}

/** The final scores of a finished state, or `[]` if the game did not end. */
function scoresOf(state: GameState): readonly PlayerScore[] {
  if (state.status !== 'ended') return [];
  return state.results;
}

/**
 * Run one or more games headlessly and return their results plus the last game's replay.
 *
 * `heuristic` mode uses the synchronous self-play path (the same one the strength bench freezes
 * against); `pi` mode uses the async agent loop, which is the shape a real external decider plugs
 * into. Both are deterministic given a seed — the only randomness is the scoring-card deal.
 */
export async function runSim(options: SimOptions = {}): Promise<SimResult> {
  const count = options.count ?? 3;
  const games = options.games ?? 1;
  const mode = options.mode ?? 'heuristic';
  const baseSeed = options.seed ?? 1;

  const results: GameResult[] = [];
  let lastReplay: Replay | null = null;

  for (let index = 0; index < games; index += 1) {
    const seed = baseSeed + index;
    const initial = makeInitial(seed, count);
    const snapshots: ReplaySnapshot[] = [];

    let state: GameState;
    let actions: number;
    let completed: boolean;

    if (mode === 'pi') {
      const result = await runAgentGame(initial, {
        ...(options.maxTurns !== undefined ? { maxTurns: options.maxTurns } : {}),
        onSnapshot: (snapshot) => snapshots.push(snapshot),
      });
      state = result.state;
      actions = result.actions;
      completed = result.completed;
    } else {
      const result = playSelfPlay(initial, options.maxTurns !== undefined ? { maxTurns: options.maxTurns } : {});
      state = result.state;
      actions = result.actions;
      completed = result.completed;
      snapshots.push(
        { seq: 0, version: initial.version, state: initial },
        { seq: actions, version: state.version, state },
      );
    }

    results.push({
      index,
      seed,
      actions,
      turns: state.turn,
      completed,
      scores: scoresOf(state),
      winnerIds: state.status === 'ended' ? state.winnerIds : [],
    });
    lastReplay = buildReplay(initial, snapshots, completed);
  }

  return { games: results, replay: lastReplay };
}

/** Re-score a final state, exposed so a caller (or a test) can verify a replay reconstructs it. */
export function scoreState(state: GameState): readonly PlayerScore[] {
  return finalScoring(state.players);
}
