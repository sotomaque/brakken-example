# Airspace Deconfliction Prototype

Interactive airspace deconfliction tool built on a keypad-based grid system. Visualizes airspace reservations on a dark-themed map, detects altitude conflicts between overlapping keypads, and supports both keypad-select and free-draw geometry creation.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- **UI**: [React 19](https://react.dev/) + TypeScript
- **Map**: [MapLibre GL JS](https://maplibre.org/) (WebGL-based vector map rendering)
- **State**: [Zustand](https://zustand.docs.pmnd.rs/) (client-side singleton store)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) + global CSS custom properties
- **Design System**: [@accelint/design-toolkit](https://www.npmjs.com/package/@accelint/design-toolkit) (buttons, dialogs, tabs, sliders, etc.)
- **Hotkeys**: [@accelint/hotkey-manager](https://www.npmjs.com/package/@accelint/hotkey-manager)
- **Linting/Formatting**: [Biome](https://biomejs.dev/)

## Prerequisites

- [Bun](https://bun.sh/) v1.1+
- [Node.js](https://nodejs.org/) v20+

## Getting Started

```bash
# Install dependencies
bun install

# Start the dev server (Turbopack)
bun dev
```

The app will be available at **http://localhost:3000**.

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start dev server with Turbopack HMR |
| `bun run build` | Production build |
| `bun start` | Serve production build |
| `bun run format` | Format code with Biome |
| `bun run check` | Lint and check code with Biome |

## Project Structure

```
src/
  app/                        # Next.js App Router
    layout.tsx                # Root layout (HTML shell, metadata, CSS imports)
    page.tsx                  # Single route — renders the client app
    globals.css               # Consolidated CSS entry (Tailwind, fonts, design system, MapLibre)
  components/                 # React components
    ClientApp.tsx             # 'use client' boundary — providers (ThemeProvider, PortalProvider)
    App.tsx                   # Main app layout, modal handling, Zustand subscriptions
    MapView.tsx               # MapLibre GL map initialization, layers, hotkey registration
    RightPanel.tsx            # Airspace table with accordion rows, conflict display
    CreateAirspaceModal.tsx   # Dialog for creating airspaces from keypads or polygons
    HoverAndChat.tsx          # Hover info panel + scenario event timeline
    SpamAd.tsx                # Easter egg ad component
  lib/                        # Non-React: types, utilities, data
    types.ts                  # TypeScript type definitions
    utils.ts                  # Utility functions (grid math, geospatial, parsing)
    grid.ts                   # GeoJSON generation for killbox grid and keypad polygons
    scenario.ts               # Hardcoded scenario events and timeline
    referencePoints.ts        # Reference point definitions (bases, FOBs, ships)
  store.ts                    # Zustand store — all app state and actions
  styles.css                  # Global styles (CSS custom properties, layout, components)
public/                       # Static assets (served at /)
  icons/                      # Map reference point icons
```

### Architecture

The entire app is client-side interactive (WebGL map, keyboard shortcuts, drag-and-drop). A single `'use client'` directive on `src/components/ClientApp.tsx` creates the client boundary — all components below it are automatically client-rendered. The `src/app/` directory provides a thin Server Component shell for HTML generation and metadata.

## Controls

- **A** — Create airspace from selected keypads
- **F** — Enter free-draw mode
- **E** — Edit selected airspace/shape
- **Enter** — Confirm draw / submit keypad selection
- **Esc** — Cancel current operation
- **Delete** — Archive selected airspace

### Workflow

1. **Keypad select**: Click "Keypad select" or press **A**, then click keypads on the map to select them. Press **Enter** to confirm.
2. **Free draw**: Press **F**, click points on the map to draw a polygon/route/point, press **Enter** to complete.
3. **Edit**: Select an airspace row, then press **E** to re-draw geometry or toggle keypads.
4. **Conflicts**: Shown as red rows. Resolve by changing altitude, geometry, or setting mutual MARSA between aircraft.

## Notes

- Geospatial math is intentionally approximate (flat AOR rectangle).
- Keypad-derived geometry uses a simple bounding rectangle hull for display.
- Free-draw keypads are derived by including keypads whose centers fall inside the polygon.
