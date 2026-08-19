# Architecture and recommended additions

## Requested stack

- Next.js + TypeScript, Tailwind CSS, shadcn/ui
- TanStack React Query for server state
- Zustand for small client-only state (sidebar, locale, filters)
- NestJS + TypeScript, MongoDB + Mongoose
- JWT access/refresh authentication
- Cloudinary for logos, brand files, and task attachments

## Add these before production

1. **pnpm workspaces + shared contracts** — one source of truth for API DTOs and enums.
2. **React Hook Form + Zod** — typed validation for the very long client/profile forms.
3. **Redis + BullMQ** — brief extraction, PDF processing, notifications, exports, and Cloudinary transformations must run as background jobs.
4. **OpenAPI/Swagger** — generated API documentation and typed client generation.
5. **Passport, Argon2, refresh-token rotation** — secure authentication; store refresh tokens in `httpOnly`, `secure`, `sameSite` cookies.
6. **RBAC plus resource policies** — roles alone are not enough; check client, department, and file-level access.
7. **Audit log and soft delete** — append-only change history, version snapshots, archive/restore, and no direct destructive deletes.
8. **i18next/next-intl** — Arabic/English, RTL/LTR, localized dates, and Arabic-friendly fonts.
9. **Meilisearch or Atlas Search** — the specification’s cross-entity smart search will outgrow regex queries.
10. **S3-compatible document storage** — keep Cloudinary for images/video; use object storage for AI/EPS/PSD/DOCX and large source files.
11. **Sentry + structured logging + health checks** — error tracking, request IDs, uptime, and actionable production diagnostics.
12. **Testing** — Vitest/RTL for UI, Jest/Supertest for API, Playwright for login/client/handover critical paths.
13. **Security baseline** — Helmet, CORS allowlist, rate limiting, CSP, file MIME/size scanning, secret manager, encrypted sensitive fields, backups.
14. **Docker + CI/CD** — reproducible local environment and lint/typecheck/test/build gates on every pull request.

## Delivery order

- Phase 1: auth, users/roles, clients, contacts, brand identity, files/links, tasks, notes, timeline, handover, search.
- Phase 2: approvals, meetings/calendar, reports, Drive/Gmail integrations, contracts/invoices.
- Phase 3: automated brief extraction, semantic search, brand-compliance checks, workload recommendations.
