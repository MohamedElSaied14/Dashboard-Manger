import type { Config } from "tailwindcss";

/**
 * Every colour is a CSS variable holding an "R G B" triplet, so the same utility
 * class resolves differently in light and dark mode and still supports the
 * `/opacity` modifier (e.g. `bg-surface/60`). Themes live in globals.css.
 */
const themed = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: themed("canvas"),
        surface: themed("surface"),
        "surface-raised": themed("surface-raised"),
        "surface-sunken": themed("surface-sunken"),
        border: themed("border"),
        "border-strong": themed("border-strong"),
        ink: themed("ink"),
        muted: themed("muted"),
        faint: themed("faint"),
        brand: {
          DEFAULT: themed("brand"),
          soft: themed("brand-soft"),
          strong: themed("brand-strong"),
          ink: themed("brand-ink"),
        },
        accent: { DEFAULT: themed("accent"), soft: themed("accent-soft"), ink: themed("accent-ink") },
        success: { DEFAULT: themed("success"), soft: themed("success-soft"), ink: themed("success-ink") },
        warning: { DEFAULT: themed("warning"), soft: themed("warning-soft"), ink: themed("warning-ink") },
        danger: { DEFAULT: themed("danger"), soft: themed("danger-soft"), ink: themed("danger-ink") },
      },
      borderRadius: {
        xs: "6px",
        sm: "8px",
        md: "10px",
        lg: "14px",
        xl: "18px",
        "2xl": "24px",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        focus: "0 0 0 3px rgb(var(--brand) / 0.35)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in .18s ease both",
        "slide-up": "slide-up .22s cubic-bezier(.2,.9,.3,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
