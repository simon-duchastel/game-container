/**
 * Numeric game constants, all sourced from the rulebook. Kept in one place so tuning/verifying
 * values is a single-file change and no magic numbers leak into the mechanics.
 */

/** Starting cash: five $1s, five $2s, one $5 (rulebook setup step 12). */
export const STARTING_MONEY = 20;

/** A Produce action always costs $1 in union wages, regardless of how many containers are produced. */
export const UNION_WAGE = 1;

/** Each built factory adds 2 to the factory-district storage limit (rulebook, pg. 5). */
export const FACTORY_STORAGE_PER_FACTORY = 2;

/** Each built warehouse adds 1 to the harbor-district storage limit (rulebook, pg. 5). */
export const WAREHOUSE_STORAGE_PER_WAREHOUSE = 1;

/** Actions a player may take per turn (rulebook, pg. 6). */
export const ACTIONS_PER_TURN = 2;

/** Building caps per player (rulebook, pg. 5): 4 factories total, 5 warehouses total. */
export const MAX_FACTORIES = 4;
export const MAX_WAREHOUSES = 5;

/** Max containers a ship can carry — fixed, cannot be increased (rulebook, pg. 9). */
export const SHIP_CAPACITY = 5;

/** Bank loans (rulebook pg. 16): $10 cash each, max 2 outstanding, $1 interest per loan per turn. */
export const LOAN_AMOUNT = 10;
export const MAX_LOANS = 2;
/** At game end each outstanding loan costs $10 principal + $1 interest (rulebook pg. 18). */
export const LOAN_ENDGAME_COST = 11;

/** Off-Shore Bank setup: cash lots I/II/III start at $1/$2/$3 (rulebook setup step 6). */
export const BANK_CASH_LOT_SETUP: readonly number[] = [1, 2, 3];

/**
 * The Off-Shore Bank's auction tokens as a closed-form function of the player count. The rulebook
 * setup table gives 1 token for 3–4 players and 2 for 5; that curve is not linear, so this is the
 * one deliberately-chosen fit. `Math.max(1, n - 3)` reproduces 1/1/2 exactly and grows gently
 * (97 tokens at N=100, against the steep `floor((n-1)/2)` = 49).
 */
export const bankAuctionTokens = (n: number): number => Math.max(1, n - 3);

/**
 * Resource counts are **linear in the player count**, anchored so N=3/4/5 reproduce today's rulebook
 * table byte-for-byte. The old `Record<number, number>` tables are gone because `[n]!` is `undefined`
 * at any N outside 3–5 — the whole reason a 100-seat game was impossible. The setup subtractions in
 * `createGame` (one starting factory/container/warehouse per seat, plus the 3 Bank containers) already
 * scale, so these formulas are the only engine change N-seat play needs.
 *
 * | Supply | 3/4/5 table | Formula |
 * |---|---|---|
 * | Factories per color | 2/3/4 | `n - 1` |
 * | Warehouses total | 12/16/20 | `4n` |
 * | Containers per color | 11/14/17 | `3n + 2` |
 *
 * `MAX_PLAYERS` is raised to the ceiling the N-agent work targets (was 5). `createGame` validates
 * against it; the host's `GAME_AGENT_COUNT` must not exceed it (the game's `maxPlayers` is derived
 * from this constant).
 */
export const factorySupplyPerColor = (n: number): number => n - 1;
export const warehouseSupplyTotal = (n: number): number => 4 * n;
export const containerSupply = (n: number): number => 3 * n + 2;

/** Supported player counts. The minimum is the rulebook's; the maximum is this build's N-agent ceiling. */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 100;

/** Valid storage-lot (sale) prices for each district, from the rulebook player board. */
export const FACTORY_LOT_PRICES = [1, 2, 3, 4, 5, 6] as const;
export const HARBOR_LOT_PRICES = [2, 3, 4, 5, 6, 7] as const;

/** Default lot for freshly produced containers when the player doesn't specify one (the $2 lot). */
export const DEFAULT_FACTORY_LOT = 2;

/** Default harbor lot for containers bought via Factory Purchase (buyer reprices afterward). */
export const DEFAULT_HARBOR_LOT = 2;

/**
 * Cost to build the next factory, indexed by how many factories you already have (the first is FREE).
 * From the rulebook player board: $4 and $12 are legible; $8 is the middle space (obscured by a
 * building on the art) and follows the +$4 progression. Verify against the physical board.
 */
export const FACTORY_BUILD_COSTS = [4, 8, 12] as const;

/**
 * Cost to build the next warehouse, indexed by how many warehouses you already have (the first is FREE).
 * TODO(verify): the warehouse track is obscured by buildings on the rulebook art; confirm these
 * against the physical board. Kept as a single named constant so correcting it is trivial.
 */
export const WAREHOUSE_BUILD_COSTS = [3, 6, 9, 12] as const;

// (The three per-count supply tables that used to live here are now the closed-form functions
// `factorySupplyPerColor` / `warehouseSupplyTotal` / `containerSupply` above.)
