"use client";

import {
  CheckSquare,
  ExternalLink,
  Eye,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, priorityTone } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "../../../components/ui/State";
import { useToast } from "../../../components/ui/Toast";
import { useClients } from "../../../features/clients/hooks";
import { useDeleteTask, useTasks, useToggleTask, useUpdateTask } from "../../../features/tasks/hooks";
import { TaskCheckbox } from "../../../features/tasks/TaskCheckbox";
import { TaskFormModal } from "../../../features/tasks/TaskFormModal";
import { useTeam } from "../../../features/team/hooks";
import { localName, useI18n } from "../../../i18n/useI18n";
import { cn } from "../../../lib/cn";
import type { Task } from "../../../lib/types";
import { apiRequest } from "../../../utils/api";

type Filter = "all" | "open" | "done";

export default function TasksPage() {
  const { t, lang } = useI18n();
  const toast = useToast();

  const { data: tasks = [], isLoading, error, refetch } = useTasks();
  const { data: clients = [] } = useClients();
  const { data: users = [] } = useTeam();

  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();

  const [filter, setFilter] = useState<Filter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (filter === "open") return tasks.filter((task) => !task.completed);
    if (filter === "done") return tasks.filter((task) => task.completed);
    return tasks;
  }, [tasks, filter]);

  /** Uploading a deliverable also marks the task complete, as before. */
  const uploadDeliverable = async (event: React.ChangeEvent<HTMLInputElement>, taskId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("assetType", "task_attachment");
    body.append("ownerId", taskId);

    setUploadingId(taskId);
    try {
      const response = await apiRequest<{ url: string }>("/upload", { method: "POST", body });
      updateTask.mutate({
        id: taskId,
        data: { finishedAttachmentUrl: response.url, completed: true },
      });
      toast(t("uploadFinished"), "success");
    } catch (uploadError) {
      toast((uploadError as Error).message, "error");
    } finally {
      setUploadingId(null);
    }
  };

  const openCreate = () => {
    setEditingTask(null);
    setModalOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t("tasksTitle")}
        description={t("tasksSubtitle")}
        actions={
          <>
            <div className="flex rounded-md border border-border p-0.5" role="tablist">
              {(["all", "open", "done"] as const).map((key) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                    filter === key ? "bg-brand text-white" : "text-muted hover:text-ink",
                  )}
                >
                  {t(key === "all" ? "filterAll" : key === "open" ? "filterOpen" : "filterDone")}
                </button>
              ))}
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t("addTask")}
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-6 w-6" />}
          title={t("noTasksFound")}
          description={t("noTasksFoundHint")}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t("addTask")}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {visible.map((task) => (
            <li key={task._id}>
              <Card className={cn(task.completed && "bg-surface-sunken/60")}>
                <CardBody className="space-y-3">
                  <div className="flex items-start gap-3">
                    <TaskCheckbox
                      checked={task.completed}
                      label={task.title}
                      onChange={(completed) => toggleTask.mutate({ id: task._id, completed })}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          task.completed && "text-muted line-through",
                        )}
                      >
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {task.description || t("noDescription")}
                      </p>

                      {task.moreInfo && (
                        <p className="mt-2 rounded-md bg-brand-soft/60 px-3 py-2 text-2xs text-brand-ink">
                          <span className="font-bold">{t("notes")}: </span>
                          {task.moreInfo}
                        </p>
                      )}

                      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted">
                        <span>
                          {t("selectClient")}:{" "}
                          <b className="text-brand">
                            {task.client ? localName(task.client, lang) : t("general")}
                          </b>
                        </span>
                        {task.dueDate && (
                          <span>
                            {t("dueDate")}: <b>{new Date(task.dueDate).toLocaleDateString()}</b>
                          </span>
                        )}
                        {task.assignedTo && (
                          <span>
                            {t("assignedTo")}: <b>{task.assignedTo.name}</b>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Badge tone={priorityTone[task.priority] ?? "neutral"}>{t(task.priority)}</Badge>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${t("editTaskTitle")}: ${task.title}`}
                        onClick={() => {
                          setEditingTask(task);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete: ${task.title}`}
                        className="text-danger hover:bg-danger-soft"
                        onClick={() => {
                          if (confirm(t("deleteTaskConfirm"))) deleteTask.mutate(task._id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {task.accessibleBy && task.accessibleBy.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <Users className="h-4 w-4 text-faint" aria-hidden />
                      <span className="text-2xs text-muted">{t("accessibleBy")}:</span>
                      {task.accessibleBy.map((member) => (
                        <Badge key={member._id} tone="accent" className="normal-case">
                          {member.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    {task.driveLink ? (
                      <a
                        href={task.driveLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
                      >
                        <FolderOpen className="h-4 w-4" aria-hidden />
                        {t("taskDriveLink")}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : (
                      <span />
                    )}

                    {task.completed ? (
                      task.finishedAttachmentUrl ? (
                        <a
                          href={task.finishedAttachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-success hover:underline"
                        >
                          <Eye className="h-4 w-4" aria-hidden />
                          {t("viewFinished")}
                        </a>
                      ) : (
                        <Badge tone="success">{t("finished")}</Badge>
                      )
                    ) : (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand">
                        {uploadingId === task._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Upload className="h-4 w-4" aria-hidden />
                        )}
                        {t("uploadFinished")}
                        <input
                          type="file"
                          className="sr-only"
                          onChange={(event) => uploadDeliverable(event, task._id)}
                        />
                      </label>
                    )}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <TaskFormModal
        open={modalOpen}
        task={editingTask}
        clients={clients}
        users={users}
        onClose={() => {
          setModalOpen(false);
          setEditingTask(null);
        }}
      />
    </>
  );
}
