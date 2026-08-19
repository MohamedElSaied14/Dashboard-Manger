/**
 * Every React Query key in the app is built here. Centralising them keeps
 * invalidation honest — a new caller can't invent a key that never gets
 * invalidated, and prefetching uses the exact same key as the page.
 */
export const queryKeys = {
  clients: (search = "") => ["clients", search] as const,
  client: (id: string) => ["client", id] as const,
  tasks: () => ["tasks"] as const,
  users: () => ["users"] as const,
  designGuidelines: (clientId: string) => ["design-guidelines", clientId] as const,
  designs: (clientId: string) => ["designs", clientId] as const,
  designReview: (clientId: string, designId: string) =>
    ["design-review", clientId, designId] as const,
  references: (clientId: string) => ["design-references", clientId] as const,
  approvals: () => ["approvals"] as const,
};
