import { deliveryOutcome } from '../engine/index.js';
import type { Action, Color, GameState, GameView } from '../engine/index.js';
import { chooseTiedWinner, wantsBuyout } from '../bot/index.js';
import { contextFor } from '../bot/index.js';

/**
 * Build a `DELIVER` action for an externally-driven seat, awaiting the sealed bids it cannot invent.
 *
 * The synchronous counterpart lives in `../bot/decide.ts` (`buildDelivery`) and is used by self-play,
 * where every bidder is an in-process function. Here the bidders may be external agents (or slow
 * model calls), so collection is `await`ed. The *rules* are identical: this asks the engine's
 * `deliveryOutcome` for the tie/winning-bid resolution rather than re-deriving it, so the external
 * path and the engine agree exactly.
 */
export async function buildDelivery(
  state: GameState,
  delivererId: string,
  options: {
    readonly collectBids: (cargo: readonly Color[]) => Promise<Readonly<Record<string, number>>>;
    readonly collectRunoffBids?: (
      cargo: readonly Color[],
      tied: readonly string[],
    ) => Promise<Readonly<Record<string, number>>>;
  },
): Promise<Action> {
  const me = state.players.find((player) => player.id === delivererId);
  if (!me) throw new Error(`No seat "${delivererId}"`);
  const cargo = me.ship.cargo;

  const bids = await options.collectBids(cargo);

  // A tie sends it to a runoff (pg. 16); the tied players' extra cash is theirs to decide. Ask for it
  // rather than invent it — same contract as the synchronous bot.
  const opening = deliveryOutcome(state, delivererId, bids);
  const runoffBids =
    opening.finalists.length > 1 ? await (options.collectRunoffBids?.(cargo, opening.finalists) ?? {}) : {};

  const { winningBid, finalists } = deliveryOutcome(state, delivererId, bids, runoffBids);
  const ctx = contextFor(state as unknown as GameView, delivererId);
  const buyout = wantsBuyout(ctx, winningBid);
  const chosenWinnerId = !buyout && finalists.length > 1 ? chooseTiedWinner(ctx, finalists, cargo) : undefined;

  return {
    type: 'DELIVER',
    bids,
    ...(Object.keys(runoffBids).length > 0 ? { runoffBids } : {}),
    ...(buyout ? { buyout: true } : {}),
    ...(chosenWinnerId ? { chosenWinnerId } : {}),
  };
}
