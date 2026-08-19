"use client";

import { ExternalLink, FileText, FolderOpen, ImageIcon } from "lucide-react";
import { Avatar } from "../../../components/ui/Avatar";
import { Card, CardBody } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { EmptyState, SkeletonCards } from "../../../components/ui/State";
import { useClients } from "../../../features/clients/hooks";
import { localName, useI18n } from "../../../i18n/useI18n";

export default function FilesPage() {
  const { t, lang } = useI18n();
  const { data: clients = [], isLoading } = useClients();

  const withAssets = clients.filter((client) => client.driveLink || client.logoUrl);

  return (
    <>
      <PageHeader title={t("filesTitle")} description={t("filesSubtitle")} />

      {isLoading ? (
        <SkeletonCards count={3} />
      ) : withAssets.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title={t("noFiles")}
          description={t("noFilesHint")}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {withAssets.map((client) => (
            <li key={client._id}>
              <Card className="h-full">
                <CardBody className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={client.name} src={client.logoUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{localName(client, lang)}</p>
                      <p className="truncate text-2xs text-muted">{client.industry}</p>
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    {client.driveLink && (
                      <a
                        href={client.driveLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
                      >
                        <FolderOpen className="h-4 w-4" aria-hidden />
                        {t("openDriveFolder")}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                    {client.logoUrl && (
                      <a
                        href={client.logoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-success hover:underline"
                      >
                        <ImageIcon className="h-4 w-4" aria-hidden />
                        {t("viewLogo")}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
