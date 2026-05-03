/**
 * Fixed-position noise/grain overlay. Server-render safe.
 * Sits above content but below cursor (z-index 2 in globals.css).
 */
export function NoiseOverlay() {
  return <div className="noise-overlay" aria-hidden="true" />;
}
