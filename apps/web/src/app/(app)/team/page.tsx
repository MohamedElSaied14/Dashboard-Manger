"use client";

import { Pencil, Trash2, UserPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import { Avatar } from "../../../components/ui/Avatar";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { EmptyState, SkeletonCards } from "../../../components/ui/State";
import { useToast } from "../../../components/ui/Toast";
import { MemberFormModal } from "../../../features/team/MemberFormModal";
import { useDeleteMember, useTeam } from "../../../features/team/hooks";
import { localName, useI18n } from "../../../i18n/useI18n";
import { useAuthStore } from "../../../store/authStore";
import type { User } from "../../../lib/types";

export default function TeamPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === "admin";

  const { data: members = [], isLoading } = useTeam();
  const deleteMember = useDeleteMember();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const open = (member?: User) => {
    setEditing(member ?? null);
    setModalOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t("teamTitle")}
        description={isAdmin ? t("teamSubtitleAdmin") : t("teamSubtitleMember")}
        actions={
          isAdmin && (
            <Button onClick={() => open()}>
              <UserPlus className="h-4 w-4" />
              {t("addMember")}
            </Button>
          )
        }
      />

      {isLoading ? (
        <SkeletonCards count={3} />
      ) : members.length === 0 ? (
        <EmptyState icon={<UsersRound className="h-6 w-6" />} title={t("teamTitle")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => (
            <li key={member._id}>
              <Card className="h-full">
                <CardBody className="flex items-center gap-3">
                  <Avatar name={member.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{localName(member, lang)}</p>
                    <p className="truncate text-2xs text-muted">{member.email}</p>
                    <Badge tone="brand" className="mt-1.5">
                      {member.role}
                    </Badge>
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => open(member)}
                        aria-label={`${t("editMember")}: ${member.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {member._id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-danger hover:bg-danger-soft"
                          aria-label={`Delete ${member.name}`}
                          onClick={() => {
                            if (confirm(t("deleteMemberConfirm", { name: member.name }))) {
                              deleteMember.mutate(member._id, {
                                onSuccess: () => toast(t("deleteMemberConfirm", { name: member.name }), "success"),
                              });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <MemberFormModal
          open={modalOpen}
          member={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
