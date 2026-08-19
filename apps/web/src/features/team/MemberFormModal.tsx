"use client";

import { ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";
import { useI18n } from "../../i18n/useI18n";
import type { Role, User } from "../../lib/types";
import { useSaveMember } from "./hooks";

export function MemberFormModal({
  open,
  member,
  onClose,
}: {
  open: boolean;
  member: User | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    nameAr: "",
    email: "",
    password: "",
    role: "member" as Role,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: member?.name ?? "",
      nameAr: member?.nameAr ?? "",
      email: member?.email ?? "",
      password: "",
      role: member?.role ?? "member",
    });
  }, [open, member]);

  const saveMember = useSaveMember(member?._id ?? null, () => {
    toast(member ? t("saveChanges") : t("createAccount"), "success");
    onClose();
  });

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? t("editMember") : t("createMember")}
      description={t("memberModalHint")}
      icon={<UsersRound className="h-5 w-5" />}
      size="sm"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          saveMember.mutate({
            name: form.name.trim(),
            nameAr: form.nameAr.trim() || undefined,
            email: form.email.trim(),
            role: form.role,
            // Editing without typing a password leaves the existing one intact.
            ...(form.password ? { password: form.password } : {}),
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fullName")} required>
            {(props) => (
              <Input {...props} required minLength={2} value={form.name} onChange={set("name")} />
            )}
          </Field>
          <Field label={t("arabicName")}>
            {(props) => <Input {...props} dir="rtl" value={form.nameAr} onChange={set("nameAr")} />}
          </Field>
        </div>

        <Field label={t("email")} required>
          {(props) => (
            <Input {...props} required type="email" value={form.email} onChange={set("email")} />
          )}
        </Field>

        <Field
          label={member ? t("newPassword") : t("password")}
          hint={member ? t("passwordHintEdit") : t("passwordHintNew")}
          required={!member}
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              required={!member}
              minLength={8}
              value={form.password}
              onChange={set("password")}
              autoComplete="new-password"
            />
          )}
        </Field>

        <Field label={t("workspaceRole")}>
          {(props) => (
            <Select {...props} value={form.role} onChange={set("role")}>
              <option value="member">{t("roleMember")}</option>
              <option value="manager">{t("roleManager")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </Select>
          )}
        </Field>

        <p className="flex items-start gap-2 rounded-lg border border-brand/25 bg-brand-soft/50 p-3 text-2xs leading-relaxed text-brand-ink">
          <ShieldCheck className="mt-px h-4 w-4 shrink-0" aria-hidden />
          {t("securityNote")}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={saveMember.isPending}>
            {member ? t("saveChanges") : t("createAccount")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
