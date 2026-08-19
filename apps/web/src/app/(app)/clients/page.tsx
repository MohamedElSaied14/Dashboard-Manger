"use client";

import { BriefcaseBusiness, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "../../../components/ui/Avatar";
import { Badge, statusTone } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { PageHeader, ProgressBar } from "../../../components/ui/PageHeader";
import { EmptyState, ErrorState, SkeletonCards } from "../../../components/ui/State";
import { useToast } from "../../../components/ui/Toast";
import { ClientFormModal } from "../../../features/clients/ClientFormModal";
import { useClients, useDeleteClient } from "../../../features/clients/hooks";
import { localName, useI18n } from "../../../i18n/useI18n";
import { useSearchStore } from "../../../store/searchStore";

export default function ClientsPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const search = useSearchStore((state) => state.query);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: clients = [], isLoading, error, refetch } = useClients(search);
  const deleteClient = useDeleteClient(() => toast(t("deleteClient"), "success"));

  return (
    <>
      <PageHeader
        title={t("clientsTitle")}
        description={t("clientsSubtitle")}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("addClient")}
          </Button>
        }
      />

      {isLoading ? (
        <SkeletonCards />
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<BriefcaseBusiness className="h-6 w-6" />}
          title={t("noClientsFound")}
          description={t("noClientsFoundHint")}
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("addClient")}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => (
            <li key={client._id}>
              <Card className="group relative h-full p-5 transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md">
                <Link href={`/clients/${client._id}`} prefetch className="flex items-center gap-3">
                  {/* Stretched link keeps the whole card clickable while the
                      delete button below stays independently focusable. */}
                  <span className="absolute inset-0 rounded-xl" aria-hidden />
                  <Avatar name={client.name} src={client.logoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {localName(client, lang)}
                    </span>
                    <span className="block truncate text-2xs text-muted">{client.industry}</span>
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    if (confirm(t("deleteClientConfirm"))) deleteClient.mutate(client._id);
                  }}
                  disabled={deleteClient.isPending}
                  aria-label={`${t("deleteClient")}: ${client.name}`}
                  className="absolute end-3 top-3 z-10 rounded-md p-1.5 text-faint opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <div className="mt-5 flex items-center justify-between text-2xs text-muted">
                  <span>{t("completion")}</span>
                  <span className="font-semibold tabular-nums text-brand">{client.completion}%</span>
                </div>
                <ProgressBar value={client.completion} className="mt-1.5" />

                <div className="mt-4 flex items-center justify-between gap-2">
                  <Badge tone={statusTone[client.status] ?? "neutral"}>{t(client.status)}</Badge>
                  <span className="truncate text-2xs text-faint">
                    {[client.city, client.country].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ClientFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
