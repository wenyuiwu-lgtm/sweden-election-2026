# Design conventions

Notes on visual patterns used across the frontend, so future additions stay
consistent instead of drifting per-component.

## Filters and segmented controls

Every interactive filter/toggle on the site (institute filter on Support
Trend, Current/2022/Compare on Party Support, and any future ones) shares one
color rule:

- **Selected / active state:** solid `var(--accent)` background with white
  text. No exceptions — don't use `bg-ink`, a white pill with a shadow, or any
  other "active" treatment.
- **Unselected state:** `bg-bg-sunken` (or the `.segmented-option` default)
  with `var(--ink-muted)` text, hover to `var(--ink)`.

Two markup patterns currently implement this, both driven by the same CSS
(`globals.css`, `.segmented-track` / `.segmented-option`):

1. **Segmented control** (fixed 2–4 options, e.g. Party Support's view
   switch): a `.segmented-track` wrapper containing `.segmented-option`
   buttons with `data-active={condition}`.
2. **Wrapping filter chips** (variable/longer option lists, e.g. the
   pollster filter): individual `rounded-full` buttons toggling between
   `bg-accent text-white` (active) and `bg-bg-sunken text-ink-muted
   hover:text-ink` (inactive) — same colors, just without the shared track
   background since the option count varies and wraps.

If a new filter is added, reuse one of these two patterns rather than
inventing a third color scheme.

## Cards

- Corner radius: `rounded-2xl` on all top-level section cards and the
  Disclosure/Methodology accordion.
- Shadow: the shared `.card-shadow` class — don't hand-roll a new
  `box-shadow` per component.

## Delta / comparison figures

Where a value is shown alongside a comparison baseline (e.g. Party Support's
Compare mode), the delta uses `var(--positive)` / `var(--negative)` for
gain/loss, muted `var(--ink-faint)` for exactly zero — see `DeltaBadge` in
`frontend/src/app/page.tsx`. Reuse that component rather than re-implementing
the same color logic elsewhere.
