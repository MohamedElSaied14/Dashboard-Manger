"use client";

import { Activity as ActivityIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Badge, statusTone } from "../../../components/ui/Badge";
import { Card, CardBody } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { EmptyState, Skeleton } from "../../../components/ui/State";
import { useClients } from "../../../features/clients/hooks";
import { localName, useI18n } from "../../../i18n/useI18n";

export default function ActivityPage() {
  const { t, lang } = useI18n();
  const { data: clients = [], isLoading } = useClients();

  // Most recently touched first, so the feed reads as a timeline.
  const feed = useMemo(
    () =>
      [...clients].sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
      ),
    [clients],
  );

  return (
    <>
      <PageHeader title={t("activityTitle")} description={t("activitySubtitle")} />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : feed.length === 0 ? (
        <EmptyState icon={<ActivityIcon className="h-6 w-6" />} title={t("noClients")} />
      ) : (
        <ol className="grid gap-2.5">
          {feed.map((client) => {
            const stamp = client.updatedAt ?? client.createdAt;
            return (
              <li key={client._id}>
                <Card interactive className="p-0">
                  <Link href={`/clients/${client._id}`} prefetch className="block">
                    <CardBody className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                        <ActivityIcon className="h-4 w-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {t("clientRegistered", { name: localName(client, lang) })}
                        </p>
                        <p className="truncate text-2xs text-muted">
                          {[client.industry, client.city, client.country]
                            .filter(Boolean)
                            .join(" · ")}{" "}
                          · {client.completion}%
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Badge tone={statusTone[client.status] ?? "neutral"}>{t(client.status)}</Badge>
                        {stamp && (
                          <time
                            dateTime={stamp}
                            className="text-2xs text-faint"
                          >
                            {new Date(stamp).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
                          </time>
                        )}
                      </div>
                    </CardBody>
                  </Link>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
