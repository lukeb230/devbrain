// DevBrain mark — sticker-style brain: bold ink outline, chunky curled gyri.
// Vector geometry only (no font, no image asset), so it stays crisp from a
// 16px favicon to a 200px hero and takes its fill from `currentColor` — which
// is what lets the desktop badge tint it red/amber/green by attention state.
//
// Below ~30px the full fold set turns to mush, so small sizes render a
// simplified subset with a slightly heavier stroke.
//
// The widget shell's badge (widget-shell/ui/strip.html) draws this same
// geometry: change the artwork in both places or they drift apart.

const INK = "#241b5e";

const SIL =
  "M32 6 C27.5 3 21 3.5 18.5 7.5 C13 6.5 8.5 10 8.5 15 C3.5 17 1.5 23.5 4.5 28 C1 32.5 2.5 39.5 7.5 42 C7.5 47.5 12.5 51.5 18 50.5 C20.5 54 26 55.5 30 53 C31 54.5 33 54.5 34 53 C38 55.5 43.5 54 46 50.5 C51.5 51.5 56.5 47.5 56.5 42 C61.5 39.5 63 32.5 59.5 28 C62.5 23.5 60.5 17 55.5 15 C55.5 10 51 6.5 45.5 7.5 C43 3.5 36.5 3 32 6 Z";

export function BrainMark({
  size = 28,
  className = "",
  title,
  id = "bm",
}: {
  size?: number;
  className?: string;
  title?: string;
  /** Unique per instance — clipPath ids must not collide on a page. */
  id?: string;
}) {
  const small = size < 30;
  return (
    <svg
      viewBox="-3 -3 70 70"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
    >
      <defs>
        <clipPath id={`clip-${id}`}>
          <path d={SIL} />
        </clipPath>
      </defs>
      <path
        d={SIL}
        fill="currentColor"
        stroke={INK}
        strokeWidth={small ? 4.2 : 3.6}
        strokeLinejoin="round"
      />
      <g
        clipPath={`url(#clip-${id})`}
        stroke={INK}
        strokeWidth={small ? 4.4 : 3.7}
        fill="none"
        strokeLinecap="round"
      >
        {small ? (
          <>
            <path d="M32 10 C32 17 25 18 25 24 C25 30 32 31 32 38 C32 44 27 45 27.5 49.5" />
            <path d="M17.5 12.5 C12.5 16 15.5 21 11 24 C14.5 26.5 12 31 15 33" />
            <path d="M46.5 12.5 C51.5 16 48.5 21 53 24 C49.5 26.5 52 31 49 33" />
            <path d="M10 37 C16 37.5 19 41 17 46.5" />
            <path d="M54 37 C48 37.5 45 41 47 46.5" />
          </>
        ) : (
          <>
            <path d="M32 10 C32 17 25 18 25 24 C25 30 32 31 32 38 C32 44 27 45 27.5 49.5" />
            <path d="M17.5 12.5 C12.5 16 15.5 21 11 24 C14.5 26.5 12 31 15 33" />
            <path d="M46.5 12.5 C51.5 16 48.5 21 53 24 C49.5 26.5 52 31 49 33" />
            <path d="M10 37 C16 37.5 19 41 17 46.5" />
            <path d="M54 37 C48 37.5 45 41 47 46.5" />
            <path d="M24 9 C20.5 13 23 16.5 19.5 19.5" />
            <path d="M40 9 C43.5 13 41 16.5 44.5 19.5" />
            <path d="M38.5 26 C44 26.5 45 32 41 35 C43.5 38 42 42 38.5 43" />
            <path d="M25.5 26 C20 26.5 19 32 23 35 C20.5 38 22 42 25.5 43" />
          </>
        )}
      </g>
    </svg>
  );
}
