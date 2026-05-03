# Brand — endless·war

Modern premium identity for a CS 1.6 jail-mode community. The visual language is **deep ink + plasma gradient** (electric violet → magenta) with **cyan** as a live/info signal. Restraint over noise — one accent at a time, gradients reserved for hero surfaces.

> Why not gold/black: it screams 2010s casino/luxury car. Plasma violet/magenta is the current language of premium tech (Linear, Cursor, Arc, Vercel, Stripe) — it reads as 2026, not 1996.

## Concept

- **endless**: continuous, eternal — sharp-angled infinity loop (two diamonds touching).
- **war**: tactical, geometric, no curves. Lines and angles only.
- **jail**: the bars inside the diamond mark.
- **modern**: gradient stroke (not flat fill) — electricity/plasma metaphor; the mark feels alive.

## Palette

| Token | Hex | Use |
|-------|-----|-----|
| `ink` | `#0a0b14` | App background — slight blue cast (not pure black) |
| `void` | `#13141d` | Surface (panels, modals) |
| `slate` | `#1a1c27` | Surface raised (cards) |
| `border` | `#26283a` | Subtle dividers |
| `border-strong` | `#383b54` | Section separators |
| `plasma` | `#7c5cff` | Primary accent — electric violet |
| `plasma-bright` | `#9a7dff` | Hover / focus on primary |
| `plasma-dim` | `#5b3fcc` | Pressed / dim states |
| `flame` | `#ec4899` | Hot accent — magenta (war / hot states) |
| `flame-bright` | `#f472b6` | Hover on flame |
| `ember` | `#f43f5e` | Danger, ban, destructive actions |
| `cyan` | `#22d3ee` | Live indicator, info, online presence |
| `success` | `#34d399` | Approved, online, healthy |
| `warning` | `#fbbf24` | Pending, caution |
| `bone` | `#e8e9f3` | Primary text — cool tinted white |
| `ash` | `#a0a3b8` | Secondary text |
| `smoke` | `#6b6e85` | Muted text, placeholders |

**Gradient (signature)** — `plasma → purple-500 → flame`:
```css
background: linear-gradient(135deg, #7c5cff 0%, #a855f7 60%, #ec4899 100%);
```

**Rules**
1. Gradient is reserved for: logo, hero radial glow, primary CTA on hero, "premium" badge. Never on cards, never on body copy, never on icons in lists.
2. Pure black (`#000`) and pure white (`#fff`) are forbidden — use `ink` and `bone`.
3. One accent per surface. If `flame` is the focal point, `plasma` is muted. If `cyan` is showing live data, no `plasma` CTA next to it.
4. Default elevation is **flat**. Subtle border (`border-strong`) for separation. Shadows only for floating elements (modals, dropdowns, popovers).
5. Glow effects allowed but minimal — `box-shadow: 0 0 24px rgba(124, 92, 255, 0.15)` max for hero CTAs. No 80s neon overload.

## Typography

- **UI / body**: Inter (variable). Weights 400 / 500 / 600 / 700.
- **Display / hero**: Inter at weight 800, letter-spacing `-0.02em` for tight premium feel.
- **Mono / configs / IDs / steam_id**: JetBrains Mono.
- **Cyrillic**: Inter has full Cyrillic support — no fallback needed.
- Font-feature-settings `cv11`, `ss01` enabled globally for premium glyph alternates.

## Logo

| File | Use |
|------|-----|
| `frontend/public/logo.svg` | Header (32px tall), OG image, hero |
| `frontend/public/logo-icon.svg` | Compact spaces (avatars, inline) |
| `frontend/public/favicon.svg` | Browser tab — has `ink` background built in |

The mark uses a `linearGradient` definition inside the SVG so it stays plasma even on light surfaces (in case we ever do a "premium light" mode in v3).

**Clearspace**: minimum padding around the mark = height of one bar.

**Don't**:
- Recolor outside palette.
- Add drop-shadow / outer-glow on the mark itself (the gradient stroke already carries enough energy).
- Stretch non-uniformly.
- Place on busy photographic background without scrim.

## Voice

- **Direct**: short sentences, second person.
- **Technical**: not afraid of jargon (steam id, demo, RDM, AWP, jail).
- **Restrained**: no exclamation marks in UI copy. Reserve "!" for the few moments it matters.
- **Bilingual aware**: Russian primary, English fallback for technical terms (`Steam`, `WebRTC`, `OpenID`).

## Motion

- Default duration **150ms**, easing `cubic-bezier(0.16, 1, 0.3, 1)` (premium ease-out).
- No bounce. No spring. Confident, deliberate motion.
- Hover transitions: `opacity`, `border-color`, `color`. Avoid `transform` on body UI.
- Page transitions: subtle 200ms fade only.
- Live indicators (online dot, plasma badge): slow pulse, **2s cycle**, `opacity 0.4 → 1`.
- Hero gradient breathes: extremely slow (12s) gentle position shift, optional — disable on `prefers-reduced-motion`.
