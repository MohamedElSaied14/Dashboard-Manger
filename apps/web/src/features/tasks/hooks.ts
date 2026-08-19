"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../components/ui/Toast";
import { queryKeys } from "../../lib/queryKeys";
import { asArray, type Task } from "../../lib/types";
import { apiRequest } from "../../utils/api";
import { useAuthStore } from "../../store/authStore";

export function useTasks() {
  const enabled = useAuthStore((state) => !!state.user);
  return useQuery({
    queryKey: queryKeys.tasks(),
    queryFn: () => apiRequest<Task[]>("/tasks"),
    select: asArray<Task>,
    enabled,
  });
}

function useTaskInvalidation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
}

export function useToggleTask() {
  const queryClient = useQueryClient();
  const invalidate = useTaskInvalidation();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      apiRequest(`/tasks/${id}`, { method: "PUT", body: JSON.stringify({ completed }) }),
    // Flip the checkbox immediately; the list re-syncs when the request lands.
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks() });
      const previous = queryClient.getQueryData<Task[]>(queryKeys.tasks());
      queryClient.setQueryData<Task[]>(queryKeys.tasks(), (tasks) =>
        tasks?.map((task) => (task._id === id ? { ...task, completed } : task)),
      );
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.tasks(), context.previous);
      toast(error.message, "error");
    },
    onSettled: invalidate,
  });
}

export function useCreateTask(onDone?: () => void) {
  const invalidate = useTaskInvalidation();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("/tasks", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      invalidate();
      onDone?.();
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
}

export function useUpdateTask(onDone?: () => void) {
  const invalidate = useTaskInvalidation();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      invalidate();
      onDone?.();
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
}

export function useDeleteTask() {
  const invalidate = useTaskInvalidation();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => apiRequest(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (error: Error) => toast(error.message, "error"),
  });
}
