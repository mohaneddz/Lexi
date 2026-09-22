import { type ComponentType, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookCheck,
  BookMarked,
  BookText,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  ImageOff,
  Languages,
  Menu,
  Plus,
  Search,
  Settings,
  Type,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { CaptureDialog } from "@/components/CaptureDialog";
import { cn } from "@/lib/utils";
import { getGroupIcon } from "@/lib/group-icons";
import { useGroups } from "@/hooks/useGroups";
import { getSettings, updateSettings } from "@/utils/storage";

type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Definitions", path: "/definitions", icon: BookText },
  { label: "Translations", path: "/translations", icon: Languages },
  { label: "Books", path: "/books", icon: BookMarked },
  { label: "Review", path: "/review", icon: BookCheck },
  { label: "Stats", path: "/stats", icon: ChartColumn },
  { label: "Groups", path: "/groups", icon: FolderTree },
  { label: "Settings", path: "/settings", icon: Settings },
];

type CaptureMode = "define" | "translate";

/** The tab the capture modal starts on, based on where you triggered it. */
function captureModeForPath(pathname: string): CaptureMode {
  return pathname.startsWith("/translations") ? "translate" : "define";
}
const PRIMARY_MODIFIER_LABEL = navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Ctrl";

function isPathActive(pathname: string, targetPath: string): boolean {
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

function emitAppEvent(name: "lexi:focus-search", path: string): void {
  window.dispatchEvent(new CustomEvent(name, { detail: { path } }));
}

function openCapture(mode: CaptureMode): void {
  window.dispatchEvent(new CustomEvent("lexi:capture", { detail: { mode } }));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
}

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const tabsRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");
  const [groupTabsIconOnly, setGroupTabsIconOnly] = useState(false);
  const [groupTabsOverflowing, setGroupTabsOverflowing] = useState(false);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);
  const { groups } = useGroups();
  const groupTabsDisabled =
    location.pathname === "/groups" ||
    location.pathname === "/stats" ||
    location.pathname === "/settings" ||
    location.pathname === "/books";

  const navLookup = useMemo(() => NAV_ITEMS.map((item) => item.path), []);

  const updateGroupTabsOverflow = useCallback(() => {
    const element = tabsRef.current;
    if (!element) {
      return;
    }

    const overflowing = element.scrollWidth - element.clientWidth > 8;
    setGroupTabsOverflowing(overflowing);
    setCanScrollTabsLeft(element.scrollLeft > 4);
    setCanScrollTabsRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 4);
  }, []);

  const triggerCapture = useCallback(() => {
    openCapture(captureModeForPath(location.pathname));
  }, [location.pathname]);

  const toggleGroupTabsIconOnly = useCallback(async () => {
    const nextValue = !groupTabsIconOnly;
    setGroupTabsIconOnly(nextValue);
    await updateSettings({ groupTabsIconOnly: nextValue });
    window.dispatchEvent(new CustomEvent("lexi:settings-updated", { detail: { groupTabsIconOnly: nextValue } }));
  }, [groupTabsIconOnly]);

  const scrollTabsBy = useCallback((direction: "left" | "right") => {
    const element = tabsRef.current;
    if (!element) {
      return;
    }

    const amount = Math.max(180, Math.round(element.clientWidth * 0.65));
    element.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem("lexi:sidebar-collapsed") === "1");
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);

  useEffect(() => {
    void getSettings().then((settings) => {
      setShortcutsEnabled(settings.shortcutsEnabled);
      setGroupTabsIconOnly(settings.groupTabsIconOnly);
    });

    const onSettingsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ shortcutsEnabled?: boolean; groupTabsIconOnly?: boolean }>;
      if (typeof customEvent.detail?.shortcutsEnabled === "boolean") {
        setShortcutsEnabled(customEvent.detail.shortcutsEnabled);
      }
      if (typeof customEvent.detail?.groupTabsIconOnly === "boolean") {
        setGroupTabsIconOnly(customEvent.detail.groupTabsIconOnly);
      }
    };

    window.addEventListener("lexi:settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      const nextValue = !current;
      try {
        window.localStorage.setItem("lexi:sidebar-collapsed", nextValue ? "1" : "0");
      } catch {
        // Ignore persistence failures in restricted contexts.
      }
      return nextValue;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shortcutsEnabled) {
        return;
      }

      const targetIsTyping = isTypingTarget(event.target);
      const isMeta = event.ctrlKey || event.metaKey;

      if (isMeta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        emitAppEvent("lexi:focus-search", location.pathname);
        return;
      }

      if (isMeta && event.key.toLowerCase() === "n") {
        event.preventDefault();
        triggerCapture();
        return;
      }

      if (isMeta && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        openCapture("translate");
        return;
      }

      if (isMeta && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        navigate("/review");
        return;
      }

      if (event.altKey && !isMeta && !targetIsTyping) {
        const index = Number(event.key);
        if (!Number.isNaN(index) && index >= 1 && index <= navLookup.length) {
          event.preventDefault();
          navigate(navLookup[index - 1]);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [location.pathname, navLookup, navigate, shortcutsEnabled, triggerCapture]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("lexi:group-filter-changed", {
        detail: { groupId: selectedGroupFilter === "all" ? "none" : selectedGroupFilter },
      }),
    );
  }, [selectedGroupFilter, location.pathname]);

  useEffect(() => {
    const onShowWindow = () => {
      navigate("/definitions");
    };

    window.addEventListener("lexi:show-window", onShowWindow);
    return () => window.removeEventListener("lexi:show-window", onShowWindow);
  }, [navigate]);

  useEffect(() => {
    updateGroupTabsOverflow();
  }, [groups.length, groupTabsIconOnly, location.pathname, updateGroupTabsOverflow]);

  useEffect(() => {
    const element = tabsRef.current;
    if (!element) {
      return;
    }

    const onScroll = () => updateGroupTabsOverflow();
    const resizeObserver = new ResizeObserver(() => updateGroupTabsOverflow());
    resizeObserver.observe(element);
    element.addEventListener("scroll", onScroll);
    window.addEventListener("resize", updateGroupTabsOverflow);

    return () => {
      resizeObserver.disconnect();
      element.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateGroupTabsOverflow);
    };
  }, [updateGroupTabsOverflow]);

  return (
    <div className="lexi-stage">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="mobile-overlay lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="lexi-window">
        <aside className={cn("lexi-sidebar", sidebarOpen && "open", sidebarCollapsed && "collapsed")}>
          <div className="lexi-sidebar-header">
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <Menu className="size-4" />
            </button>

            <div className="lexi-brand">
              <img src="/icon.png" alt="Lexi icon" className="lexi-brand-icon" />
              <span>Lexi</span>
            </div>
          </div>

          <nav className="lexi-side-nav">
            {NAV_ITEMS.map((item) => {
              const ItemIcon = item.icon;
              const active = isPathActive(location.pathname, item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn("lexi-nav-link", active && "is-active")}
                  onClick={() => setSidebarOpen(false)}
                >
                  <ItemIcon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="lexi-sidebar-footer space-y-1.5">
            <p className="subtle-caption px-1">{PRIMARY_MODIFIER_LABEL}+K search, {PRIMARY_MODIFIER_LABEL}+N capture, Alt+1..9 navigate</p>
          </div>
        </aside>

        <section className="lexi-main">
          <header className="lexi-topbar">
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </button>

            <button
              type="button"
              className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground lg:inline-flex"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <Menu className="size-4" />
            </button>

            <div className="lexi-tabs-shell">
              {groupTabsOverflowing ? (
                <button
                  type="button"
                  className="lexi-tabs-arrow"
                  onClick={() => scrollTabsBy("left")}
                  disabled={!canScrollTabsLeft}
                  aria-label="Scroll groups left"
                >
                  <ChevronLeft className="size-4" />
                </button>
              ) : null}

              <nav ref={tabsRef} className={cn("lexi-tabs custom-scrollbar", groupTabsIconOnly && "icon-only")}>
                <button
                  type="button"
                  className={cn("lexi-tab", selectedGroupFilter === "all" && "is-active", groupTabsDisabled && "cursor-not-allowed opacity-45", groupTabsIconOnly && "icon-tab")}
                  disabled={groupTabsDisabled}
                  onClick={() => {
                    setSelectedGroupFilter("all");
                    window.dispatchEvent(new CustomEvent("lexi:group-filter-changed", { detail: { groupId: "none" } }));
                  }}
                  title="All groups"
                  aria-label="All groups"
                >
                  {groupTabsIconOnly ? <FolderTree className="size-4" /> : <span>All</span>}
                </button>
                {groups.map((group) => {
                  const GroupIcon = getGroupIcon(group.iconName);

                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={cn(
                        "lexi-tab",
                        selectedGroupFilter === group.id && "is-active",
                        groupTabsDisabled && "cursor-not-allowed opacity-45",
                        groupTabsIconOnly && "icon-tab",
                      )}
                      disabled={groupTabsDisabled}
                      onClick={() => {
                        setSelectedGroupFilter(group.id);
                        window.dispatchEvent(new CustomEvent("lexi:group-filter-changed", { detail: { groupId: group.id } }));
                      }}
                      title={group.name}
                      aria-label={group.name}
                    >
                      <GroupIcon className="size-4 shrink-0" />
                      {groupTabsIconOnly ? null : <span>{group.name}</span>}
                    </button>
                  );
                })}
              </nav>

              {groupTabsOverflowing ? (
                <button
                  type="button"
                  className="lexi-tabs-arrow"
                  onClick={() => scrollTabsBy("right")}
                  disabled={!canScrollTabsRight}
                  aria-label="Scroll groups right"
                >
                  <ChevronRight className="size-4" />
                </button>
              ) : null}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="topbar-icon-btn inline-flex size-10 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                onClick={() => void toggleGroupTabsIconOnly()}
                aria-label={groupTabsIconOnly ? "Show group names" : "Hide group names"}
                title={groupTabsIconOnly ? "Show group names" : "Hide group names"}
              >
                {groupTabsIconOnly ? <Type className="size-4" /> : <ImageOff className="size-4" />}
              </button>

              <button
                type="button"
                className="topbar-icon-btn inline-flex size-10 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                onClick={() => emitAppEvent("lexi:focus-search", location.pathname)}
                aria-label="Search"
                title={`${PRIMARY_MODIFIER_LABEL}+K`}
              >
                <Search className="size-4" />
              </button>

              <button
                type="button"
                className="topbar-capture-btn inline-flex h-10 items-center gap-2 rounded-lg border border-white/14 bg-white/10 px-3.5 text-sm font-semibold text-foreground transition hover:bg-white/16"
                onClick={triggerCapture}
                title={`${PRIMARY_MODIFIER_LABEL}+N`}
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Capture</span>
              </button>
            </div>
          </header>

          <div className="lexi-main-body">{children}</div>
        </section>
      </div>

      <CaptureDialog />
    </div>
  );
}
