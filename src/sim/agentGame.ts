import { applyAction, legalActions, viewFor } from '../engine/index.js';
import type { Action, Color, GameState, GameView } from '../engine/index.js';
import { assertBotTurn } from '@game-hub/kernel/bot';
import { decide as heuristicDecide, bidFor, runoffBidFor } from '../bot/index.js';
import { buildDelivery } from './delivery.js';
import type { ReplaySnapshot } from './replay.js';

/**
 * The async, per-turn agent loop (Action Plan Phase 2). Unlike `playSelfPlay` — the built-in,
 * synchronous `runBotLoop` path — this awaits an external decider that may be a language model, a
 * subprocess, or anything slow. It is deliberately **external to the engine**: it calls the pure sync
 * `applyAction` and owns only the awaiting.
 *
 * This is why `pi` cannot be a `BotDriver`: the kernel's `runBotLoop` is synchronous by design (the
 * apply path must not gain an `await`), so an async agent is driven here, off the server, one turn at
 * a time. Nothing in this file changes an engine rule.
 */

/** The async collection hooks a decider may use to resolve a delivery auction it is delivering. */
export interface AsyncDecideOptions {
  readonly collectBids?: (cargo: readonly Color[]) => Promise<Readonly<Record<string, number>>>;
  readonly collectRunoffBids?: (
    cargo: readonly Color[],
    tied: readonly string[],
  ) => Promise<Readonly<Record<string, number>>>;
}

/**
 * One seat's async policy. `decide` is the on-turn half; the optional bid functions mirror the sync
 * `SeatPolicy` so a delivery auction can be resolved from the *other* seats' own views even when
 * those seats are external agents rather than in-process bots.
 *
 * Every function may reject or return an illegal action; `runAgentGame` contains that by falling back
 * to the deterministic built-in `decide`, so a game never wedges on a bad model response.
 */
export interface AsyncSeatPolicy {
  readonly decide: (view: GameView, playerId: string, options?: AsyncDecideOptions) => Promise<Action>;
  readonly bidFor?: (view: GameView, bidderId: string) => number | Promise<number>;
  readonly runoffBidFor?: (view: GameView, bidderId: string, openingBid: number) => number | Promise<number>;
}

export interface RunAgentGameOptions {
  /** The acting seat's policy. Omit to drive every seat with the built-in heuristic. */
  readonly agent?: AsyncSeatPolicy;
  /** Per-seat override (seat id → policy). Falls back to `agent`, then to the heuristic. */
  readonly policies?: ReadonlyMap<string, AsyncSeatPolicy>;
  /** Abandon after this many turns (runaway guard). */
  readonly maxTurns?: number;
  /** Total actions before bailing, across all turns (guards a policy that cycles). */
  readonly maxActions?: number;
  /**
   * Called after every applied action, including the opening position (seq 0). The CLI wires this to
   * collect replay snapshots; tests use it to observe progress.
   */
  readonly onSnapshot?: (snapshot: ReplaySnapshot) => void;
}

export interface RunAgentGameResult {
  readonly state: GameState;
  readonly actions: number;
  readonly completed: boolean;
  /** How many times the deterministic fallback had to rescue a failed/illegal agent decision. */
  readonly fallbacks: number;
}

const DEFAULT_MAX_TURNS = 400;
const DEFAULT_MAX_ACTIONS = 20_000;

/**
 * The built-in heuristic as an async policy — used for a seat with no external agent and as the
 * fallback. The synchronous bot's `collectBids` hook is only ever used to resolve a DELIVER, so for
 * every other action it is unreachable; the DELIVER case is handled here by awaiting the engine's
 * async collectors through `buildDelivery`, keeping rules identical to the in-process path.
 */
export const heuristicPolicy: AsyncSeatPolicy = {
  decide: async (view, playerId, options) => {
    const state = view as unknown as GameState;
    const legal = legalActions(state, playerId);
    if (legal.length === 1 && legal[0]!.type === 'DELIVER') {
      return buildDelivery(state, playerId, {
        collectBids: options?.collectBids ?? (async () => ({})),
        ...(options?.collectRunoffBids ? { collectRunoffBids: options.collectRunoffBids } : {}),
      });
    }
    return heuristicDecide(view, playerId);
  },
  // The deterministic bot's own bid, so external and built-in seats bid by the same rules.
  bidFor: (view, bidderId) => bidFor(view, bidderId),
  runoffBidFor: (view, bidderId, opening) => runoffBidFor(view, bidderId, opening),
};

/** Pick a seat's policy, or the heuristic when it has none. */
export function policyFor(
  id: string,
  agent: AsyncSeatPolicy | undefined,
  policies: ReadonlyMap<string, AsyncSeatPolicy> | undefined,
): AsyncSeatPolicy {
  return policies?.get(id) ?? agent ?? heuristicPolicy;
}

/** The async bid collectors for one delivery: each opponent's bid from its own view and policy. */
function makeCollectors(
  state: GameState,
  delivererId: string,
  agent: AsyncSeatPolicy | undefined,
  policies: ReadonlyMap<string, AsyncSeatPolicy> | undefined,
): AsyncDecideOptions {
  const collectBids = async (cargo: readonly Color[]): Promise<Readonly<Record<string, number>>> => {
    const bids: Record<string, number> = {};
    for (const opponent of state.players) {
      if (opponent.id === delivererId) continue;
      const bidder = policyFor(opponent.id, agent, policies);
      const own = viewFor(state, opponent.id);
      bids[opponent.id] = bidder.bidFor ? await bidder.bidFor(own, opponent.id) : bidFor(own, opponent.id);
    }
    void cargo;
    return bids;
  };
  const collectRunoffBids = async (
    cargo: readonly Color[],
    tied: readonly string[],
  ): Promise<Readonly<Record<string, number>>> => {
    const opening = await collectBids(cargo);
    const extra: Record<string, number> = {};
    for (const id of tied) {
      const bidder = policyFor(id, agent, policies);
      const own = viewFor(state, id);
      extra[id] = bidder.runoffBidFor
        ? await bidder.runoffBidFor(own, id, opening[id] ?? 0)
        : runoffBidFor(own, id, opening[id] ?? 0);
    }
    return extra;
  };
  return { collectBids, collectRunoffBids };
}

/**
 * Decide one action for the active seat, containing any external-agent failure with the deterministic
 * fallback. A game must never wedge on a model timeout, an exception, or an illegal move.
 */
async function decideWithFallback(
  state: GameState,
  activeId: string,
  agent: AsyncSeatPolicy | undefined,
  policies: ReadonlyMap<string, AsyncSeatPolicy> | undefined,
): Promise<{ action: Action; usedFallback: boolean }> {
  const view = viewFor(state, activeId);
  const policy = policyFor(activeId, agent, policies);
  const collectors = makeCollectors(state, activeId, agent, policies);

  const attempt = async (): Promise<Action> => {
    assertBotTurn(view, activeId);
    // The policy owns *every* action, including a forced DELIVER: `heuristicPolicy` builds one from the
    // awaited collectors, and an external agent may do the same (so it keeps control of the buyout).
    // The collectors are handed in, so a policy that returns a broken DELIVER still falls back below.
    return policy.decide(view, activeId, collectors);
  };

  try {
    const action = await attempt();
    // Validate by trial apply: `applyAction` is the authority on rules, so an illegal action is caught
    // here and rescued rather than throwing out of the loop.
    applyAction(state, activeId, action);
    return { action, usedFallback: false };
  } catch {
    // The deterministic rescue: the built-in heuristic from the same redacted view against the same
    // engine, using the same collectors. A game must never wedge on a model timeout or bad move.
    const rescued = await heuristicPolicy.decide(view, activeId, collectors);
    applyAction(state, activeId, rescued); // a broken fallback is a real bug — let it throw
    return { action: rescued, usedFallback: true };
  }
}

/**
 * Play one game to completion, awaiting each seat's decider in turn.
 *
 * Determinism: for a given initial state *and* a deterministic decider the result is deterministic.
 * The fallback is deterministic too, so a flaky model degrades to a reproducible game rather than a
 * stuck one. This is the headless-CLI engine and the model the server-side orchestrator mirrors.
 */
export async function runAgentGame(initial: GameState, options: RunAgentGameOptions = {}): Promise<RunAgentGameResult> {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
  let state = initial;
  let actions = 0;
  let fallbacks = 0;

  const snapshot = (): ReplaySnapshot => ({ seq: actions, version: state.version, state });
  options.onSnapshot?.(snapshot());

  while (state.status === 'active' && state.turn < maxTurns && actions < maxActions) {
    const active = state.players[state.activePlayerIndex]!;
    const { action, usedFallback } = await decideWithFallback(state, active.id, options.agent, options.policies);
    if (usedFallback) fallbacks += 1;
    state = applyAction(state, active.id, action);
    actions += 1;
    options.onSnapshot?.(snapshot());
  }

  return { state, actions, completed: state.status === 'ended', fallbacks };
}
