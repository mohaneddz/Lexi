import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  BookCheck,
  BookOpenText,
  BookText,
  ChartColumn,
  Inbox,
  Languages,
  Menu,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { getSettings } from "@/utils/storage";

type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Inbox", path: "/inbox", icon: Inbox },
  { label: "Words", path: "/words", icon: BookOpenText },
  { label: "Translations", path: "/translations", icon: Languages },
  { label: "Definitions", path: "/definitions", icon: BookText },
  { label: "Review", path: "/review", icon: BookCheck },
  { label: "Stats", path: "/stats", icon: ChartColumn },
  { label: "Settings", path: "/settings", icon: Settings },
];

const CAPTURE_PATHS = new Set(["/inbox", "/words", "/translations"]);

function isPathActive(pathname: string, targetPath: string): boolean {
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

function emitAppEvent(name: "lexi:capture" | "lexi:focus-search", path: string): void {
  window.dispatchEvent(new CustomEvent(name, { detail: { path } }));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);

  const navLookup = useMemo(() => NAV_ITEMS.map((item) => item.path), []);

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem("lexi:sidebar-collapsed") === "1");
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);

  useEffect(() => {
    getSettings().then((settings) => {
      setShortcutsEnabled(settings.shortcutsEnabled);
    });

    const onSettingsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ shortcutsEnabled?: boolean }>;
      if (typeof customEvent.detail?.shortcutsEnabled === "boolean") {
        setShortcutsEnabled(customEvent.detail.shortcutsEnabled);
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
        if (!CAPTURE_PATHS.has(location.pathname)) {
          return;
        }

        event.preventDefault();
        emitAppEvent("lexi:capture", location.pathname);
        return;
      }

      if (isMeta && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        navigate("/translations");
        setTimeout(() => emitAppEvent("lexi:capture", "/translations"), 0);
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
  }, [location.pathname, navLookup, navigate, shortcutsEnabled]);

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
              className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground lg:inline-flex"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu className="size-4" />
            </button>

            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <Menu className="size-4" />
            </button>

            <div className="lexi-brand">
              <Sparkles className="lexi-brand-mark size-5" />
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
            <span className="sync-pill">
              <span className="size-1.5 rounded-full bg-foreground/75" />
              Synced, just now
            </span>
            <p className="subtle-caption px-1">`Ctrl+K` search, `Ctrl+N` capture, `Alt+1..7` navigate</p>
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

            <nav className="lexi-tabs custom-scrollbar">
              {NAV_ITEMS.map((item) => {
                const active = isPathActive(location.pathname, item.path);

                return (
                  <Link
                    key={`top-${item.path}`}
                    to={item.path}
                    className={cn("lexi-tab", active && "is-active")}
                    title={`Alt+${NAV_ITEMS.indexOf(item) + 1}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                onClick={() => emitAppEvent("lexi:focus-search", location.pathname)}
                aria-label="Search"
                title="Ctrl+K"
              >
                <Search className="size-4" />
              </button>

              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/14 bg-white/10 px-3.5 text-sm font-semibold text-foreground transition hover:bg-white/16"
                onClick={() => emitAppEvent("lexi:capture", location.pathname)}
                title="Ctrl+N"
              >
                <Plus className="size-4" />
                Capture
              </button>
            </div>
          </header>

          <div className="lexi-main-body">{children}</div>
        </section>
      </div>
    </div>
  );
}
