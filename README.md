# AccountFlow

Account management dashboard for creative and medical marketing teams. The repository is a pnpm monorepo containing a Next.js web app and a NestJS API.

## Run locally

1. Copy `.env.example` to `.env` and fill in the secrets.
2. Run `pnpm install`.
3. Run `pnpm dev`.

Web: `http://localhost:3000` · API: `http://localhost:4000/api`

## Implemented starter scope

- Responsive bilingual-ready dashboard shell
- JWT authentication with admin, manager, and member roles
- Client profiles with status, manager, completion score, and activity
- Dashboard summaries and responsive task/activity presentation
- MongoDB indexes for dashboard and search queries
- Task management, Cloudinary uploads, AI design review, and reviewed design references
- Client archive/restore and brief/guideline version rollback

The remaining production work is centered on refresh-token cookies, rate limiting, stronger file scanning, observability, and broader end-to-end coverage.

## Secure first admin

Set `BOOTSTRAP_ADMIN_EMAIL` and a `BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters for the first API start. After the account is created, remove both values. Public registration cannot choose roles and only an authenticated admin can create additional users.

`JWT_ACCESS_SECRET` is required, must be at least 32 characters, and access tokens default to a 15-minute lifetime.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the recommended additions and delivery phases.
