'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * Configuration's data layer.
 *
 * ONE READ for the whole page (`GET /config`), because the seven tabs are one
 * screen and a tab-per-request would make switching tabs feel like navigating.
 * Every write invalidates that single key, so a saved number is on screen before
 * the toast has faded.
 */

export interface ProgramShape {
  version: number;
  levels: number;
  cycleDays: number;
  reviewDay: number;
  restDays: number[];
  meetingDay: number;
  termDays: number;
  sessions: { fitness: number; yoga: number; mind: number };
}

export interface ServiceConfig {
  replyTargetMin: number;
  notifyAfterMin: number;
  escalateAfterMin: number;
  escalateToRole: string;
  approverRole: string;
}

export interface ChainRow {
  kind: string;
  steps: Array<{ role: string }>;
}

export interface NotifRule {
  id: string;
  name: string;
  detail: string | null;
  schedule: string;
  audience: string;
  channel: string;
  enabled: boolean;
}

export interface FlowStepRow {
  id: string;
  after: number | null;
  on: number | null;
  at: number;
  title: string;
  text: string;
  position: number;
}

export interface FlowRow {
  id: string;
  name: string;
  desc: string | null;
  trigger: 'ENROL' | 'CYCLE_DAY';
  defaultOn: boolean;
  enabled: boolean;
  steps: FlowStepRow[];
}

export interface ConfigPayload {
  program: ProgramShape;
  service: ServiceConfig;
  chains: ChainRow[];
  notifications: NotifRule[];
  flows: FlowRow[];
  reach: Record<string, { on: number; live: number }>;
  categories: Array<{ key: string; name: string; seeded: boolean }>;
  usage: Record<string, { items: number; templates: number; clients: number }>;
  tags: Array<{ id: string; name: string; slug: string }>;
  tagUsage: Record<string, { items: number }>;
}

const KEY = ['config'] as const;

export function useConfig() {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<ConfigPayload>('/config') });
}

/**
 * Every mutation on this page shares one shape: write, then re-read the page.
 *
 * `onSettled` rather than `onSuccess` — a REFUSAL changes what should be on
 * screen too, because the server may have refused precisely because the page was
 * showing something stale.
 */
function useConfigMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetProgram() {
  return useConfigMutation((shape: Omit<ProgramShape, 'version'>) =>
    api.put<{ version: number }>('/config/program', shape),
  );
}

export function useSetService() {
  return useConfigMutation((input: Partial<ServiceConfig>) =>
    api.patch<ServiceConfig>('/config/service', input),
  );
}

export function useSetChain() {
  return useConfigMutation((args: { kind: string; steps: Array<{ role: string }> }) =>
    api.put<ChainRow>(`/config/chains/${args.kind}`, { steps: args.steps }),
  );
}

export function useAddNotifRule() {
  return useConfigMutation((input: { name: string; schedule: string; enabled: boolean }) =>
    api.post<NotifRule>('/config/notifications', input),
  );
}

export function useUpdateNotifRule() {
  return useConfigMutation((args: { id: string; patch: Partial<NotifRule> }) =>
    api.patch<NotifRule>(`/config/notifications/${args.id}`, args.patch),
  );
}

export function useDeleteNotifRule() {
  return useConfigMutation((id: string) => api.del<{ ok: true }>(`/config/notifications/${id}`));
}

export function useAddFlow() {
  return useConfigMutation(
    (input: { name: string; trigger: string; defaultOn: boolean; desc?: string }) =>
      api.post<FlowRow>('/config/flows', input),
  );
}

export function useUpdateFlow() {
  return useConfigMutation((args: { id: string; patch: Partial<FlowRow> }) =>
    api.patch<FlowRow>(`/config/flows/${args.id}`, args.patch),
  );
}

export function useDeleteFlow() {
  return useConfigMutation((id: string) => api.del<{ ok: true }>(`/config/flows/${id}`));
}

export function useAddStep() {
  return useConfigMutation(
    (args: {
      id: string;
      step: { after?: number | null; on?: number | null; at: number; title: string; text: string };
    }) => api.post<FlowStepRow>(`/config/flows/${args.id}/steps`, args.step),
  );
}

export function useUpdateStep() {
  return useConfigMutation((args: { id: string; stepId: string; patch: Partial<FlowStepRow> }) =>
    api.patch<FlowStepRow>(`/config/flows/${args.id}/steps/${args.stepId}`, args.patch),
  );
}

export function useDeleteStep() {
  return useConfigMutation((args: { id: string; stepId: string }) =>
    api.del<{ ok: true }>(`/config/flows/${args.id}/steps/${args.stepId}`),
  );
}

export function useAddCategory() {
  return useConfigMutation((name: string) => api.post('/config/categories', { name }));
}

export function useRenameCategory() {
  return useConfigMutation((args: { key: string; name: string }) =>
    api.patch(`/config/categories/${args.key}`, { name: args.name }),
  );
}

export function useDeleteCategory() {
  return useConfigMutation((key: string) => api.del<{ ok: true }>(`/config/categories/${key}`));
}

export function useAddTag() {
  return useConfigMutation((name: string) => api.post('/config/tags', { name }));
}

export function useDeleteTag() {
  return useConfigMutation((id: string) => api.del<{ ok: true }>(`/config/tags/${id}`));
}
