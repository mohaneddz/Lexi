import { useEffect, useMemo, useState } from "react";

import type { SurfaceKey, ViewMode } from "@/types";
import {
  MAX_SURFACE_ZOOM,
  MIN_SURFACE_ZOOM,
  clampSurfaceZoom,
  nextSurfaceZoomForContainer,
  type ZoomDirection,
} from "@/lib/surface-view";
import { getSettings, updateSettings } from "@/utils/storage";

export function useSurfaceViewPreference(surface: SurfaceKey, defaultMode: ViewMode = "list", defaultZoom = 100) {
  const [viewMode, setViewModeState] = useState<ViewMode>(defaultMode);
  const [zoom, setZoomState] = useState<number>(clampSurfaceZoom(defaultZoom));
  const [detailPanelOpen, setDetailPanelOpenState] = useState<boolean>(true);

  useEffect(() => {
    let active = true;

    void getSettings().then((settings) => {
      if (!active) {
        return;
      }

      const entry = settings.surfaceViews[surface];
      setViewModeState(entry?.mode ?? defaultMode);
      setZoomState(clampSurfaceZoom(entry?.zoom ?? defaultZoom));
      setDetailPanelOpenState(entry?.detailPanelOpen ?? true);
    });

    const onSettingsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ surfaceViews?: Record<string, { mode: ViewMode; zoom: number; detailPanelOpen?: boolean }> }>;
      const entry = customEvent.detail?.surfaceViews?.[surface];
      if (!entry) {
        return;
      }
      setViewModeState(entry.mode);
      setZoomState(clampSurfaceZoom(entry.zoom));
      setDetailPanelOpenState(entry.detailPanelOpen ?? true);
    };

    window.addEventListener("lexi:settings-updated", onSettingsUpdated);
    return () => {
      active = false;
      window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
    };
  }, [defaultMode, defaultZoom, surface]);

  const persistSurfaceViews = async (nextMode: ViewMode, nextZoom: number, nextDetailPanelOpen: boolean) => {
    const settings = await getSettings();
    const nextSurfaceViews = {
      ...settings.surfaceViews,
      [surface]: {
        mode: nextMode,
        zoom: clampSurfaceZoom(nextZoom),
        detailPanelOpen: nextDetailPanelOpen,
      },
    };
    await updateSettings({ surfaceViews: nextSurfaceViews });
    window.dispatchEvent(new CustomEvent("lexi:settings-updated", { detail: { surfaceViews: nextSurfaceViews } }));
  };

  const setViewMode = async (nextMode: ViewMode) => {
    setViewModeState(nextMode);
    await persistSurfaceViews(nextMode, zoom, detailPanelOpen);
  };

  const setZoom = async (nextZoom: number) => {
    const clamped = clampSurfaceZoom(nextZoom);
    setZoomState(clamped);
    await persistSurfaceViews(viewMode, clamped, detailPanelOpen);
  };

  const stepZoom = async (direction: ZoomDirection, containerWidth: number) => {
    await setZoom(nextSurfaceZoomForContainer(viewMode, zoom, containerWidth, direction));
  };

  const toggleDetailPanel = async () => {
    const next = !detailPanelOpen;
    setDetailPanelOpenState(next);
    await persistSurfaceViews(viewMode, zoom, next);
  };

  const canZoom = useMemo(() => viewMode !== "list", [viewMode]);

  return {
    viewMode,
    setViewMode,
    zoom,
    setZoom,
    stepZoom,
    canZoom,
    detailPanelOpen,
    toggleDetailPanel,
    minZoom: MIN_SURFACE_ZOOM,
    maxZoom: MAX_SURFACE_ZOOM,
  };
}
