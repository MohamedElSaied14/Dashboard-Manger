"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody, CardTitle } from "../../../components/ui/Card";
import { Field, Input } from "../../../components/ui/Field";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useTheme } from "../../../components/ThemeProvider";
import { useI18n } from "../../../i18n/useI18n";
import { cn } from "../../../lib/cn";
import { useAuthStore } from "../../../store/authStore";

export default function SettingsPage() {
  const { t, lang } = useI18n();
  const { theme, toggle } = useTheme();
  const user = useAuthStore((state) => state.user);
  const setLang = useAuthStore((state) => state.setLang);

  const switchLanguage = () => {
    const next = lang === "en" ? "ar" : "en";
    setLang(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };

  return (
    <>
      <PageHeader title={t("settingsTitle")} description={t("settingsSubtitle")} />

      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardBody className="grid gap-4">
            <CardTitle>{t("settingsTitle")}</CardTitle>
            <Field label={t("activeEmail")}>
              {(props) => <Input {...props} disabled value={user?.email ?? ""} />}
            </Field>
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold text-muted">{t("authorizedRole")}</span>
              <div>
                <Badge tone="brand">{user?.role}</Badge>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-4">
            <div>
              <CardTitle>{t("appearance")}</CardTitle>
              <p className="mt-1 text-xs text-muted">{t("appearanceHint")}</p>
            </div>
            <div className="flex gap-2">
              {(
                [
                  { key: "light", icon: Sun, label: t("lightMode") },
                  { key: "dark", icon: Moon, label: t("darkMode") },
                ] as const
              ).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    if (theme !== key) toggle();
                  }}
                  aria-pressed={theme === key}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 text-sm font-semibold transition-colors",
                    theme === key
                      ? "border-brand bg-brand-soft text-brand-ink"
                      : "border-border text-muted hover:border-border-strong",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{t("language")}</CardTitle>
              <p className="mt-1 text-xs text-muted">
                {lang === "en" ? "English (LTR)" : "العربية (RTL)"}
              </p>
            </div>
            <Button variant="secondary" onClick={switchLanguage}>
              <Monitor className="h-4 w-4" />
              {lang === "en" ? t("switchToArabic") : t("switchToEnglish")}
            </Button>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
