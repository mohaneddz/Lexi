import type { ViewMode } from "@/types";

export const SURFACE_ZOOM_STEPS = [70, 85, 100, 115, 130, 145, 160] as const;
export const DEFAULT_SURFACE_ZOOM = 100;
export const MIN_SURFACE_ZOOM = SURFACE_ZOOM_STEPS[0];
export const MAX_SURFACE_ZOOM = SURFACE_ZOOM_STEPS[SURFACE_ZOOM_STEPS.length - 1];

export type ZoomDirection = "in" | "out";

export function clampSurfaceZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SURFACE_ZOOM;
  }

  let closest: number = SURFACE_ZOOM_STEPS[0];
  let distance = Math.abs(value - closest);

  for (const step of SURFACE_ZOOM_STEPS) {
    const nextDistance = Math.abs(value - step);
    if (nextDistance < distance) {
      closest = step;
      distance = nextDistance;
    }
  }

  return closest;
}

export function nextSurfaceZoomStep(currentZoom: number, direction: ZoomDirection): number {
  const current = clampSurfaceZoom(currentZoom);
  const index = (SURFACE_ZOOM_STEPS as readonly number[]).indexOf(current);
  if (index < 0) {
    return DEFAULT_SURFACE_ZOOM;
  }

  if (direction === "in") {
    return SURFACE_ZOOM_STEPS[Math.min(SURFACE_ZOOM_STEPS.length - 1, index + 1)];
  }

  return SURFACE_ZOOM_STEPS[Math.max(0, index - 1)];
}

export function cardMinWidthFor(mode: ViewMode, zoom: number): number {
  if (mode === "list") {
    return 0;
  }

  const baseWidth = mode === "tiles" ? 168 : 344;
  const rawWidth = Math.round((baseWidth * clampSurfaceZoom(zoom)) / 100);
  const minWidth = mode === "tiles" ? 118 : 204;
  const maxWidth = mode === "tiles" ? 260 : 426;
  return Math.max(minWidth, Math.min(maxWidth, rawWidth));
}
