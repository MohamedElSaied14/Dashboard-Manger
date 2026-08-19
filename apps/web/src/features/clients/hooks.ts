"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../components/ui/Toast";
import { useI18n } from "../../i18n/useI18n";
import { queryKeys } from "../../lib/queryKeys";
import { asArray, type Client } from "../../lib/types";
import { apiRequest } from "../../utils/api";
import { useAuthStore } from "../../store/authStore";

export function useClients(search = "") {
  const enabled = useAuthStore((state) => !!state.user);
  return useQuery({
    queryKey: queryKeys.clients(search),
    queryFn: () => apiRequest<Client[]>(`/clients?search=${encodeURIComponent(search)}`),
    select: asArray<Client>,
    enabled,
  });
}

export function useClient(id: string | undefined) {
  const enabled = useAuthStore((state) => !!state.user);
  return useQuery({
    queryKey: queryKeys.client(id ?? ""),
    queryFn: () => apiRequest<Client>(`/clients/${id}`),
    enabled: enabled && !!id,
  });
}

export function useCreateClient(onCreated?: (client: Client) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();

  return useMutation({
    mutationFn: (data: Partial<Client>) =>
      apiRequest<Client>("/clients", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast(t("createClientTitle"), "success");
      onCreated?.(client);
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
}

export function useUpdateClient(id: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();

  return useMutation({
    mutationFn: (data: Partial<Client>) =>
      apiRequest<Client>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.client(id) });
      toast(t("saveProfile"), "success");
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
}

export function useDeleteClient(onDeleted?: (id: string) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => apiRequest(`/clients/${id}`, { method: "DELETE" }),
    onSuccess: (_result, id) => {
      // The client's dependent data is gone server-side; drop it locally too so a
      // stale cache entry can't be rendered if the id is ever reused.
      queryClient.removeQueries({ queryKey: queryKeys.designs(id) });
      queryClient.removeQueries({ queryKey: queryKeys.designGuidelines(id) });
      queryClient.removeQueries({ queryKey: queryKeys.client(id) });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
      onDeleted?.(id);
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
}

export function useDesignSummary(clientId: string | undefined) {
  const enabled = useAuthStore((state) => !!state.user) && !!clientId;

  const guidelines = useQuery({
    queryKey: queryKeys.designGuidelines(clientId ?? ""),
    queryFn: () => apiRequest(`/clients/${clientId}/design-guidelines`).catch(() => null),
    enabled,
  });

  const designs = useQuery({
    queryKey: queryKeys.designs(clientId ?? ""),
    queryFn: () => apiRequest(`/clients/${clientId}/designs`),
    select: asArray<{ _id: string; status: string }>,
    enabled,
  });

  return { guidelines: guidelines.data, designs: designs.data ?? [] };
}
