"use client";

import { BriefcaseBusiness, CalendarClock, CheckSquare, Gauge } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Avatar } from "../../../components/ui/Avatar";
import { Badge, priorityTone } from "../../../components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "../../../components/ui/Card";
import { PageHeader, ProgressBar } from "../../../components/ui/PageHeader";
import { Skeleton } from "../../../components/ui/State";
import { StatCard } from "../../../components/ui/StatCard";
import { useClients } from "../../../features/clients/hooks";
import { useTasks, useToggleTask } from "../../../features/tasks/hooks";
import { localName, useI18n } from "../../../i18n/useI18n";
import { useAuthStore } from "../../../store/authStore";
import { TaskCheckbox } from "../../../features/tasks/TaskCheckbox";

export default function DashboardPage() {
  const { t, lang } = useI18n();
  const user = useAuthStore((state) => state.user);
  const { data: clients = [], isLoading: loadingClients } = useClients();
  const { data: tasks = [], isLoading: loadingTasks } = useTasks();
  const toggleTask = useToggleTask();

  const stats = useMemo(() => {
    const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return {
      activeClients: clients.filter((client) => client.status === "active").length,
      openTasks: tasks.filter((task) => !task.completed).length,
      dueThisWeek: tasks.filter(
        (task) => !task.completed && task.dueDate && new Date(task.dueDate).getTime() <= weekFromNow,
      ).length,
      completion: clients.length
        ? Math.round(clients.reduce((sum, client) => sum + (client.completion ?? 0), 0) / clients.length)
        : 0,
    };
  }, [clients, tasks]);

  // Soonest deadline first, undated last.
  const priorities = useMemo(
    () =>
      [...tasks]
        .filter((task) => !task.completed)
        .sort((a, b) => {
          const left = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const right = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return left - right;
        })
        .slice(0, 5),
    [tasks],
  );

  const dateLabel = new Date().toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <PageHeader
        title={`${t("greeting")}, ${localName(user ? { name: user.name, nameAr: user.nameAr } : null, lang) || ""}`}
        description={dateLabel}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("activeClients")}
          value={stats.activeClients}
          hint={`${clients.length} ${t("totalSuffix")}`}
          tone="success"
          icon={BriefcaseBusiness}
          loading={loadingClients}
        />
        <StatCard
          label={t("openTasks")}
          value={stats.openTasks}
          hint={`${tasks.length} ${t("totalSuffix")}`}
          tone="warning"
          icon={CheckSquare}
          loading={loadingTasks}
        />
        <StatCard
          label={t("dueWeek")}
          value={stats.dueThisWeek}
          hint={t("scheduled")}
          tone="brand"
          icon={CalendarClock}
          loading={loadingTasks}
        />
        <StatCard
          label={t("profileCompletion")}
          value={`${stats.completion}%`}
          hint={t("average")}
          tone="accent"
          icon={Gauge}
          loading={loadingClients}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <p className="text-xs text-muted">{t("healthTitle")}</p>
              <CardTitle className="mt-1">{t("healthSubtitle")}</CardTitle>
            </div>
            <Badge tone="brand">{t("lastSixMonths")}</Badge>
          </CardHeader>
          <CardBody className="pt-4">
            <CompletionChart clients={clients} loading={loadingClients} />
          </CardBody>
        </Card>

        <Card className="surface-brand border-transparent">
          <CardBody>
            <p className="text-2xs font-bold uppercase tracking-wider text-white/70">
              {t("profilesStatus")}
            </p>
            <p className="mt-2 text-xl font-bold">{t("profilesComplete", { n: stats.completion })}</p>
            <p className="mt-2 text-xs leading-relaxed text-white/80">{t("profilesHint")}</p>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-700"
                style={{ width: `${stats.completion}%` }}
              />
            </div>
            <p className="mt-2 text-2xs text-white/70">{stats.completion}%</p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("todayPriorities")}</CardTitle>
            <Link href="/tasks" prefetch className="text-xs font-semibold text-brand hover:underline">
              {t("viewAll")}
            </Link>
          </CardHeader>
          <CardBody className="pt-3">
            {loadingTasks ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : priorities.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">{t("noTasks")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {priorities.map((task) => (
                  <li key={task._id} className="flex items-center gap-3 py-3">
                    <TaskCheckbox
                      checked={task.completed}
                      label={task.title}
                      onChange={(completed) => toggleTask.mutate({ id: task._id, completed })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="truncate text-2xs text-muted">
                        {task.client ? localName(task.client, lang) : t("general")}
                        {task.dueDate && ` · ${new Date(task.dueDate).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Badge tone={priorityTone[task.priority] ?? "neutral"}>
                      {t(task.priority)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("recentActivity")}</CardTitle>
            <Badge tone="success">{t("live")}</Badge>
          </CardHeader>
          <CardBody className="pt-3">
            {loadingClients ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : clients.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">{t("noClients")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {clients.slice(0, 5).map((client) => (
                  <li key={client._id}>
                    <Link
                      href={`/clients/${client._id}`}
                      prefetch
                      className="flex items-center gap-3 py-3 transition-colors hover:text-brand"
                    >
                      <Avatar name={client.name} src={client.logoUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{localName(client, lang)}</p>
                        <p className="truncate text-2xs text-muted">
                          {[client.industry, client.city, client.country].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="text-2xs font-semibold tabular-nums text-brand">
                        {client.completion}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

/**
 * Completion score per client as a small bar chart. Replaces the previous
 * decorative SVG, which drew a hard-coded curve unrelated to any real data.
 */
function CompletionChart({
  clients,
  loading,
}: {
  clients: { _id: string; name: string; completion: number }[];
  loading: boolean;
}) {
  const { t } = useI18n();

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (clients.length === 0) {
    return <p className="grid h-48 place-items-center text-xs text-muted">{t("noClients")}</p>;
  }

  const top = clients.slice(0, 8);

  return (
    <div className="space-y-3">
      {top.map((client) => (
        <div key={client._id} className="grid grid-cols-[minmax(0,7rem)_1fr_2.5rem] items-center gap-3">
          <span className="truncate text-xs text-muted">{client.name}</span>
          <ProgressBar value={client.completion} className="h-2" />
          <span className="text-end text-2xs font-semibold tabular-nums text-muted">
            {client.completion}%
          </span>
        </div>
      ))}
    </div>
  );
}
