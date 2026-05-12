# Goal

Turn the Atelier UI into a dark-mode glassmorphism-centered interface.

# Acceptance criteria

- All card-like surfaces use dark frosted glass styling.
- Background supports the glass effect with layered color and depth.
- Text remains readable on transparent surfaces.
- UI build/typecheck passes.

# Context links

- `docs/index.md`
- `docs/quality.md`
- Figr glassmorphism reference: transparency, blur, subtle border, layered hierarchy.

# Steps

- [x] Read project docs and current UI files.
- [x] Replace flat/card styling with dark glass tokens and layered surfaces.
- [x] Validate with typecheck/build.
- [x] Update progress log.

# Validation

- `bun run typecheck`
- `bun run ui:build`

# Decision log

- Use strategic `backdrop-filter` on cards, sidebars, and status surfaces only.
- Use dark translucent fills over a multi-color blurred background to preserve contrast.

# Progress log

- 2026-05-12: Started glassmorphism UI sweep from current Vite/Tauri shell.
- 2026-05-12: Added layered dark glass styling across topbar, metrics, columns, cards, and empty states.
- 2026-05-12: Passed `bun run typecheck` and `bun run ui:build`; inspected local UI at `http://127.0.0.1:5173`.
- 2026-05-12: Reworked glass tokens to match `gisketch/navi`: black base, `rgba(255,255,255,0.03)` panes, `0.08` white borders, 24px blur, black shadows, and top highlight lines.
- 2026-05-12: Added Navi-style cursor proximity glow using relative pointer position, distance-based intensity, radial pane reflection, and border/shadow lift.
- 2026-05-12: Added a subtle fixed cursor aura so the pointer itself carries the light source that nearby panes reflect.
- 2026-05-12: Reduced cursor aura and reflected proximity glow to roughly 20% of the initial strength and lowered saturation.
