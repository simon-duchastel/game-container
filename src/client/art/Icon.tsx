import { cn } from '@game-hub/ui-kit';

/**
 * Container's "box lid" mark — the game's icon in the hub's Card Table shell (kernel 1.3.0's optional
 * lazy `GameClient.Icon`). A square emblem in the same aged-chart, nautical idiom as the board art:
 * a parchment roundel (sepia ink border, `SEA`/`LAND` from `Chart.tsx`) carrying a side-profile
 * freighter — squared-off bow, wheelhouse aft, house flag, bow wave — the same freighter grammar as
 * `Ship.tsx`, stacked with the game's five cargo colours on deck (three across, two on top, exactly
 * `Ship.tsx`'s deck plan).
 *
 * The deck cargo is the five container colours from the engine's `COLORS` (mirrored from `chips.tsx`'s
 * `COLOR_HEX` — kept literal here so the art folder stays self-contained, like `Ship`/`Container`).
 * Colors are diegetic "physical mark" art and hardcoded on purpose — the emblem does not re-theme in
 * dark mode, matching the board art (`Chart.tsx`). Fills its box; size it via `className`, square
 * viewBox so it never distorts.
 *
 * **Lazy on purpose** (wired through `React.lazy(() => import('./art/Icon.js'))` in `index.ts`, exactly
 * like `Board`): the picker would otherwise ship every game's mark, and this art, to someone who only
 * opened the landing. Hence the plain default export a `lazy()` import resolves.
 */

// Parchment + ink, borrowed from Chart.tsx so the mark sits in the same world as the board.
const INK = '#6b4f2a';
const SEA = '#e8d9b8';
const LAND = '#d9c496';
const HULL = '#334155'; // Ship.tsx's default nautical slate hull

// The five cargo colours, in a stacking order (COLORS / chips.tsx COLOR_HEX): three across, two on top.
const CARGO = ['#f8fafc', '#ef4444', '#22c55e', '#3b82f6', '#eab308'] as const; // white red green blue yellow

// Deck plan: three containers across, two stacked on top — Ship.tsx's DECK_SLOTS, re-anchored for a
// square emblem (viewBox 0 0 64 64).
const DECK_SLOTS = [
  { x: 21, y: 36 },
  { x: 31, y: 36 },
  { x: 41, y: 36 },
  { x: 26, y: 30 },
  { x: 36, y: 30 },
] as const;

export function Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('block h-full w-full', className)} aria-hidden focusable="false">
      {/* parchment roundel — the box lid */}
      <circle cx="32" cy="32" r="30" fill={SEA} stroke={INK} strokeWidth="2" />
      <circle cx="32" cy="32" r="30" fill="none" stroke={INK} strokeWidth="0.6" opacity="0.5" strokeDasharray="1 2" />
      {/* sea band + a landfall sliver, so the ship rides real water */}
      <path d="M2 44 A30 30 0 0 0 62 44 L62 47 A30 30 0 0 1 2 47 Z" fill={LAND} opacity="0.55" />
      <path d="M2 40 A30 30 0 0 0 62 40 L62 44 A30 30 0 0 1 2 44 Z" fill="#cdb98a" opacity="0.5" />
      {/* wheelhouse aft, mast + house flag (Ship.tsx grammar) */}
      <rect x="13" y="26" width="8.5" height="10" rx="1" fill="#e8e4da" stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />
      <rect x="14.6" y="28" width="5.3" height="2" rx="0.5" fill="#35507a" opacity="0.85" />
      <rect x="14.6" y="31.5" width="5.3" height="1.3" rx="0.4" fill="#35507a" opacity="0.5" />
      <rect x="16.5" y="20" width="1.4" height="6" fill="#c8beac" />
      <path d="M17.9 20.5 l4 1.1 -4 1.1 Z" fill="#b23b3b" opacity="0.9" />
      {/* cargo: three across the deck, two stacked on top */}
      {DECK_SLOTS.map((slot, i) => (
        <g key={i}>
          <rect
            x={slot.x}
            y={slot.y}
            width="8.4"
            height="5"
            rx="0.6"
            fill={CARGO[i]}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="0.4"
          />
          <path
            d={`M${slot.x + 2.1} ${slot.y} v5 M${slot.x + 4.2} ${slot.y} v5 M${slot.x + 6.3} ${slot.y} v5`}
            stroke="rgba(0,0,0,0.15)"
            strokeWidth="0.35"
          />
        </g>
      ))}
      {/* hull: rounded stern (left), squared vertical bow face (right) — Ship.tsx's profile */}
      <path
        d="M10 41 L54 41 L54.5 42 L54.5 47 L52 49 Q32 51 14 49 Q10 47 10 43.5 Q10 42 10 41 Z"
        fill={HULL}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="0.7"
      />
      <path d="M10 41 L54 41 L54.5 42 L54.5 44 L10.5 44 Q9.8 42.6 10 41 Z" fill="#ffffff" opacity="0.15" />
      <path d="M11 46.4 L53.5 46.4" stroke="rgba(0,0,0,0.22)" strokeWidth="0.8" />
      {/* bow wave + wake */}
      <path d="M5 47 q4 -1.6 8 0 M51 48.5 q4 -1.6 8 0" stroke="rgba(255,255,255,0.6)" strokeWidth="0.9" fill="none" />
    </svg>
  );
}

export default Icon;
