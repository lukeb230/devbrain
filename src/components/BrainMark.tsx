// DevBrain mark — the illustrated brain (public/brain.png, transparent).
// Same artwork is used by the desktop badge (widget/ui/brain.png) and the
// app icon (widget/app-icon.png → src-tauri/icons): change all three together.
//
// The image is 543×440; `size` sets the height and width follows the aspect
// ratio so the mark never squashes. Attention colour on the badge is a ring
// around the image rather than a tint (raster art can't take currentColor).

/* eslint-disable @next/next/no-img-element */

const ASPECT = 543 / 440;
// Bump when the artwork changes: the widget's WKWebView caches /brain.png
// aggressively, so a same-URL swap can leave the old mark in the header.
const SRC = "/brain.png?v=2";

export function BrainMark({
  size = 28,
  className = "",
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
  /** Kept for call-site compatibility; unused by the raster mark. */
  id?: string;
}) {
  return (
    <img
      src={SRC}
      alt={title ?? ""}
      role={title ? "img" : "presentation"}
      width={Math.round(size * ASPECT)}
      height={size}
      className={"inline-block select-none " + className}
      draggable={false}
    />
  );
}
