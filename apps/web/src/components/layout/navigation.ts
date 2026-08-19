import {
  Activity,
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare,
  FileText,
  LayoutDashboard,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "../../i18n/dictionary";

export interface NavItem {
  href: string;
  labelKey: keyof Dictionary;
  icon: LucideIcon;
  /** Roles allowed to see the entry; omitted means everyone. */
  roles?: string[];
}

/**
 * Single source of truth for the sidebar, the mobile bar and route prefetching.
 * Adding a section is one entry here plus one `page.tsx`.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "overview", icon: LayoutDashboard },
  { href: "/clients", labelKey: "clients", icon: BriefcaseBusiness },
  { href: "/tasks", labelKey: "tasks", icon: CheckSquare },
  { href: "/calendar", labelKey: "calendar", icon: CalendarDays },
  { href: "/team", labelKey: "team", icon: UsersRound },
  { href: "/files", labelKey: "files", icon: FileText },
  { href: "/activity", labelKey: "activity", icon: Activity },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

/** The four most-used destinations, surfaced in the mobile bottom bar. */
export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) =>
  ["/dashboard", "/clients", "/tasks", "/calendar"].includes(item.href),
);

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
