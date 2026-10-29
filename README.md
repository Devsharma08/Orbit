# Orbit — team issue tracker

Orbit is a full-stack team issue tracker built with React, TypeScript, Express, and PostgreSQL. It has been run locally against a Docker-hosted PostgreSQL database; Neon PostgreSQL can also be used.

## Set up and run

### 1. Prepare PostgreSQL

Use an existing local PostgreSQL server or create a Neon database. For a local database, create a database named `orbit_tracker` and make sure PostgreSQL is reachable on port `5432`. For example, with `psql`:

```sql
CREATE DATABASE orbit_tracker;
```

The local development setup used a Docker PostgreSQL container with port `5432` published on the host. Connect using that container's PostgreSQL username and password. Do not copy database credentials into source files or commit them.

For Neon, use the connection string provided by your Neon project. Neon connections require SSL; local PostgreSQL connections do not.

### 2. Configure the environment

Copy `.env.example` to `.env` in the repository root and fill in the values. `.env` is ignored by Git.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL. For local PostgreSQL: `postgresql://USER:PASSWORD@localhost:5432/orbit_tracker?sslmode=disable`. For Neon, use its supplied SSL connection URL. URL-encode special characters in the username or password. |
| `JWT_SECRET` | Random signing key of at least 32 characters. Generate one with `openssl rand -base64 48`. |
| `PORT` | Express API port; defaults to `4000`. |
| `CLIENT_ORIGIN` | Allowed frontend origin for API CORS; defaults to `http://localhost:5173`. |
| `VITE_API_URL` | Frontend API base URL; `/api` uses the Vite development proxy. |

### 3. Install, seed, and start

From the repository root:

```sh
npm install
npm run seed
npm run dev
```

Open the Vite URL shown in the terminal (normally [http://localhost:5173](http://localhost:5173)). The API listens on [http://localhost:4000](http://localhost:4000); Vite proxies `/api` to it during development.

The API creates or updates the tables and audit triggers at startup. `npm run seed` can be rerun safely; it creates the demo users, `ORB` project, project memberships, and welcome issue. The local Docker-backed database has been seeded and smoke-tested with the API. Demo credentials are for local evaluation only; change them before using the app beyond a demo.

### Demo logins

| Username | Password | Role |
| --- | --- | --- |
| `alex` | `orbit-demo` | Project owner |
| `sam` | `orbit-demo` | Project member |
| `jordan` | `orbit-demo` | Project member |

Use the owner account to add teammates to a project. Members can create, edit, assign, comment on, and move project issues.

## Features

- Projects with owner/member roles and member invitations from seeded users.
- Bug and task issues with Markdown descriptions, priority, labels, and project-member assignees.
- Server-enforced workflow: **Open → In progress → In review → Closed**, with **Closed → Open** as the only reopen move.
- Search and status, priority, assignee, and label filters, plus bounded pagination.
- Per-issue comments and a field-by-field history with actor and timestamp.
- Responsive layouts for desktop and phone, sign-in, and clear API validation errors.
- Seed/demo data, PostgreSQL schema, and nine automated backend tests.

## API outline

All routes except login and health require a bearer token.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Sign in |
| `GET` | `/api/me`, `/api/users` | Current user and teammates |
| `GET`, `POST` | `/api/projects` | List or create projects |
| `GET`, `POST` | `/api/projects/:projectId/members` | List or add project members |
| `GET`, `POST` | `/api/projects/:projectId/issues` | Filter/paginate or create issues |
| `GET`, `PATCH` | `/api/issues/:issueId` | Read or update an issue |
| `GET`, `POST` | `/api/issues/:issueId/comments` | Read or add comments |
| `GET` | `/api/issues/:issueId/history` | Read the audit trail |

## Data model and design decisions

- `users`, `projects`, and `project_members` model accounts, project ownership, and membership. Project membership is checked on every project and issue operation; only project owners may invite members.
- `issues` holds the issue fields and references its project, creator, and optional assignee. Database constraints complement server-side Zod validation.
- `issue_comments` stores the issue's conversation, with the author and creation time.
- `issue_history` stores one row per changed issue field: actor, field, previous JSON value, new JSON value, and time.
- A PostgreSQL trigger records each issue field on creation and each changed field on updates. API writes set a transaction-local actor ID; the audit records are written in the same transaction as the issue change. The trigger also captures direct database updates, so history is not tied to a particular route or UI.
- Workflow transitions are checked in the API inside a row-locked transaction, preventing concurrent requests from bypassing the allowed moves.
- JWTs expire after 12 hours. The demo client stores its token in local storage; use a hardened cookie/session strategy and production identity provider for a public deployment.

## Verify

```sh
npm test
npm run typecheck
npm run build
```

The nine backend unit tests cover allowed and rejected workflow moves, status validation, issue creation and patch constraints, filter bounds, and project/comment validation. The app has also been smoke-tested against the local PostgreSQL database for API health, demo sign-in, project/issue/history reads, and rejection of an invalid workflow transition.

## Status and next steps

- **Implemented:** project membership, issue creation and editing, server-side validation and workflow enforcement, filtering/search/pagination, comments, transactionally recorded issue history, responsive UI, demo data, and local PostgreSQL setup.
- **Not implemented:** optional saved filters and in-app `@mention` notifications. There is no deployed live demo.
- **With more time:** add account/password management and email invitations, harden sessions and rate limiting for production, add automated PostgreSQL integration tests, improve deployment/observability, and build a dedicated project-settings page.

## AI tools

GitHub Copilot (Copilot SDK in VS Code) assisted with implementation, debugging, documentation, and validation. The code, data model, and tests are included in this repository. No live demo is currently deployed.
