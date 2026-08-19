"use client";

import { Languages, Lock, Mail, Moon, Sun, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "../../components/ThemeProvider";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { useAuthStore } from "../../store/authStore";
import { apiRequest } from "../../utils/api";
import { cn } from "../../lib/cn";

const COPY = {
  en: {
    brandLead: "Run every client account from one workspace",
    brandBody:
      "Briefs, tasks, brand assets and AI design review — together, in English and Arabic.",
    title: "Welcome back",
    subtitle: "Sign in to your AccountFlow workspace",
    registerTitle: "Create your account",
    registerSubtitle: "Set up access to the workspace",
    loginTab: "Sign in",
    registerTab: "Create account",
    email: "Email address",
    password: "Password",
    name: "Full name",
    nameAr: "Arabic name",
    optional: "optional",
    submitLogin: "Sign in",
    submitRegister: "Create account",
    switchToLogin: "Already have an account? Sign in",
    switchToRegister: "Need an account? Create one",
    genericError: "Something went wrong. Please try again.",
  },
  ar: {
    brandLead: "أدر كل حسابات عملائك من مكان واحد",
    brandBody: "البريفات والمهام وأصول الهوية ومراجعة التصميم بالذكاء الاصطناعي — بالعربية والإنجليزية.",
    title: "أهلًا بعودتك",
    subtitle: "سجّل الدخول إلى مساحة عمل AccountFlow",
    registerTitle: "أنشئ حسابك",
    registerSubtitle: "اضبط صلاحية الدخول لمساحة العمل",
    loginTab: "تسجيل الدخول",
    registerTab: "إنشاء حساب",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    name: "الاسم الكامل",
    nameAr: "الاسم بالعربية",
    optional: "اختياري",
    submitLogin: "دخول",
    submitRegister: "إنشاء الحساب",
    switchToLogin: "لديك حساب بالفعل؟ سجّل الدخول",
    switchToRegister: "لا تملك حسابًا؟ أنشئ واحدًا",
    genericError: "حدث خطأ ما. برجاء المحاولة مرة أخرى.",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const lang = useAuthStore((state) => state.lang);
  const setLang = useAuthStore((state) => state.setLang);

  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ email: "", password: "", name: "", nameAr: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const t = COPY[lang] ?? COPY.en;
  const isRtl = lang === "ar";

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = isLogin
        ? { email: form.email, password: form.password }
        : { email: form.email, password: form.password, name: form.name, nameAr: form.nameAr };
      const response = await apiRequest<{ user: never; accessToken: string }>(
        isLogin ? "/auth/login" : "/auth/register",
        { method: "POST", body: JSON.stringify(body) },
      );
      setAuth(response.user, response.accessToken);
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message || t.genericError);
    } finally {
      setLoading(false);
    }
  };

  const switchLanguage = () => {
    const next = lang === "en" ? "ar" : "en";
    setLang(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-2" dir={isRtl ? "rtl" : "ltr"}>
      {/* Brand panel — hidden on small screens where it would just push the form down. */}
      <aside className="surface-brand relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,.25), transparent 40%)",
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/20 text-sm">AF</span>
          AccountFlow
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">{t.brandLead}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">{t.brandBody}</p>
        </div>
        <p className="relative text-2xs text-white/60">© {new Date().getFullYear()} AccountFlow</p>
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-6 flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-sm" onClick={switchLanguage} aria-label="Toggle language">
              <Languages className="h-[18px] w-[18px]" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </Button>
          </div>

          <h1 className="text-2xl font-bold tracking-tight">
            {isLogin ? t.title : t.registerTitle}
          </h1>
          <p className="mt-1.5 text-sm text-muted">{isLogin ? t.subtitle : t.registerSubtitle}</p>

          <div className="mt-6 flex rounded-lg border border-border p-1" role="tablist">
            {[true, false].map((loginTab) => (
              <button
                key={String(loginTab)}
                role="tab"
                aria-selected={isLogin === loginTab}
                onClick={() => {
                  setIsLogin(loginTab);
                  setError("");
                }}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                  isLogin === loginTab ? "bg-brand text-white" : "text-muted hover:text-ink",
                )}
              >
                {loginTab ? t.loginTab : t.registerTab}
              </button>
            ))}
          </div>

          <form className="mt-5 grid gap-4" onSubmit={submit}>
            {!isLogin && (
              <>
                <Field label={t.name} required>
                  {(props) => (
                    <div className="relative">
                      <User className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
                      <Input {...props} required className="ps-9" value={form.name} onChange={set("name")} />
                    </div>
                  )}
                </Field>
                <Field label={t.nameAr} hint={t.optional}>
                  {(props) => (
                    <Input {...props} dir="rtl" value={form.nameAr} onChange={set("nameAr")} />
                  )}
                </Field>
              </>
            )}

            <Field label={t.email} required>
              {(props) => (
                <div className="relative">
                  <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
                  <Input
                    {...props}
                    required
                    type="email"
                    autoComplete="email"
                    className="ps-9"
                    value={form.email}
                    onChange={set("email")}
                  />
                </div>
              )}
            </Field>

            <Field label={t.password} required>
              {(props) => (
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
                  <Input
                    {...props}
                    required
                    type="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    className="ps-9"
                    value={form.password}
                    onChange={set("password")}
                  />
                </div>
              )}
            </Field>

            {error && (
              <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger-ink">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full">
              {isLogin ? t.submitLogin : t.submitRegister}
            </Button>
          </form>

          <button
            onClick={() => {
              setIsLogin((current) => !current);
              setError("");
            }}
            className="mt-5 w-full text-center text-xs font-semibold text-brand hover:underline"
          >
            {isLogin ? t.switchToRegister : t.switchToLogin}
          </button>
        </div>
      </main>
    </div>
  );
}
