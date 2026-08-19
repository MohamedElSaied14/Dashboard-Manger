"use client";

import { useCallback, useMemo } from "react";
import { useAuthStore } from "../store/authStore";
import { dictionaries, type Dictionary } from "./dictionary";

/**
 * Translation hook. `t("key")` returns the string for the active language, and
 * `t("key", { n: 5 })` substitutes `{n}` placeholders.
 */
export function useI18n() {
  const lang = useAuthStore((state) => state.lang);
  const dict = dictionaries[lang] ?? dictionaries.en;

  const t = useCallback(
    (key: keyof Dictionary, vars?: Record<string, string | number>) => {
      const value = dict[key] ?? dictionaries.en[key] ?? String(key);
      if (!vars) return value;
      return Object.entries(vars).reduce(
        (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
        value,
      );
    },
    [dict],
  );

  return useMemo(() => ({ t, lang, isRtl: lang === "ar" }), [t, lang]);
}

/** Picks the Arabic name when the UI is Arabic and one exists. */
export function localName(
  record: { name?: string; nameAr?: string } | null | undefined,
  lang: string,
) {
  if (!record) return "";
  return lang === "ar" && record.nameAr ? record.nameAr : (record.name ?? "");
}
