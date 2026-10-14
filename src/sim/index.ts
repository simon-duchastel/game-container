/**
 * `@game-hub/game-container/sim` — the headless simulation surface: the async agent loop, the
 * portable replay envelope, and the CLI's shared pieces. Pure library — no backend, no SQLite, no
 * REST, no React. A host can embed `runAgentGame` directly; the `bin` wraps it for the terminal.
 */
export { runAgentGame, heuristicPolicy, policyFor } from './agentGame.js';
export type { AsyncSeatPolicy, AsyncDecideOptions, RunAgentGameOptions, RunAgentGameResult } from './agentGame.js';
export { buildDelivery } from './delivery.js';
export { buildReplay, parseReplay, ReplaySchemaUnsupportedError, REPLAY_SCHEMA_VERSION } from './replay.js';
export type { Replay, ReplaySeat, ReplaySnapshot } from './replay.js';
export { runSim } from './run.js';
export type { SimOptions, SimResult, SimMode } from './run.js';
