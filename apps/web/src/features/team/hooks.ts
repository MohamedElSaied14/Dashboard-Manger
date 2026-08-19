"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../components/ui/Toast";
import { queryKeys } from "../../lib/queryKeys";
import { asArray, type User } from "../../lib/types";
import { apiRequest } from "../../utils/api";
import { useAuthStore } from "../../store/authStore";

/** Only admins and managers are permitted to list workspace users. */
export function useTeam() {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => apiRequest<User[]>("/users"),
    select: asArray<User>,
    enabled: !!user && (user.role === "admin" || user.role === "manager"),
  });
}

export function useSaveMember(editingId: string | null, onDone?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest(editingId ? `/users/${editingId}` : "/users", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users() });
      onDone?.();
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
}

export function useDeleteMember() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => apiRequest(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users() }),
    onError: (error: Error) => toast(error.message, "error"),
  });
}
