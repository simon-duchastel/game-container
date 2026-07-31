#!/usr/bin/env node
/**
 * Pack smoke test for `@game-hub/game-container` (Track D — the publish artefact check).
 *
 * Adapted from `@game-hub/game-labyrinth`'s `scripts/pack-smoke.mjs`, itself descended from
 * `@game-hub/kernel`'s D2a script. Every other check in this repo runs against **TypeScript source**:
 * `pnpm typecheck`, `pnpm test`. None of them says anything about the artefact a host actually installs,
 * which is a tarball whose `exports` resolve to `dist/`. Its failure modes are invisible from in here:
 *
 *   1. **Extensionless / directory relative imports.** `tsc` emits `from '../engine'` verbatim; Node ESM
 *      does neither extension nor directory resolution, so the installed package throws
 *      `ERR_MODULE_NOT_FOUND` on first import while every suite in this repo is green. Hence the `.js`
 *      specifiers in the shipped sources (see `CLAUDE.md`) — and hence this script, which is what stops
 *      somebody helpfully "tidying" them away.
 *   2. **A lazily-imported file that never made it into the tarball.** `./client` code-splits its board
 *      with `lazy(() => import('./Board.js'))`. Nothing loads that file until a player opens a game, so a
 *      missing or unresolvable `dist/client/Board.js` would ship silently and only break in production.
 *   3. **A dependency that leaked from `devDependencies`.** Only `@game-hub/kernel`, `@game-hub/ui-kit`
 *      and `react` (peers) plus `lucide-react` (this game's one real runtime dep) may ship. If a shipped
 *      file ever imports `vitest`, a testing-library, `better-sqlite3` or `fastify` as a *value*, the
 *      install below has no way to satisfy it. (Container names `better-sqlite3`/`fastify` **types only**
 *      in `./module` — they never emit into the JS, and the type step below proves the same.)
 *
 * So: pack it, install the tarball plus its **real peers from the public registry** into a throwaway
 * project outside this repo, and drive it two ways — plain `node` for the runtime surface (a game is
 * created, an action parsed/applied/redacted, a bot decides a legal move), and `tsc --noEmit` under
 * `nodenext` resolution (the strictest mode: it honours the `exports` map exactly as Node does and
 * refuses extensionless relative specifiers inside the shipped `.d.ts`) for the type surface.
 *
 * Run: `pnpm pack:smoke`   (CI runs it after the unit tests.)
 * Set `KEEP_SMOKE_DIR=1` to leave the temp project behind for inspection.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What plain Node must be able to do with the installed package: reach all four subpaths through the
 * `exports` map and get a *working* game out of them, not merely importable modules.
 */
const RUNTIME_SMOKE = `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { applyAction, createGame, legalActions, viewFor, COLORS, MIN_PLAYERS, MAX_PLAYERS } from '@game-hub/game-container/engine';
import containerModule from '@game-hub/game-container/module';
import containerClient from '@game-hub/game-container/client';
import * as bot from '@game-hub/game-container/bot';

const require = createRequire(import.meta.url);
const threePlayers = [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cara' }];

// --- ./engine — the pure rules core, driven for real. ---
assert.equal(MIN_PLAYERS, 3);
assert.equal(MAX_PLAYERS, 5);
assert.deepEqual([...COLORS].sort(), ['blue', 'green', 'red', 'white', 'yellow']);
const engineGame = createGame({ id: 'e', players: threePlayers });
assert.equal(engineGame.players.length, 3);
assert.equal(engineGame.status, 'active');
assert.ok(legalActions(engineGame, engineGame.players[0].id).length > 0);

// --- ./module — the backend seam: identity, then a real turn through parse -> apply -> redact. ---
assert.equal(containerModule.id, 'container');
assert.equal(containerModule.minPlayers, 3);
assert.equal(containerModule.maxPlayers, 5);
assert.equal(containerModule.kernelContract, 1);
assert.deepEqual([...containerModule.colors], ['indigo', 'teal', 'rose', 'amber', 'violet']);

// The module deals a fresh game with an injected rng (it shuffles the secret scoring deck). No
// Math.random anywhere — determinism is what makes the engine's 100% gate reachable.
let state = containerModule.createGame({ id: 'g', players: threePlayers, rng: () => 0.5 });
assert.equal(containerModule.versionOf(state), 0);
const active = state.players[state.activePlayerIndex].id;

// A turn: take the first legal action, round-trip it through the opaque-JSON parser exactly as the
// backend's /actions route does, then apply it.
const legal = containerModule.legalActions(state, active);
assert.ok(legal.length > 0, 'the active seat must have a legal action');
const parsed = containerModule.parseAction(JSON.parse(JSON.stringify(legal[0])));
assert.equal(parsed.ok, true);
state = containerModule.applyAction(state, active, parsed.action);
assert.equal(containerModule.versionOf(state), 1);
assert.equal(containerModule.movesOf(state).length, 1);
assert.equal(containerModule.parseAction({ type: 'NOPE' }).ok, false);

// The redaction that makes this game interesting to the platform: you see your own secret scoring card,
// every opponent's is null.
const mine = containerModule.viewFor(state, active);
assert.ok(mine.players.find((p) => p.id === active).scoringCard, 'my own scoring card is visible');
assert.equal(mine.players.find((p) => p.id !== active).scoringCard, null, "an opponent's card is redacted");
assert.deepEqual(viewFor(state, active), mine, './engine and ./module agree on the projection');

// mapError turns a domain error into a status, and declines anything it does not own. An END_TURN from
// a non-active seat is refused with NOT_YOUR_TURN (a fresh game, so seating is unambiguous — and END_TURN
// rather than REQUEST_LOAN, which deliberately escapes turn order per the rulebook).
const errGame = containerModule.createGame({ id: 'err', players: threePlayers, rng: () => 0.5 });
const errActive = errGame.players[errGame.activePlayerIndex].id;
const otherSeat = errGame.players.find((p) => p.id !== errActive).id;
const notMyTurn = (() => {
  try {
    applyAction(errGame, otherSeat, { type: 'END_TURN' });
  } catch (error) {
    return error;
  }
})();
assert.ok(notMyTurn, 'an END_TURN from a non-active seat must throw');
assert.equal(containerModule.mapError(notMyTurn).status, 409);
assert.equal(containerModule.mapError(new Error('not mine')), null);
assert.equal(containerModule.summarize(state).id, 'g');

// --- ./client — the UI seam. React must be resolvable from here; the board must stay code-split. ---
assert.equal(containerClient.id, 'container');
assert.equal(containerClient.name, 'Container');
assert.ok(containerClient.rules.length >= 4);
assert.equal(typeof containerClient.Status, 'function');
assert.equal(
  containerClient.Board.$$typeof,
  Symbol.for('react.lazy'),
  'the board must still be a React.lazy — losing the split is an invisible regression',
);
// …and the file that lazy import points at must actually be in the tarball and loadable by plain Node.
// Imported by path rather than through the exports map on purpose: this is the deep file nothing else
// touches until a player opens a game, which is exactly why it is worth proving here.
const clientDir = dirname(require.resolve('@game-hub/game-container/client'));
const board = await import(pathToFileURL(join(clientDir, 'Board.js')).href);
assert.equal(typeof board.default, 'function', 'dist/client/Board.js must load and default-export the board');

// --- ./bot — the AI decides a legal move from a redacted view, and the engine accepts it. ---
const fresh = containerModule.createGame({ id: 'b', players: threePlayers, rng: () => 0.5 });
const seat = fresh.players[fresh.activePlayerIndex].id;
const botMove = bot.decide(containerModule.viewFor(fresh, seat), seat);
assert.equal(typeof botMove.type, 'string');
const afterBot = containerModule.applyAction(fresh, seat, botMove);
assert.equal(containerModule.versionOf(afterBot), 1, "the bot's move must be legal for the engine");

// The only runtime dependency this package ships is lucide-react; everything else is a peer the host has.
assert.deepEqual(Object.keys(require('@game-hub/game-container/package.json').dependencies ?? {}), ['lucide-react']);

console.log('runtime smoke ok — ./engine ./module ./client ./bot all resolve, a game plays and a bot moves');
`;

/** What a consumer's compiler must see: the exported type surface, through the published `exports`. */
const TYPE_CONSUMER = `import { createGame, viewFor, type GameState, type GameView, type Action } from '@game-hub/game-container/engine';
import containerModule from '@game-hub/game-container/module';
import containerClient from '@game-hub/game-container/client';
import { decide, type DecideFn } from '@game-hub/game-container/bot';
import type { GameModule as KernelGameModule } from '@game-hub/kernel';

// The one assignment that matters: what ./module exports really is a kernel GameModule, checked through
// the *published* .d.ts of both packages rather than through the workspace's source. Container binds the
// kernel contract's host generics (Ctx to its ModuleContext, App to Fastify); this package does not
// re-export those bound aliases from the ./module barrel, so recover them from the module's own optional
// hooks (createBotDriver takes the Ctx; routes takes the App).
type Ctx = Parameters<NonNullable<typeof containerModule.createBotDriver>>[0];
type App = Parameters<NonNullable<typeof containerModule.routes>>[0];
const asContract: KernelGameModule<GameState, Action, Ctx, App> = containerModule;

// The module's createGame returns the engine's GameState — the seam that ties ./module's .d.ts to
// ./engine's, checked here through both published declaration sets. (The kernel contract's viewFor is
// game-agnostic and returns \`unknown\`; the *engine* owns the GameView type, so the redacted view a bot
// consumes comes from the engine's viewFor, exactly as ./bot itself imports it.)
const state: GameState = containerModule.createGame({
  id: 'g',
  players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cara' }],
  rng: () => 0.5,
});
const view: GameView = viewFor(state, state.players[0].id);
const botMove: ReturnType<DecideFn> = decide(view, state.players[0].id);

export const surface = {
  id: asContract.id,
  engineTurn: createGame({ id: 'g', players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cara' }] }).turn,
  client: containerClient.name,
  board: containerClient.Board,
  botMoveType: botMove.type as Action['type'],
};
`;

const CONSUMER_TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    jsx: 'react-jsx',
    // The strictest resolution mode on purpose: `nodenext` honours the `exports` map exactly as Node
    // does and rejects extensionless relative specifiers inside the shipped `.d.ts` files. If this
    // passes, a consumer on `bundler` resolution (which is what the hub uses) is safe by construction.
    module: 'nodenext',
    moduleResolution: 'nodenext',
    strict: true,
    noEmit: true,
    // Third-party declarations (lucide-react, csstype, fastify's own type tree, …) arrive transitively
    // and their health is not this script's business — what we are checking is that *our* .d.ts files
    // resolve and typecheck, which they must do before skipLibCheck ever applies.
    skipLibCheck: true,
    types: [],
  },
  include: ['consumer.ts'],
};

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(packageDir, 'package.json'));
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));

/** Run a command, streaming its output; a non-zero exit throws and fails the script. */
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const step = (message) => console.log(`\n▶ ${message}`);

// A temp dir under the OS temp root, deliberately **outside** this repo: inside it, pnpm/npm would
// resolve the package back to its own source and prove nothing.
const projectDir = mkdtempSync(join(tmpdir(), 'game-container-pack-smoke-'));
let ok = false;
try {
  step(`packing @game-hub/game-container → ${projectDir}`);
  // `prepack` runs the tsc build, so this also proves the build is wired to the publish path.
  run('pnpm', ['pack', '--pack-destination', projectDir], packageDir);
  const tarball = readdirSync(projectDir).find((name) => name.endsWith('.tgz'));
  if (!tarball) throw new Error('pnpm pack produced no .tgz');

  step(`installing ${tarball} + its declared peers into a throwaway project`);
  writeFileSync(
    join(projectDir, 'package.json'),
    `${JSON.stringify({ name: 'container-pack-smoke', version: '0.0.0', private: true, type: 'module' }, null, 2)}\n`,
  );
  // npm rather than pnpm: no workspace inference, and — crucially — the peers come from the **public
  // registry**, which is the honest version of "a host installs this game". The ranges are read from
  // this package's own `peerDependencies` so the smoke can never test a version it doesn't declare.
  // `--ignore-scripts` because nothing here should need to run a lifecycle script.
  const peers = Object.entries(manifest.peerDependencies).map(([name, range]) => `${name}@${range}`);
  run(
    'npm',
    ['install', `./${tarball}`, ...peers, '--no-audit', '--no-fund', '--no-package-lock', '--ignore-scripts'],
    projectDir,
  );

  step('runtime: driving a game through all four subpaths with plain node');
  writeFileSync(join(projectDir, 'smoke.mjs'), RUNTIME_SMOKE);
  run(process.execPath, ['smoke.mjs'], projectDir);

  step('types: tsc --noEmit against the installed package (nodenext resolution)');
  // The shipped `.d.ts` name types from a few packages a real host has but the peer install above does
  // not bring: `./client` names React types, and `./module` names `better-sqlite3`'s `Database` and
  // `fastify`'s `FastifyInstance` (type-only — a backend host that installs this game has both). Copy
  // those type-providing packages out of this repo's store rather than hitting the network again, so the
  // shipped declarations resolve exactly as they would in a real host. pnpm's strict store only exposes
  // `csstype` *from* `@types/react`, so resolve it through a require rooted there.
  const typesReactDir = dirname(require.resolve('@types/react/package.json'));
  const fromTypesReact = createRequire(join(typesReactDir, 'package.json'));
  const copies = [
    ['@types/react', typesReactDir],
    ['csstype', dirname(fromTypesReact.resolve('csstype/package.json'))],
    ['@types/better-sqlite3', dirname(require.resolve('@types/better-sqlite3/package.json'))],
    ['fastify', dirname(require.resolve('fastify/package.json'))],
  ];
  for (const [pkg, sourceDir] of copies) {
    cpSync(sourceDir, join(projectDir, 'node_modules', pkg), { recursive: true });
  }
  writeFileSync(join(projectDir, 'consumer.ts'), TYPE_CONSUMER);
  writeFileSync(join(projectDir, 'tsconfig.json'), `${JSON.stringify(CONSUMER_TSCONFIG, null, 2)}\n`);
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], projectDir);

  ok = true;
  console.log('\n✅ pack smoke passed — the published tarball plays a game and typechecks outside this repo.');
} finally {
  if (process.env['KEEP_SMOKE_DIR'] === '1') {
    console.log(`\n(kept ${projectDir}${ok ? '' : ' — the failure is reproducible there'})`);
  } else {
    rmSync(projectDir, { recursive: true, force: true });
  }
}
