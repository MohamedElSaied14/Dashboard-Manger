"use client";

import { Languages, Menu, Moon, PanelLeftOpen, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "../ThemeProvider";
import { useI18n } from "../../i18n/useI18n";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../ui/Button";
import { useSearchStore } from "../../store/searchStore";

/**
 * Sticky application header. The search box writes to a small global store so
 * the Clients page can react to it without the shell re-rendering the page tree.
 */
export function Topbar({
  onOpenMobileNav,
  onExpandSidebar,
  sidebarCollapsed,
}: {
  onOpenMobileNav: () => void;
  onExpandSidebar: () => void;
  sidebarCollapsed: boolean;
}) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const { theme, toggle } = useTheme();
  const setLang = useAuthStore((state) => state.setLang);
  const query = useSearchStore((state) => state.query);
  const setQuery = useSearchStore((state) => state.setQuery);
  const [draft, setDraft] = useState(query);

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(draft), 250);
    return () => window.clearTimeout(id);
  }, [draft, setQuery]);

  const switchLanguage = () => {
    const next = lang === "en" ? "ar" : "en";
    setLang(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface/85 px-4 backdrop-blur-md">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label={t("toggleSidebar")}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {sidebarCollapsed && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden lg:inline-flex"
          onClick={onExpandSidebar}
          aria-label={t("toggleSidebar")}
        >
          <PanelLeftOpen className="h-5 w-5" />
        </Button>
      )}

      <form
        role="search"
        className="relative min-w-0 flex-1 sm:max-w-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draft);
          router.push("/clients");
        }}
      >
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
          aria-hidden
        />
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="h-9 w-full rounded-md border border-border bg-surface-sunken ps-9 pe-3 text-sm placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
      </form>

      <div className="ms-auto flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={switchLanguage} aria-label={t("toggleLanguage")}>
          <Languages className="h-[18px] w-[18px]" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={t("toggleTheme")}>
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </Button>
      </div>
    </header>
  );
}
