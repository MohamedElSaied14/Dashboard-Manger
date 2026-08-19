"use client";

import { CheckSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";
import { useI18n } from "../../i18n/useI18n";
import type { Client, Priority, Task, User } from "../../lib/types";
import { useCreateTask, useUpdateTask } from "./hooks";

const PRIORITIES: Priority[] = ["low", "medium", "high"];

const emptyForm = {
  title: "",
  description: "",
  priority: "medium",
  client: "",
  dueDate: "",
  assignedTo: "",
  driveLink: "",
  moreInfo: "",
};

/** One modal serves both "create" and "edit"; `task` decides which. */
export function TaskFormModal({
  open,
  task,
  clients,
  users,
  onClose,
}: {
  open: boolean;
  task: Task | null;
  clients: Client[];
  users: User[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [accessibleBy, setAccessibleBy] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setForm({
        title: task.title ?? "",
        description: task.description ?? "",
        priority: task.priority ?? "medium",
        client: (typeof task.client === "object" ? task.client?._id : task.client) ?? "",
        dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
        assignedTo: task.assignedTo?._id ?? "",
        driveLink: task.driveLink ?? "",
        moreInfo: task.moreInfo ?? "",
      });
      setAccessibleBy(task.accessibleBy?.map((user) => user._id) ?? []);
    } else {
      setForm(emptyForm);
      setAccessibleBy([]);
    }
  }, [open, task]);

  const done = () => {
    toast(task ? t("saveChanges") : t("addTask"), "success");
    onClose();
  };
  const createTask = useCreateTask(done);
  const updateTask = useUpdateTask(done);
  const pending = createTask.isPending || updateTask.isPending;

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      ...Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value === "" ? undefined : value]),
      ),
      accessibleBy,
    };
    if (task) updateTask.mutate({ id: task._id, data: payload });
    else createTask.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? t("editTaskTitle") : t("createTaskTitle")}
      icon={<CheckSquare className="h-5 w-5" />}
    >
      <form className="grid gap-4" onSubmit={submit}>
        <Field label={t("taskTitle")} required>
          {(props) => <Input {...props} required value={form.title} onChange={set("title")} />}
        </Field>
        <Field label={t("taskDesc")}>
          {(props) => (
            <Textarea {...props} rows={3} value={form.description} onChange={set("description")} />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("selectClient")}>
            {(props) => (
              <Select {...props} value={form.client} onChange={set("client")}>
                <option value="">— {t("general")} —</option>
                {clients.map((client) => (
                  <option key={client._id} value={client._id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("taskPriority")}>
            {(props) => (
              <Select {...props} value={form.priority} onChange={set("priority")}>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(priority)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("dueDate")}>
            {(props) => (
              <Input {...props} type="date" value={form.dueDate} onChange={set("dueDate")} />
            )}
          </Field>
          <Field label={t("assignedTo")}>
            {(props) => (
              <Select {...props} value={form.assignedTo} onChange={set("assignedTo")}>
                <option value="">— {t("unassigned")} —</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label={t("taskDriveLink")}>
          {(props) => (
            <Input {...props} type="url" value={form.driveLink} onChange={set("driveLink")} />
          )}
        </Field>
        <Field label={t("moreInfo")}>
          {(props) => (
            <Textarea {...props} rows={2} value={form.moreInfo} onChange={set("moreInfo")} />
          )}
        </Field>

        {users.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="text-xs font-semibold text-muted">{t("accessibleBy")}</legend>
            <div className="flex flex-wrap gap-2">
              {users.map((user) => {
                const checked = accessibleBy.includes(user._id);
                return (
                  <label
                    key={user._id}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-2xs font-semibold transition-colors ${
                      checked
                        ? "border-brand bg-brand-soft text-brand-ink"
                        : "border-border text-muted hover:border-border-strong"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        setAccessibleBy((current) =>
                          checked
                            ? current.filter((id) => id !== user._id)
                            : [...current, user._id],
                        )
                      }
                    />
                    {user.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={pending}>
            {task ? t("saveChanges") : t("submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
