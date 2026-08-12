import * as lucideIconMap from "lucide-react";
import { Folder } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const EXCLUDED_ICON_NAMES = new Set([
  "createLucideIcon",
  "Icon",
  "icons",
  "LucideAArrowDown",
  "LucideAArrowUp",
]);

const FALLBACK_ICON_NAMES = [
  "Folder",
  "BookOpen",
  "Bookmark",
  "Brain",
  "Briefcase",
  "Building2",
  "Calendar",
  "CheckSquare",
  "CircleHelp",
  "ClipboardList",
  "Code2",
  "Compass",
  "FileText",
  "Flag",
  "FlaskConical",
  "Gamepad2",
  "Gem",
  "Globe",
  "GraduationCap",
  "Heart",
  "Home",
  "Image",
  "Inbox",
  "Landmark",
  "Layers3",
  "Leaf",
  "Lightbulb",
  "ListTodo",
  "MapPinned",
  "Medal",
  "Megaphone",
  "Music",
  "NotebookPen",
  "Palette",
  "PencilLine",
  "Plane",
  "Rocket",
  "Shield",
  "ShoppingBag",
  "Sparkles",
  "Star",
  "Target",
  "Tent",
  "Timer",
  "Train",
  "Trophy",
  "UtensilsCrossed",
  "Wallet",
  "Wrench",
];

const lucideIconsByName = lucideIconMap as unknown as Record<string, unknown>;

const isIconComponent = (value: unknown): value is LucideIcon =>
  typeof value === "function" || (typeof value === "object" && value !== null && "$$typeof" in value);

const iconEntries = Object.entries(lucideIconsByName)
  .filter(([name, value]) => {
    if (EXCLUDED_ICON_NAMES.has(name)) {
      return false;
    }

    return isIconComponent(value) && /^[A-Z]/.test(name);
  })
  .sort(([a], [b]) => a.localeCompare(b));

const fallbackEntries = FALLBACK_ICON_NAMES
  .map((name) => [name, lucideIconsByName[name]] as const)
  .filter((entry): entry is readonly [string, LucideIcon] => isIconComponent(entry[1]));

const resolvedEntries = iconEntries.length > 0 ? (iconEntries as [string, LucideIcon][]) : fallbackEntries;

const GROUP_ICON_MAP = new Map<string, LucideIcon>(
  resolvedEntries.map(([name, icon]) => [name, icon]),
);

export const GROUP_ICON_NAMES = resolvedEntries.map(([name]) => name);
export const GROUP_ICON_SOURCE: "dynamic" | "fallback" = iconEntries.length > 0 ? "dynamic" : "fallback";
export const GROUP_ICON_LOAD_ERROR =
  iconEntries.length > 0 ? null : "Icons could not be loaded from lucide-react. Showing fallback icons.";

export function getGroupIcon(iconName?: string): LucideIcon {
  if (!iconName) {
    return Folder as LucideIcon;
  }

  const direct = GROUP_ICON_MAP.get(iconName);
  if (direct) {
    return direct;
  }

  const compact = iconName.replace(/\s+/g, "");
  const compactMatch = GROUP_ICON_MAP.get(compact);
  if (compactMatch) {
    return compactMatch;
  }

  const lowercase = iconName.toLowerCase();
  const compactLowercase = compact.toLowerCase();
  const caseInsensitiveMatch = GROUP_ICON_NAMES.find(
    (name) => name.toLowerCase() === lowercase || name.toLowerCase() === compactLowercase,
  );
  if (caseInsensitiveMatch) {
    return GROUP_ICON_MAP.get(caseInsensitiveMatch) ?? (Folder as LucideIcon);
  }

  return Folder as LucideIcon;
}

export function iconLabelFromName(iconName: string): string {
  return iconName.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}
