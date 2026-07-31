import type {
  BoardProps as KernelBoardProps,
  GameClient as KernelGameClient,
  GameMessage,
  GamePayload,
} from '@game-hub/kernel/client';

/**
 * The `GameClient` seam, bound for Container (Track D — legacy-migration phase 5).
 *
 * The kernel exposes the framework-level `GameClient`/`BoardProps` *contract*; this file pins its generic
 * transport parameters to the kernel's concrete transport DTOs (`GamePayload<S>`, `GameMessage`). This is
 * a standalone, out-of-repo Game Hub game package: the client imports only `@game-hub/kernel/client` (the
 * contract + transport DTOs) and `@game-hub/ui-kit` (the shared board chrome) — no `ui/src` import and no
 * `@` alias. It is fully decoupled from the hub shell (the D2b end-state); the hub consumes this package
 * as an installed dependency.
 */
export type GameClient<S> = KernelGameClient<S, GamePayload<S>, GameMessage>;

/** What the shell hands the board — the kernel contract with this shell's transport DTOs bound in. */
export type BoardProps<S> = KernelBoardProps<S, GamePayload<S>, GameMessage>;
