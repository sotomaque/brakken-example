# Plan: Airspace Z-Ordering + Picasso Mode

## Context

When two airspaces overlap the same grid area at different altitudes, the current rendering stacks them with no visual indication that multiple airspaces exist. This plan addresses two problems:
1. **No z-ordering precedence** — airspaces render in array insertion order rather than by meaningful priority
2. **No way to see all overlapping airspaces** — outlines blend together with no visual separation

## Feature 1: Z-Ordering Precedence

**Files:** `src/MapView.tsx`

Sort the `airspacesGeo` feature array (lines ~42-64) so MapLibre renders in priority order (first = bottom):

1. **KEYPAD** airspaces render below **FREEDRAW** airspaces
2. Within the same kind, **lower altitude** renders below **higher altitude**
3. Use the highest point of an altitude block for comparison (`maxFt` for BLOCK, `singleFt` for SINGLE`)

Add a `getEffectiveAltitude()` helper, then insert a `.sort()` between `.filter()` and `.map()` in the existing `airspacesGeo` useMemo.

## Feature 2: Picasso Mode

When enabled, each overlapping airspace's **outline** is shifted by several pixels in a different direction, making all borders simultaneously visible. Fills remain in place (not offset). The offset distance is **customizable via a slider**, defaulting to **~7-8px**.

### Why this architecture

MapLibre's `line-translate` paint property is **not data-driven** — it can't vary per-feature. So we pre-create multiple outline layers (one per "offset slot"), each with a fixed `line-translate` value, and use MapLibre `filter` expressions to route each airspace feature to its assigned slot layer.

### Step 1: State management (`src/store.ts`)

Add to store state:
- `picassoMode: boolean` (default `false`)
- `picassoRadius: number` (default `8`, range 4-16)
- `overlapGroups: Map<string, number>` — maps airspaceId to offset slot (0-7)

Add actions:
- `togglePicassoMode()`
- `setPicassoRadius(n: number)`

Extend `recomputeDerived()`:
- Build adjacency graph of airspaces sharing **any keypads** (regardless of altitude — the whole point is showing airspaces at different altitudes over the same area)
- BFS to find connected components (overlap groups)
- Assign each member a deterministic slot (0-7) within its group, sorted by airspace ID for stability
- Airspaces with no overlaps get slot 0

### Step 2: Feature properties (`src/MapView.tsx`)

In the `airspacesGeo` useMemo, add `overlapSlot` property to each GeoJSON feature from `overlapGroups` map. Add `overlapGroups` to the useMemo dependency array.

### Step 3: Pre-create picasso layers (`src/MapView.tsx`)

Inside `map.on('load')`, after the normal outline layers, create **24 layers** (8 slots x 3 states):

```
picasso-outline-active-0 through picasso-outline-active-7
picasso-outline-planned-0 through picasso-outline-planned-7
picasso-outline-cold-0 through picasso-outline-cold-7
```

Each layer:
- Source: same `airspaces` GeoJSON source
- Filter: `['all', ['==', ['get', 'state'], STATE], ['==', ['get', 'overlapSlot'], SLOT]]`
- Paint: `line-translate` from offset table, `line-color` from existing `airspaceColorLogic`, `line-dasharray` per state
- Layout: `visibility: 'none'` initially

Offset table (slot → [x, y] pixels, scaled by `picassoRadius`):
```
slot 0: [0, 0]           — no offset (base position)
slot 1: [r, 0]           — right
slot 2: [-r, 0]          — left
slot 3: [0, r]           — down
slot 4: [0, -r]          — up
slot 5: [0.7r, 0.7r]     — down-right
slot 6: [-0.7r, 0.7r]    — down-left
slot 7: [0.7r, -0.7r]    — up-right
```

### Step 4: Toggle logic (`src/MapView.tsx`)

New `useEffect` reacting to `picassoMode` + `layerToggles.airspaces`:
- When picasso ON: hide 3 normal outline layers, show 24 picasso outline layers
- When picasso OFF: show 3 normal outline layers, hide 24 picasso outline layers
- The fill layer (`airspaces-fill`) is unaffected — always visible per existing toggle

Update the existing layer-toggle `useEffect` to also account for picasso mode when toggling airspace visibility.

New `useEffect` reacting to `picassoRadius`:
- Recompute offsets and call `map.setPaintProperty()` for each of the 24 picasso layers to update `line-translate`

### Step 5: UI controls (`src/MapView.tsx`)

In the "Grid & Layers" overlay panel, add:
- **Picasso Mode** checkbox toggle
- **Offset radius** slider (4-16px range), shown only when picasso mode is on

### Interactions — no changes needed

- **Click/hover detection** uses `airspaces-fill` layer which is NOT offset, so hit testing works on the true geometry
- **Selection highlight** is CSS-based in RightPanel, unaffected
- **Conflict detection** in store is independent of rendering

## Files Modified

| File | Changes |
|------|---------|
| `src/store.ts` | Add `picassoMode`, `picassoRadius`, `overlapGroups` state; add actions; extend `recomputeDerived()` with overlap group detection |
| `src/MapView.tsx` | Z-ordering sort; `overlapSlot` in feature props; 24 picasso layers; toggle effects; radius update effect; UI controls |

## Verification

1. Create two KEYPAD airspaces over the same grid area at different altitudes → confirm higher altitude renders on top
2. Create a FREEDRAW airspace over same area → confirm it renders above keypad airspaces
3. Toggle Picasso Mode ON → confirm overlapping outlines separate into visually distinct offset positions
4. Adjust the radius slider → confirm offset distance changes in real-time
5. Toggle airspace layer OFF → confirm all picasso layers also hide
6. Click/hover on overlapping area → confirm correct airspace is selected (uses un-offset fill geometry)
7. Add/remove airspaces from overlap group → confirm slot assignments update and display correctly
