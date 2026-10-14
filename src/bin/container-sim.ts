#!/usr/bin/env node
/**
 * `container-sim` — the headless Container CLI (Action Plan Phase 2).
 *
 * Runs games from the terminal with **no server**: `createGame` → agent loop → scores, plus an
 * optional replay JSON. It exists to build and test the agent loop before any server is involved, so
 * a policy or a model integration can be exercised with zero risk to the live apply path.
 *
 * Modes:
 *   --agents heuristic  the synchronous built-in self-play (default)
 *   --agents pi         the async agent loop; the built-in heuristic stands in for the model, so the
 *                       CLI itself never calls out. A host wires a real decider through `runAgentGame`.
 *
 * Flag parsing and output live in `src/sim/cli.ts` so they are unit-tested; this file is the thin
 * shebang wrapper that touches `process` and the filesystem.
 */
import { writeFileSync } from 'node:fs';
import { formatResults, HELP, parseArgs, runCli } from '../sim/cli.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }

  const args = parseArgs(argv);
  const result = await runCli(args);
  process.stdout.write(`${formatResults(result)}\n`);

  if (args.emitReplay && result.replay) {
    writeFileSync(args.emitReplay, JSON.stringify(result.replay));
    process.stdout.write(`wrote replay (${result.replay.snapshots.length} snapshots) to ${args.emitReplay}\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
