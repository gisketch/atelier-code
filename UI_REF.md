<role>
You are an expert frontend engineer and visual designer. Your job is to keep Atelier visually consistent with its current dark glassmorphism system.

Before changing UI:
- Inspect the current stack and local styles first.
- Preserve the existing React/Vite/Tauri structure.
- Prefer centralized CSS tokens over one-off component styles.
- Keep the interface dense, quiet, and app-like.
- Validate with the repo checks in `docs/quality.md`.
</role>

<design-system>
# Design Style: Navi Dark Glass

## Source Of Truth

Atelier follows the dark glassmorphism language used in `gisketch/navi`.

Reference implementation:
- `https://github.com/gisketch/navi/blob/main/src/utils/glass.ts`
- `https://github.com/gisketch/navi/blob/main/src/components/AnimatedBackground.tsx`

The active Atelier implementation lives in `src/ui/styles.css`.

## Core Look

The UI is almost black, with transparent glass panes sitting over faint ambient color. It should feel like black glass, not frosted white glass.

Use:
- Page base: `#000000` or near black.
- Glass panes: `rgba(255, 255, 255, 0.03)`.
- Hover panes: `rgba(255, 255, 255, 0.06)`.
- Buttons: `rgba(255, 255, 255, 0.08)`.
- Borders: `rgba(255, 255, 255, 0.08)` for cards, `0.15` for buttons.
- Blur: `backdrop-filter: blur(24px)`.
- Modal blur: `blur(40px)` when needed.
- Shadows: black, soft, layered.
- Top highlight line: 1px gradient from transparent to white/20 to transparent.

Avoid bright glass. Avoid milky panels. Avoid saturated backgrounds.

## Ambient Background

Use a black base with very subtle cyan, purple, and blue radial light. The glow should be barely present until a pane moves over it.

Preferred ambient values:
- Cyan: `rgba(6, 182, 212, 0.04-0.09)`.
- Purple: `rgba(168, 85, 247, 0.04-0.07)`.
- Blue: `rgba(59, 130, 246, 0.04-0.06)`.
- Blur: `100px+`.
- Saturation: reduced, around `80-90%`.

Do not use large saturated blobs as decoration. The background supports the glass; it is not the subject.

## Glass Surfaces

Every card-like surface should use the same recipe:

```css
background: rgba(255, 255, 255, 0.03);
border: 1px solid rgba(255, 255, 255, 0.08);
box-shadow:
  0 8px 32px rgba(0, 0, 0, 0.3),
  inset 0 1px 1px rgba(255, 255, 255, 0.08);
backdrop-filter: blur(24px);
-webkit-backdrop-filter: blur(24px);
```

Add the 1px top highlight:

```css
background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.2), transparent);
```

## Hover Glow

Hover glow should match Navi: proximity-based, subtle, local, and cyan-tinted. It should not make the whole UI brighter.

The cursor or active pointer is the glow source. Render a subtle fixed cursor aura and let nearby glass surfaces reflect it.

Cursor aura:

```css
width: 220px;
height: 220px;
background: radial-gradient(
  circle,
  rgba(34, 211, 238, 0.019) 0%,
  rgba(34, 211, 238, 0.009) 34%,
  transparent 68%
);
filter: blur(18px) saturate(45%);
```

Each glass surface calculates:
- Distance from pointer to the surface center.
- Glow intensity from distance.
- Pointer position relative to the surface.

Use the Navi formula from `src/utils/glass.ts`:

```ts
const intensity = Math.pow(1 - distance / maxDistance, 1.5) * 0.8;
const relX = ((sourcePosition.x - elementRect.left) / elementRect.width) * 100;
const relY = ((sourcePosition.y - elementRect.top) / elementRect.height) * 100;
```

Then pass CSS variables to the surface:

```css
--glow-intensity: 0;
--glow-x: 50%;
--glow-y: 50%;
```

The radial reflection should appear at the relative pointer point:

```css
background:
  radial-gradient(
    circle at var(--glow-x) var(--glow-y),
    rgba(34, 211, 238, calc(var(--glow-intensity) * 0.0044)) 0%,
    rgba(34, 211, 238, calc(var(--glow-intensity) * 0.0022)) 24%,
    transparent 62%
  );
```

Use:

```css
background: rgba(255, 255, 255, 0.06);
border-color: rgba(255, 255, 255, 0.11);
box-shadow:
  0 12px 48px rgba(0, 0, 0, 0.4),
  0 0 calc(24px + 16px * var(--glow-intensity)) rgba(34, 211, 238, calc(0.0024 + var(--glow-intensity) * 0.004)),
  inset 0 1px 1px rgba(255, 255, 255, 0.1);
```

Optional pane overlay:

```css
background: radial-gradient(circle at 50% 0%, rgba(34, 211, 238, 0.075), transparent 58%);
```

Do not exceed `rgba(34, 211, 238, 0.008)` on card hover/proximity unless the user asks for a stronger glow.

## Typography

Use clean app typography:
- Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Primary text: off-white to white, readable on black glass.
- Muted text: `rgba(226, 232, 255, 0.78)` or similar.
- Letter spacing: `0`.
- Avoid oversized marketing typography inside panels.

## Radius And Layout

Atelier keeps practical app geometry:
- Cards and panels: 8px radius unless a component already establishes a different local pattern.
- Icon buttons: 8px radius.
- Pills/counters: full radius.
- No cards inside cards unless the inner item is a repeated object.
- Keep boards, metrics, and status surfaces dense and scannable.

## Interaction Rules

Use precise, small transitions:
- Duration: `160-220ms`.
- Easing: `ease-out`.
- Hover changes: background, border, shadow, faint glow.
- Avoid bounce, large movement, or heavy scale.

Focus states must remain visible. If hover glow is also used for focus, pair it with a clear border change.

## Anti-Patterns

Do not use:
- Bright saturated ambient gradients.
- Milky white glass.
- Beige, cream, purple-dominant, or single-hue themes.
- Heavy glow always on.
- Large decorative orbs in the foreground.
- Pure marketing page layout for app screens.
- Text explaining the UI inside the UI.
</design-system>
