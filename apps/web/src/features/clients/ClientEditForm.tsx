"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card, CardBody } from "../../components/ui/Card";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { useToast } from "../../components/ui/Toast";
import { useI18n } from "../../i18n/useI18n";
import type { Client, ClientStatus, User } from "../../lib/types";
import { apiRequest } from "../../utils/api";
import { useUpdateClient } from "./hooks";

const STATUSES: ClientStatus[] = [
  "lead",
  "onboarding",
  "active",
  "holding",
  "completed",
  "not_active",
  "archived",
];

export function ClientEditForm({
  client,
  users,
  briefFallback,
  onDone,
}: {
  client: Client;
  users: User[];
  briefFallback: string | null;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const updateClient = useUpdateClient(client._id);

  const [form, setForm] = useState({
    name: client.name ?? "",
    nameAr: client.nameAr ?? "",
    industry: client.industry ?? "",
    city: client.city ?? "",
    country: client.country ?? "",
    status: client.status ?? "lead",
    driveLink: client.driveLink ?? "",
    fonts: client.fonts ?? "",
    briefs: client.briefs || briefFallback || "",
    lastProjectFinished: client.lastProjectFinished ?? "",
    accountManager:
      (typeof client.accountManager === "object" ? client.accountManager?._id : client.accountManager) ?? "",
    logoUrl: client.logoUrl ?? "",
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [briefText, setBriefText] = useState("");
  const [briefFile, setBriefFile] = useState<File | null>(null);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const extractBrief = useMutation({
    mutationFn: async () => {
      if (!briefText.trim() && !briefFile) {
        throw new Error(t("briefTextPlaceholder"));
      }
      const body = new FormData();
      if (briefText.trim()) body.append("text", briefText.trim());
      if (briefFile) body.append("file", briefFile);
      return apiRequest<{ briefText?: string }>(`/clients/${client._id}/extract-brief`, {
        method: "POST",
        body,
      });
    },
    onSuccess: (result) => {
      if (!result?.briefText) return;
      setForm((current) => ({
        ...current,
        briefs: current.briefs.trim() ? `${current.briefs}\n\n${result.briefText}` : result.briefText!,
      }));
      setBriefText("");
      setBriefFile(null);
      toast(t("generateBriefBtn"), "success");
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const uploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("assetType", "client_logo");
    body.append("ownerId", client._id);

    setUploadingLogo(true);
    try {
      const response = await apiRequest<{ url: string }>("/upload", { method: "POST", body });
      setForm((current) => ({ ...current, logoUrl: response.url }));
      toast(t("uploadLogo"), "success");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    updateClient.mutate(
      // Blank optional fields are sent as undefined so the API keeps its own defaults.
      Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value === "" ? undefined : value]),
      ) as Partial<Client>,
      { onSuccess: onDone },
    );
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <CardBody className="grid gap-5 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <Field label={t("clientName")} required>
              {(props) => <Input {...props} required value={form.name} onChange={set("name")} />}
            </Field>
            <Field label={t("clientNameAr")}>
              {(props) => <Input {...props} dir="rtl" value={form.nameAr} onChange={set("nameAr")} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("industry")} required>
                {(props) => <Input {...props} required value={form.industry} onChange={set("industry")} />}
              </Field>
              <Field label={t("status")}>
                {(props) => (
                  <Select {...props} value={form.status} onChange={set("status")}>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(status)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("city")}>
                {(props) => <Input {...props} value={form.city} onChange={set("city")} />}
              </Field>
              <Field label={t("country")}>
                {(props) => <Input {...props} value={form.country} onChange={set("country")} />}
              </Field>
            </div>
            <Field label={t("accountManager")}>
              {(props) => (
                <Select {...props} value={form.accountManager} onChange={set("accountManager")}>
                  <option value="">— {t("unassigned")} —</option>
                  {users.map((user) => (
                    <option key={user._id} value={user._id}>
                      {user.name} ({user.role})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("driveLink")}>
              {(props) => (
                <Input {...props} type="url" value={form.driveLink} onChange={set("driveLink")} />
              )}
            </Field>
          </div>

          <div className="grid content-start gap-4">
            <Field label={t("fontsPreference")}>
              {(props) => <Input {...props} value={form.fonts} onChange={set("fonts")} />}
            </Field>
            <Field label={t("lastProject")}>
              {(props) => (
                <Input
                  {...props}
                  value={form.lastProjectFinished}
                  onChange={set("lastProjectFinished")}
                />
              )}
            </Field>
            <Field label={t("brandBriefs")}>
              {(props) => (
                <Textarea {...props} rows={5} value={form.briefs} onChange={set("briefs")} />
              )}
            </Field>

            <div className="rounded-lg border border-brand/25 bg-brand-soft/50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-brand-ink">
                <Sparkles className="h-4 w-4" aria-hidden />
                {t("aiBriefExtractor")}
              </p>
              <p className="mt-1.5 text-2xs leading-relaxed text-muted">{t("aiBriefExtractorDesc")}</p>
              <Textarea
                className="mt-3 min-h-[72px] text-xs"
                placeholder={t("briefTextPlaceholder")}
                value={briefText}
                onChange={(event) => setBriefText(event.target.value)}
                aria-label={t("aiBriefExtractor")}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-brand/50 bg-surface px-3 py-1.5 text-2xs font-semibold text-brand">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  {briefFile ? briefFile.name : t("attachPdf")}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    onChange={(event) => setBriefFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                {briefFile && (
                  <button
                    type="button"
                    onClick={() => setBriefFile(null)}
                    className="text-2xs font-semibold text-danger"
                  >
                    {t("removeFile")}
                  </button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="ms-auto"
                  loading={extractBrief.isPending}
                  disabled={!briefText.trim() && !briefFile}
                  onClick={() => extractBrief.mutate()}
                >
                  {!extractBrief.isPending && <Sparkles className="h-3.5 w-3.5" />}
                  {extractBrief.isPending ? t("extractingBrief") : t("generateBriefBtn")}
                </Button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-semibold text-muted">{t("uploadLogo")}</span>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-brand/50 px-3 py-2 text-xs font-semibold text-brand">
                  {uploadingLogo ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden />
                  )}
                  {t("uploadLogo")}
                  <input type="file" accept="image/*" className="sr-only" onChange={uploadLogo} />
                </label>
                {form.logoUrl && <CheckCircle2 className="h-4.5 w-4.5 text-success" aria-hidden />}
              </div>
            </div>
          </div>
        </CardBody>

        <div className="flex justify-end gap-2 border-t border-border bg-surface-sunken/60 p-4">
          <Button type="button" variant="secondary" onClick={onDone}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={updateClient.isPending}>
            {t("saveProfile")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
