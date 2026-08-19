"use client";

import {
  ChevronLeft,
  ExternalLink,
  FolderOpen,
  Palette,
  Sparkles,
  Type as TypeIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar } from "../../../../components/ui/Avatar";
import { Badge, statusTone } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardBody, CardTitle } from "../../../../components/ui/Card";
import { ProgressBar } from "../../../../components/ui/PageHeader";
import { EmptyState, Skeleton } from "../../../../components/ui/State";
import { ClientEditForm } from "../../../../features/clients/ClientEditForm";
import {
  extractApprovedHexColors,
  guidelineFonts,
  summariseGuidelines,
} from "../../../../features/clients/clientGuidelines";
import { useClient, useDesignSummary } from "../../../../features/clients/hooks";
import { useTeam } from "../../../../features/team/hooks";
// Only pulled over the wire when the user actually opens the references tab.
const KnowledgeBaseTab = dynamic(
  () => import("../../../../features/knowledge/KnowledgeBaseTab"),
  { ssr: false },
);
const DesignReferencesTab = dynamic(
  () => import("../../../../features/design-review/DesignReferencesTab"),
  { loading: () => <Skeleton className="h-64 w-full" /> },
);
import { localName, useI18n } from "../../../../i18n/useI18n";
import { cn } from "../../../../lib/cn";

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, lang, isRtl } = useI18n();

  const clientId = params.id;
  const { data: client, isLoading } = useClient(clientId);
  const { data: users = [] } = useTeam();
  const { guidelines, designs } = useDesignSummary(clientId);

  // `?edit=1` is set right after creation so the user lands straight in the form.
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [tab, setTab] = useState<"profile" | "references" | "knowledge">("profile");

  const briefFallback = useMemo(() => summariseGuidelines(guidelines, isRtl), [guidelines, isRtl]);
  const fonts = guidelineFonts(guidelines);
  const colors = extractApprovedHexColors(
    (guidelines as { colorRules?: { allowedColors?: unknown[] } } | null)?.colorRules?.allowedColors,
  );
  const latestReview = designs.find(
    (design) => design.status !== "uploaded" && design.status !== "analyzing",
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <EmptyState
        title={t("clientNotFound")}
        description={t("clientNotFoundHint")}
        action={
          <Button onClick={() => router.push("/clients")}>{t("backToClients")}</Button>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/clients")}>
          <ChevronLeft className={cn("h-4 w-4", isRtl && "rotate-180")} aria-hidden />
          {t("backToClients")}
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/clients/${client._id}/design-review`)}
          >
            <Sparkles className="h-4 w-4" />
            {t("designReview")}
          </Button>
          {!editing && (
            <Button size="sm" onClick={() => setEditing(true)}>
              {t("editProfile")}
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-4">
          <Avatar name={client.name} src={client.logoUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-tight">{localName(client, lang)}</h1>
            <p className="mt-0.5 truncate text-xs text-muted">
              {[client.industry, client.city, client.country].filter(Boolean).join(" · ")}
            </p>
            <Badge tone={statusTone[client.status] ?? "neutral"} className="mt-2">
              {t(client.status)}
            </Badge>
          </div>
          <div className="w-full max-w-[200px]">
            <div className="flex items-center justify-between text-2xs text-muted">
              <span>{t("completion")}</span>
              <span className="font-semibold tabular-nums text-brand">{client.completion}%</span>
            </div>
            <ProgressBar value={client.completion} className="mt-1.5" />
          </div>
        </CardBody>
      </Card>

      {editing ? (
        <ClientEditForm
          client={client}
          users={users}
          briefFallback={briefFallback}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <div
            className="mb-4 flex gap-1 border-b border-border"
            role="tablist"
            aria-label={t("clientProfile")}
          >
            {(["profile", "references", "knowledge"] as const).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                  tab === key
                    ? "border-brand text-brand"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                {key === "profile"
                  ? t("clientProfile")
                  : key === "references"
                    ? t("designReferences")
                    : t("knowledgeBase")}
              </button>
            ))}
          </div>

          {tab === "knowledge" ? (
            <KnowledgeBaseTab clientId={client._id} />
          ) : tab === "references" ? (
            <DesignReferencesTab clientId={client._id} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="grid content-start gap-4">
                <Card>
                  <CardBody>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-brand" aria-hidden />
                      {t("brandBriefs")}
                    </CardTitle>
                    <div className="mt-3 whitespace-pre-line rounded-lg border-s-[3px] border-brand bg-surface-sunken p-4 text-sm leading-relaxed text-ink/90">
                      {client.briefs || briefFallback || t("noDescription")}
                    </div>
                    {!client.briefs && briefFallback && (
                      <p className="mt-2 text-2xs text-faint">{t("fromGuidelines")}</p>
                    )}

                    {colors.length > 0 && (
                      <div className="mt-4">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                          <Palette className="h-3.5 w-3.5" aria-hidden />
                          {t("approvedColors")}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {colors.map((hex) => (
                            <span
                              key={hex}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pe-2.5 ps-1"
                            >
                              <span
                                className="h-4 w-4 rounded-full border border-border"
                                style={{ background: hex }}
                                aria-hidden
                              />
                              <span className="font-mono text-2xs uppercase text-muted">{hex}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardBody>
                    <CardTitle className="flex items-center gap-2">
                      <TypeIcon className="h-4 w-4 text-brand" aria-hidden />
                      {t("fontsPreference")}
                    </CardTitle>
                    {client.fonts || fonts.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(client.fonts ? client.fonts.split(/[,،]/) : fonts).map((font) => (
                          <Badge key={font} tone="brand" className="normal-case">
                            {font.trim()}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted">{t("noDescription")}</p>
                    )}
                  </CardBody>
                </Card>
              </div>

              <div className="grid content-start gap-4">
                <Card>
                  <CardBody>
                    <CardTitle>{t("designReview")}</CardTitle>
                    <dl className="mt-3 grid gap-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted">{t("status")}</dt>
                        <dd>
                          <Badge tone={guidelines ? "success" : "warning"}>
                            {guidelines ? t("guidelinesSet") : t("guidelinesMissing")}
                          </Badge>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted">{t("designsUploaded")}</dt>
                        <dd className="font-semibold tabular-nums">{designs.length}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted">{t("lastReview")}</dt>
                        <dd>
                          {latestReview ? (
                            <Badge tone={statusTone[latestReview.status] ?? "neutral"}>
                              {latestReview.status.replace(/_/g, " ")}
                            </Badge>
                          ) : (
                            <span className="text-faint">{t("noDesignsYet")}</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-4 w-full"
                      onClick={() => router.push(`/clients/${client._id}/design-review`)}
                    >
                      {t("openDesignReview")}
                    </Button>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody className="grid gap-3 text-xs">
                    <div>
                      <p className="text-muted">{t("accountManager")}</p>
                      <p className="mt-0.5 font-semibold">
                        {typeof client.accountManager === "object" && client.accountManager
                          ? client.accountManager.name
                          : t("unassigned")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">{t("lastProject")}</p>
                      <p className="mt-0.5 font-semibold">{client.lastProjectFinished || "—"}</p>
                    </div>
                    {client.driveLink && (
                      <Link
                        href={client.driveLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline"
                      >
                        <FolderOpen className="h-4 w-4" aria-hidden />
                        {t("openDriveFolder")}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </Link>
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
