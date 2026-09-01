import type { ViewMode } from "@/types";

export const DEFAULT_SURFACE_ZOOM = 100;
export const MIN_SURFACE_ZOOM = 40;
export const MAX_SURFACE_ZOOM = 260;
export const SURFACE_GRID_GAP_PX = 12;

export type ZoomDirection = "in" | "out";

export function clampSurfaceZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SURFACE_ZOOM;
  }

  return Math.round(Math.max(MIN_SURFACE_ZOOM, Math.min(MAX_SURFACE_ZOOM, value)));
}

function baseWidthFor(mode: ViewMode): number {
  return mode === "tiles" ? 168 : 344;
}

export function cardMinWidthFor(mode: ViewMode, zoom: number): number {
  if (mode === "list") {
    return 0;
  }

  const baseWidth = baseWidthFor(mode);
  const rawWidth = Math.round((baseWidth * clampSurfaceZoom(zoom)) / 100);
  const minWidth = mode === "tiles" ? 118 : 204;
  const maxWidth = mode === "tiles" ? 260 : 426;
  return Math.max(minWidth, Math.min(maxWidth, rawWidth));
}

export function columnCountForWidth(containerWidth: number, minWidthPx: number, gap = SURFACE_GRID_GAP_PX): number {
  if (containerWidth <= 0 || minWidthPx <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor((containerWidth + gap) / (minWidthPx + gap)));
}

function minWidthForColumnCount(containerWidth: number, columns: number, gap = SURFACE_GRID_GAP_PX): number {
  if (columns <= 1) {
    return containerWidth;
  }

  return Math.max(1, Math.floor((containerWidth + gap) / columns) - gap - 1);
}

function zoomForMinWidth(mode: ViewMode, minWidthPx: number): number {
  return Math.round((minWidthPx / baseWidthFor(mode)) * 100);
}

/**
 * Steps zoom to the next value whose resulting min-width changes the number of
 * columns that fit in `containerWidth` by exactly one - not an arbitrary
 * percentage jump that may skip several columns or none at all.
 */
export function nextSurfaceZoomForContainer(
  mode: ViewMode,
  currentZoom: number,
  containerWidth: number,
  direction: ZoomDirection,
): number {
  if (mode === "list" || containerWidth <= 0) {
    return clampSurfaceZoom(currentZoom + (direction === "in" ? 15 : -15));
  }

  const currentMinWidth = cardMinWidthFor(mode, currentZoom);
  const currentCols = columnCountForWidth(containerWidth, currentMinWidth);
  const targetCols = direction === "in" ? Math.max(1, currentCols - 1) : currentCols + 1;
  const targetMinWidth = minWidthForColumnCount(containerWidth, targetCols);
  return clampSurfaceZoom(zoomForMinWidth(mode, targetMinWidth));
}
