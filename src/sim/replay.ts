import type { GameState } from '../engine/index.js';

/**
 * A portable Container replay: enough state to re-render every turn, with no server and no secrets
 * lost.
 *
 * The platform's `moves` log is **lossy for secrets** — a losing delivery bid is deliberately never
 * recorded (see the module contract's `movesOf`) — so a replay rebuilt from `moves` alone cannot
 * reproduce what actually happened. Snapshots are full, authoritative states, taken on the pure
 * `applyAction` path, so a viewer can re-derive any seat's redacted view client-side with the same
 * `viewFor` the live game uses.
 *
 * `schemaVersion` guards a reader against a save produced by a different shape of this format; it is
 * **not** the game `version` and **not** the persisted-state `schemaVersion` (those live in the
 * engine/save path). Bump it when the envelope below changes shape.
 */
export const REPLAY_SCHEMA_VERSION = 1;

export interface ReplaySeat {
  readonly id: string;
  readonly name: string;
}

/**
 * One captured turn.
 *
 * `seq` counts applied actions (0 for the opening position), `version` is the engine's own counter at
 * that point, and `state` is the **full** state (including the secret scoring cards and the embedded
 * `log`, which are needed to reconstruct final scoring). Storage's O(n²) log concern belongs to the
 * server's snapshot table, which strips it; a replay file *wants* the log to show it.
 */
export interface ReplaySnapshot {
  readonly seq: number;
  readonly version: number;
  readonly state: GameState;
}

export interface Replay {
  readonly schemaVersion: number;
  readonly gameType: 'container';
  readonly gameId: string;
  readonly seats: readonly ReplaySeat[];
  readonly completed: boolean;
  readonly snapshots: readonly ReplaySnapshot[];
}

/** Serialize a game's captured snapshots into a replay envelope. */
export function buildReplay(initialState: GameState, snapshots: readonly ReplaySnapshot[], completed: boolean): Replay {
  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    gameType: 'container',
    gameId: initialState.id,
    seats: initialState.players.map((player) => ({ id: player.id, name: player.name })),
    completed,
    snapshots,
  };
}

/** Thrown when a replay file declares a `schemaVersion` this build cannot read. */
export class ReplaySchemaUnsupportedError extends Error {
  constructor(
    readonly fileVersion: number,
    readonly supportedVersion: number = REPLAY_SCHEMA_VERSION,
  ) {
    super(`Replay is schema v${fileVersion}, but this build reads v${supportedVersion}`);
    this.name = 'ReplaySchemaUnsupportedError';
  }
}

/**
 * Parse and validate an untrusted replay JSON payload. Mirrors the backend's `SchemaUnsupportedError`
 * contract: a newer file is refused loudly rather than rendered wrong.
 */
export function parseReplay(raw: unknown): Replay {
  if (typeof raw !== 'object' || raw === null) throw new Error('Replay must be a JSON object');
  const record = raw as Record<string, unknown>;
  const version = record['schemaVersion'];
  if (typeof version !== 'number') throw new Error('Replay is missing schemaVersion');
  if (version > REPLAY_SCHEMA_VERSION) throw new ReplaySchemaUnsupportedError(version);
  if (record['gameType'] !== 'container') throw new Error(`Replay is not a Container game`);
  if (!Array.isArray(record['snapshots'])) throw new Error('Replay is missing snapshots');
  return record as unknown as Replay;
}
