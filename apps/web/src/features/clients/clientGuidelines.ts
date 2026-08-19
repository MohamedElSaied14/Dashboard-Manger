/** Helpers for turning stored design guidelines into readable profile copy. */

/** Guidelines store colours as hex strings or `{ hex }` objects, inconsistently. */
export function extractApprovedHexColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "hex" in entry) {
        return String((entry as { hex: unknown }).hex ?? "");
      }
      return "";
    })
    .filter((hex) => /^#?[0-9a-f]{3,8}$/i.test(hex))
    .map((hex) => (hex.startsWith("#") ? hex : `#${hex}`));
}

interface Guidelines {
  orientation?: string;
  dimensions?: { width?: number; height?: number; aspectRatio?: string };
  colorRules?: { mode?: string; allowedColors?: unknown[] };
  typography?: { allowedFonts?: unknown[] };
  header?: { logoPosition?: string; logoRepeatedAllowed?: boolean };
  footer?: { phone?: string; socialHandle?: string };
  notes?: string[];
}

/**
 * Renders a short human summary of the structured guidelines, used as a
 * fallback when the client's free-text brief hasn't been filled in yet.
 */
export function summariseGuidelines(guidelines: Guidelines | null | undefined, isRtl: boolean) {
  if (!guidelines) return null;
  const lines: string[] = [];
  const label = (en: string, ar: string) => (isRtl ? ar : en);

  const { width, height, aspectRatio } = guidelines.dimensions ?? {};
  lines.push(
    `${label("Orientation", "الاتجاه")}: ${guidelines.orientation ?? "-"}${
      width && height ? ` · ${width}×${height}px (${aspectRatio ?? "-"})` : ""
    }`,
  );

  const colors = extractApprovedHexColors(guidelines.colorRules?.allowedColors);
  lines.push(
    `${label("Colors", "الألوان")}: ${guidelines.colorRules?.mode ?? "-"}${
      colors.length ? ` (${colors.join(", ")})` : ""
    }`,
  );

  if (guidelines.header?.logoPosition) {
    lines.push(
      `${label("Logo", "اللوجو")}: ${guidelines.header.logoPosition}${
        guidelines.header.logoRepeatedAllowed === false ? label(" (once only)", " (مرة واحدة فقط)") : ""
      }`,
    );
  }

  const footer = [guidelines.footer?.phone, guidelines.footer?.socialHandle].filter(Boolean);
  if (footer.length) lines.push(`${label("Footer", "الفوتر")}: ${footer.join(" · ")}`);

  if (guidelines.notes?.length) {
    lines.push(`${label("Notes", "ملاحظات")}: ${guidelines.notes.join(" · ")}`);
  }

  return lines.join("\n");
}

export function guidelineFonts(guidelines: Guidelines | null | undefined): string[] {
  const fonts = guidelines?.typography?.allowedFonts;
  return Array.isArray(fonts) ? fonts.filter((font): font is string => typeof font === "string") : [];
}
