import { defineConfig } from 'vitest/config';

/**
 * Coverage gates for the Container game package (Track D — the second game extracted OUT of the
 * platform monorepo, after Labyrinth). This config carries **both** gates the game answered to
 * in-workspace — the platform-wide engine 100% gate and the bot 90% gate — which no longer reach this
 * game now that it lives in its own repo, so this file is what keeps that discipline honest.
 *
 * The two gates are enforced with **per-glob thresholds**: `src/engine/**` at 100% (rules — every branch
 * is a rule and deserves a test) and `src/bot/**` at 90% (opinions — heuristic weights get retuned, so a
 * 100% bar on judgement calls buys churn, not correctness; what must stay covered is that every decision
 * is legal and every policy is reachable). The module and client are host bindings tested by the hub's
 * own backend/UI suites once this game is registered; they are deliberately outside this gate but their
 * tests, where present, still run here. The bot's self-play + bench tests move with the bot and run here
 * (3–5 player self-play, seeded rng).
 */
export default defineConfig({
  test: {
    include: ['src/engine/**/*.test.ts', 'src/bot/**/*.test.ts', 'src/sim/**/*.test.ts'],
    // The bot's bench/self-play tests run whole seeded games (CPU-bound), and CI caps vitest to one fork
    // (`VITEST_MAX_FORKS`), so the default 5s timeout starves them under contention. Headroom, not a
    // hang-mask: a genuinely wedged test still dies here.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/engine/**/*.ts', 'src/bot/**/*.ts', 'src/sim/**/*.ts'],
      exclude: [
        // Engine excludes (ported verbatim from the hub's engine gate).
        'src/engine/**/tests/**', // test files + shared helpers
        'src/engine/**/index.ts', // public + folder barrels (re-exports only)
        'src/engine/core/types.ts', // compile-time only (domain interfaces)
        'src/engine/actions/action.ts', // compile-time only (the Action union)
        // Bot excludes (ported from the hub's bot gate; the aggregator src/bot/bench.ts stays in bot/).
        'src/bot/**/tests/**', // test files + shared helpers
        'src/bot/**/index.ts', // public + policies barrels (re-exports only)
        'src/bot/types.ts', // compile-time only (options/context interfaces)
        // Sim: the barrel is re-exports only, and the bin is a shebang wrapper tested through cli.ts.
        'src/sim/**/tests/**',
        'src/sim/index.ts',
        'src/bin/**',
      ],
      thresholds: {
        // The pure rules core — every rule and every rejection path tested.
        'src/engine/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // The AI opinions — legal + reachable, not exhaustive (the bot package's standing 90% bar).
        'src/bot/**': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // The headless sim loop — orchestration, not rules, so the same 90% bar as the bot: every
        // path (agent, fallback, replay, CLI) must be reachable, but the exact branches of a driver
        // dispatch are not rules and don't earn a 100% bar.
        'src/sim/**': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
