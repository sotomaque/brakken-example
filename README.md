# Airspace Deconfliction Prototype (React + MapLibre)

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Bun](https://bun.sh/) (recommended) or npm

## Getting Started

```bash
# Install dependencies
bun install

# Start the dev server
bun dev
```

The app will be available at **http://localhost:5173/**.

### Troubleshooting

If you see an error about `@rollup/rollup-darwin-arm64` or invalid code signatures, remove `node_modules` and reinstall:

```bash
rm -rf node_modules
bun install
```

### Other Scripts

```bash
# Type-check and build for production
bun run build

# Preview the production build
bun run preview
```

## Controls (high level)
- **Keypad select**: click the "Keypad select" button (or use your UI button) then click keypads to select.
- Press **A** to create an airspace from selected keypads.
- Press **F** to enter free draw mode:
  - Click to add points
  - Press **Enter** to complete shape
  - Press **Esc** to cancel
- Press **E** to edit the selected row:
  - KEYPAD airspace: enters keypad toggle mode (click keypads to add/remove)
  - FREEDRAW airspace/shape: enters redraw mode; draw a new geometry and press Enter
- Conflicts appear with **red rows**. Resolve by:
  - change altitude
  - change geometry/keypads
  - set **mutual MARSA** between aircraft (both sides)

## Notes
- Geospatial math is intentionally approximate (flat AOR rectangle).
- Keypad-derived geometry uses a simple bounding rectangle hull for display.
- Free-draw keypads are derived by including keypads whose centers fall inside the polygon.
