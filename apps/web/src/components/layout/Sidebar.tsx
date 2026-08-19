"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Inbox, LogOut, PanelLeftClose } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "../../i18n/useI18n";
import { cn } from "../../lib/cn";
import { queryKeys } from "../../lib/queryKeys";
import { asArray } from "../../lib/types";
import { useAuthStore } from "../../store/authStore";
import { apiRequest } from "../../utils/api";
import { Button } from "../ui/Button";
import { isActivePath, NAV_ITEMS } from "./navigation";

/**
 * Rendered once by the route-group layout, so it survives every in-app
 * navigation instead of being re-mounted per page.
 */
export function Sidebar({ onCollapse, onNavigate }: { onCollapse?: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();

  const canApprove = user?.role === "admin" || user?.role === "manager";

  /**
   * Warm the data a route needs while the pointer is still travelling towards
   * it. Next already prefetches the JS chunk; this removes the request waterfall
   * that would otherwise start only after the new page mounts.
   */
  const prefetch = (href: string) => {
    if (href === "/clients" || href === "/dashboard" || href === "/files" || href === "/activity") {
      queryClient.prefetchQuery({
        queryKey: queryKeys.clients(""),
        queryFn: () => apiRequest("/clients?search="),
        staleTime: 30_000,
      });
    }
    if (href === "/tasks" || href === "/dashboard" || href === "/calendar") {
      queryClient.prefetchQuery({
        queryKey: queryKeys.tasks(),
        queryFn: () => apiRequest("/tasks"),
        staleTime: 30_000,
      });
    }
    if (href === "/team" && canApprove) {
      queryClient.prefetchQuery({
        queryKey: queryKeys.users(),
        queryFn: () => apiRequest("/users"),
        staleTime: 30_000,
      });
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" }, false);
    } finally {
      queryClient.clear();
      logout();
    }
  };

  return (
    <div className="flex h-full flex-col border-e border-border bg-surface">
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-xs text-white">
            AF
          </span>
          AccountFlow
        </Link>
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCollapse}
            aria-label={t("toggleSidebar")}
            className="hidden lg:inline-flex"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      <nav className="scroll-area flex-1 px-3 py-2" aria-label="Main">
        <ul className="grid gap-0.5">
          {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  prefetch
                  onMouseEnter={() => prefetch(href)}
                  onFocus={() => prefetch(href)}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                    active
                      ? "bg-brand text-white shadow-sm"
                      : "text-muted hover:bg-surface-sunken hover:text-ink",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  <span className="truncate">{t(labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {canApprove && (
          <Link
            href="/approvals"
            prefetch
            onClick={onNavigate}
            className={cn(
              "mt-3 flex items-center gap-3 rounded-md border border-dashed border-brand/40 px-3 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft",
              isActivePath(pathname, "/approvals") && "bg-brand-soft",
            )}
          >
            <Inbox className="h-[18px] w-[18px]" aria-hidden />
            <span className="truncate">{t("approvals")}</span>
          </Link>
        )}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-md bg-surface-sunken px-3 py-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand text-2xs font-bold text-white">
            {(user?.name ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{user?.name}</p>
            <p className="truncate text-2xs uppercase text-faint">{user?.role}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-danger hover:bg-danger-soft hover:text-danger-ink">
          <LogOut className="h-4 w-4" />
          {t("logout")}
        </Button>
      </div>
    </div>
  );
}
