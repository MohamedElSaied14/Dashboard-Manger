"use client";

import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import { cn } from "../../lib/cn";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../ui/Button";
import { isActivePath, MOBILE_NAV_ITEMS } from "./navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * The persistent application frame. Because it is rendered by the `(app)` route
 * group layout, React keeps this subtree mounted across navigations — only the
 * page slot below swaps out, which is what makes moving between sections feel
 * instant rather than re-rendering a monolithic screen.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (hasHydrated && !user) router.replace("/login");
  }, [hasHydrated, user, router]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMobileNavOpen(false), [pathname]);

  if (!hasHydrated || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-brand" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 hidden w-[var(--sidebar-w)] lg:block",
          collapsed && "lg:hidden",
        )}
      >
        <Sidebar onCollapse={() => setCollapsed(true)} />
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/50"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 start-0 w-[var(--sidebar-w)] animate-slide-up shadow-lg">
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute end-2 top-4 z-10"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </Button>
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className={cn("flex min-w-0 flex-1 flex-col", !collapsed && "lg:ms-[var(--sidebar-w)]")}>
        <Topbar
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onExpandSidebar={() => setCollapsed(false)}
          sidebarCollapsed={collapsed}
        />
        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>

      {/* Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur-md lg:hidden"
        aria-label="Quick navigation"
      >
        {MOBILE_NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              prefetch
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-2xs font-medium transition-colors",
                active ? "text-brand" : "text-muted",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
