"use client";

import { BriefcaseBusiness } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { useI18n } from "../../i18n/useI18n";
import type { ClientStatus } from "../../lib/types";
import { useCreateClient } from "./hooks";

const STATUSES: ClientStatus[] = [
  "lead",
  "onboarding",
  "active",
  "holding",
  "completed",
  "not_active",
  "archived",
];

/** Creates a client with only the required fields, then opens its full profile. */
export function ClientFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", industry: "", city: "", status: "lead" as ClientStatus });

  const createClient = useCreateClient((client) => {
    onClose();
    setForm({ name: "", industry: "", city: "", status: "lead" });
    if (client?._id) router.push(`/clients/${client._id}?edit=1`);
  });

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("createClientTitle")}
      description={t("createClientHint")}
      icon={<BriefcaseBusiness className="h-5 w-5" />}
      size="sm"
    >
      <form
        id="create-client-form"
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          createClient.mutate(form);
        }}
      >
        <Field label={t("clientName")} required>
          {(props) => (
            <Input {...props} required value={form.name} onChange={set("name")} autoComplete="off" />
          )}
        </Field>
        <Field label={t("industry")} required>
          {(props) => <Input {...props} required value={form.industry} onChange={set("industry")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("city")} required>
            {(props) => <Input {...props} required value={form.city} onChange={set("city")} />}
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

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={createClient.isPending}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
