/** Shared shapes for the API payloads the dashboard consumes. */

export type Role = "member" | "manager" | "admin";

export type ClientStatus =
  | "lead"
  | "onboarding"
  | "active"
  | "holding"
  | "completed"
  | "not_active"
  | "archived";

export type Priority = "low" | "medium" | "high";

export interface User {
  _id: string;
  name: string;
  nameAr?: string;
  email: string;
  role: Role;
}

export interface Client {
  _id: string;
  name: string;
  nameAr?: string;
  industry: string;
  city?: string;
  country?: string;
  status: ClientStatus;
  completion: number;
  logoUrl?: string;
  driveLink?: string;
  fonts?: string;
  briefs?: string;
  lastProjectFinished?: string;
  accountManager?: User | string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Task {
  _id: string;
  title: string;
  description?: string;
  moreInfo?: string;
  priority: Priority;
  completed: boolean;
  dueDate?: string;
  driveLink?: string;
  finishedAttachmentUrl?: string;
  client?: Client | null;
  assignedTo?: User | null;
  accessibleBy?: User[];
  createdAt?: string;
}

export interface DesignGuidelines {
  orientation?: string;
  dimensions?: { width?: number; height?: number; aspectRatio?: string };
  colorRules?: { mode?: string; allowedColors?: unknown[] };
  typography?: { allowedFonts?: unknown[] };
  header?: { logoPosition?: string; logoRepeatedAllowed?: boolean };
  footer?: { phone?: string; socialHandle?: string };
  designInstructions?: unknown[];
  thingsToAvoid?: unknown[];
  notes?: string[];
}

export interface Design {
  _id: string;
  status: "uploaded" | "analyzing" | "approved" | "changes_requested" | "rejected";
  imageUrl?: string;
  createdAt?: string;
}

/** API list endpoints occasionally return an error object instead of an array. */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
