# @game-hub/game-container

**Container (10th Anniversary Edition)** as a [Game Hub](https://github.com/whtdrgn101/game-hub) game
package: a 3–100 player economic supply-chain game where you produce goods, ship them down a chain you do
**not** control — onto opponents' harbors and ships, then to the island — and where **you can never buy or
ship your own containers**. Every player holds a secret scoring card; when two colours of goods run out the
game ends and the highest total wins. Resource supply scales linearly with the seat count (so an N-agent
game deals correctly at any N), and the engine ships a headless simulation surface for driving games
without a server.

**And it is built outside the platform's monorepo.** Most Game Hub games live inside the platform's
monorepo. This one does not: it is a standalone repository that depends on `@game-hub/kernel` and
`@game-hub/ui-kit` **from the public npm registry**, like any third-party consumer would. It follows the
pattern the first out-of-repo game, [`@game-hub/game-labyrinth`](https://github.com/whtdrgn101/game-labyrinth),
proved (Track D) — installed into the hub as a compiled `dist/` package, with no path, alias or build shim
reaching back into either repo.

There are **zero references to the platform repository** in this one: no path, no link, no `file:` dep. The
lockfile resolves `@game-hub/*` to registry tarballs with integrity hashes, and CI installs with
`--frozen-lockfile` so it cannot silently start doing anything else.

## The subpaths

A Game Hub game is **additive** — subpath exports behind game-agnostic hosts, so adding one touches no
shared core:

```
src/
  engine/     the pure rules core — no I/O, no Date, no Math.random. 100% coverage gate.
    core/       constants, types, errors, the scoring cards, the container colours, the N-scaling formulas
    actions/    one mechanic per file (produce, sail, deliver, factory/harbor purchase, loans, bank, …)
    internal/   shared helpers (bank, containers, players, the kernel record()/seating bindings)
    createGame.ts   deterministic setup; view.ts   the per-viewer redaction (secret scoring card)
  module/     the backend seam — the GameModule. Container uses every optional hook: the delivery-auction
              routes over its own SQLite table, pendingStep, the onStateChanged auction push, and a bot
              runner with the sealed-bid auction preStep. Binds better-sqlite3 + Fastify **types only**.
  client/     the UI seam — the GameClient + the board (original board/ship/container art, the BoardMap,
              the player mats, the auction panel). The board is React.lazy so the home screen stays light.
  bot/        the AI (90% coverage gate) — decides from the redacted view (structurally unable to read an
              opponent's card): one-per-concern policies, sealed bids, self-play.
  sim/        the headless simulation surface (90% gate) — an **async** agent loop (the shape an external
              agent such as a language model plugs into), a portable replay envelope, and a bin.
  bin/        `container-sim`, a shebang wrapper over `sim/cli.ts`.
```

`./engine`, `./module`, `./client`, `./bot` and `./sim` are the entry points; each has its own `index.ts`.

### Headless simulation

```bash
node dist/bin/container-sim.js --count 100 --seed 42 --emit-replay out.json
container-sim --agents pi --count 8 --games 3       # once installed, the bin is on PATH
```

The CLI runs games with no server, prints the scores, and optionally writes a replay JSON. `--agents
heuristic` (default) uses the synchronous built-in self-play; `--agents pi` uses the async agent loop with
the built-in heuristic standing in for a model — a host wires a real decider through `runAgentGame`. The
loop contains any bad/timed-out agent decision with the deterministic built-in `decide`, so a game never
wedges. Replays are **full snapshots**, not the lossy `moves` log (a losing delivery bid is never recorded),
so a replay reconstructs every turn and the final scoring exactly.

## Running it

Requires **Node 22** (`.nvmrc`) and **pnpm** (the version is pinned in `packageManager`).

```bash
pnpm install         # resolves @game-hub/* from the public registry
pnpm test            # vitest + the coverage gates (engine 100%, bot 90%, sim 90%)
pnpm test:watch
pnpm typecheck       # strict TS across all subpaths
pnpm lint            # ESLint 9 flat config — real hazards, not a second typecheck
pnpm format:check    # Prettier (hand-wrap Markdown; *.md is Prettier-ignored)
pnpm build           # tsc → dist/ (JS + .d.ts + inline-source maps), what publishConfig points at
pnpm pack:smoke      # pack, install outside this repo, play a game (+ a bot move + a sim replay) under
                     # plain node, then typecheck a consumer against the shipped .d.ts under nodenext
```

⚠️ **Relative imports in the shipped sources carry an explicit `.js` extension** (`'../engine/index.js'`) —
`tsc` emits them verbatim and Node ESM resolves neither extensions nor directories, so extensionless ones
would produce a tarball that throws on a host's first import while every command above stayed green.
`pack:smoke` is what catches it.

CI (`.github/workflows/ci.yml`) runs exactly those, in that order, on a runner with no access to the platform
monorepo.

**Using this package in a host, before it is published:** `pnpm pack` here, then depend on the tarball — the
hub consumes each out-of-repo game exactly that way from a committed `vendor/` directory.

## Rules, and what's original

The authoritative rules are the **Container rulebook**, cited by page number in the engine's comments. The
rulebook PDF is **not** in this repository — it is copyrighted, so it stays local (gitignored) — see
[`reference_materials/README.md`](./reference_materials/README.md). Mechanics aren't copyrightable; the
_illustrations_ are, so every board, ship and container asset here is drawn fresh in the house style. The
slice history, rules digest and rulings live in [`ROADMAP.md`](./ROADMAP.md).

## Licence

BSD-3-Clause (see [`LICENSE`](./LICENSE)). Not affiliated with or endorsed by the game's publisher.
