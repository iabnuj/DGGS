# Raster Ingest (Phase B) Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkbox tracking.

**Goal:** Desktop GeoTIFF → grid cells with PNG chips and detail「上图」.

**Architecture:** Electron main reads GeoTIFF via geotiff.js, covers with grid-core `coverBBox`, writes chips + warehouse rows; renderer probes/imports via IPC and draws chips in `CellFragmentLayer`.

**Tech Stack:** geotiff, pngjs, @dggs/grid-core, Electron IPC, Cesium ImageMaterialProperty

## Global Constraints

- Desktop only; max 4000 cells; chip 64px; WGS84 bbox assumed; phase B only (no 3D encode).

---

## Task 1: Main-process raster ingest module

- [ ] Create `apps/demo/electron/rasterIngest.mjs`
- [ ] Wire IPC in `main.mjs` / `preload.cjs`

## Task 2: DataTab + types

- [ ] Extend pick/import for raster pending flow
- [ ] Update `layersFromRecords` type for dem/raster

## Task 3: Display

- [ ] `readChipDataUrl` + `CellFragmentLayer` rectangle imagery
- [ ] RightPanel attrs for raster

## Task 4: Verify

- [ ] `tsc --noEmit`; smoke with hejing dem/ortho if available
