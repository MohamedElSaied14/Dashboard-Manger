import { AppShell } from "../../components/layout/AppShell";

/**
 * Route-group layout: everything under `(app)` shares one persistent shell.
 * The URL is unaffected by the group name, so pages live at `/dashboard`,
 * `/clients`, and so on.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
