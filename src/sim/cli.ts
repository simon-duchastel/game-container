import { runSim } from './run.js';
import type { SimMode, SimResult } from './run.js';

/**
 * The CLI's argument parsing and output formatting, split out of the `bin` so both are unit-testable
 * (a `bin` that calls `process.exit` is awkward to exercise directly). `src/bin/container-sim.ts` is a
 * thin shebang wrapper over `runCli`.
 */
export interface CliArgs {
  readonly count: number;
  readonly seed: number;
  readonly games: number;
  readonly agents: SimMode;
  readonly emitReplay?: string;
  readonly maxTurns?: number;
}

function requireNumber(flag: string, value: string | undefined): number {
  if (value === undefined) throw new Error(`${flag} needs a value`);
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} must be a non-negative integer`);
  return n;
}

export const HELP = [
  'container-sim — play Container games headlessly',
  '',
  '  --agents <heuristic|pi>  seat driver (default heuristic)',
  '  --count <N>              seats per game (default 3)',
  '  --seed <S>               setup seed (default 1)',
  '  --games <K>              games to play (default 1)',
  '  --max-turns <T>          runaway guard per game',
  '  --emit-replay <file>     write the last game as replay JSON',
  '',
].join('\n');

/** Parse argv (without the node/script prefix). Throws a message a caller can print. */
export function parseArgs(argv: readonly string[]): CliArgs {
  const args: { count: number; seed: number; games: number; agents: SimMode; emitReplay?: string; maxTurns?: number } =
    { count: 3, seed: 1, games: 1, agents: 'heuristic' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]!;
    const value = argv[i + 1];
    switch (flag) {
      case '--count':
        args.count = requireNumber(flag, value);
        i += 1;
        break;
      case '--seed':
        args.seed = requireNumber(flag, value);
        i += 1;
        break;
      case '--games':
        args.games = requireNumber(flag, value);
        i += 1;
        break;
      case '--max-turns':
        args.maxTurns = requireNumber(flag, value);
        i += 1;
        break;
      case '--agents': {
        if (value !== 'heuristic' && value !== 'pi') throw new Error('--agents must be "heuristic" or "pi"');
        args.agents = value;
        i += 1;
        break;
      }
      case '--emit-replay':
        if (value === undefined) throw new Error('--emit-replay needs a file path');
        args.emitReplay = value;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument "${flag}" (try --help)`);
    }
  }
  return args as CliArgs;
}

/** Render a simulation result as the CLI's human-readable stdout. */
export function formatResults(result: SimResult): string {
  const lines: string[] = [];
  for (const game of result.games) {
    lines.push(
      `game ${game.index} (seed ${game.seed}): ${game.completed ? 'ended' : 'unfinished'} ` +
        `turn ${game.turns}, ${game.actions} actions`,
    );
    for (const score of game.scores) {
      const win = game.winnerIds.includes(score.playerId) ? '  <-- winner' : '';
      lines.push(`  ${score.playerId}: ${score.total}${win}`);
    }
    if (game.scores.length === 0) lines.push('  (no result — game did not finish)');
  }
  return lines.join('\n');
}

/** Run the simulation named by parsed args, returning its result (the bin prints / writes). */
export function runCli(args: CliArgs): Promise<SimResult> {
  return runSim({
    count: args.count,
    seed: args.seed,
    games: args.games,
    mode: args.agents,
    ...(args.maxTurns !== undefined ? { maxTurns: args.maxTurns } : {}),
  });
}
