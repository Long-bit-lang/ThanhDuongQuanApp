# Sunmi POS Development

Local-first modular-monolith project for a restaurant/pub POS system. The target users are Owner, Cashier and Waiter; the intended devices include desktop browsers, iPhone, Android, and later a SUNMI T1-G.

## Current phase

**Phase 0 is complete.** This repository currently contains planning documents and separately preserved ZYWELL printer resources. No backend, frontend, database schema, Docker configuration, or business implementation has been created.

Read these first:

- [Project overview](documentation/PROJECT_OVERVIEW.md)
- [Architecture](documentation/ARCHITECTURE.md)
- [Business rules](documentation/BUSINESS_RULES.md)
- [Development plan](documentation/DEVELOPMENT_PLAN.md)
- [Android and printer environment report](documentation/ENVIRONMENT_REPORT.md)

## Proposed local stack

- Backend: Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL
- Frontend: React, TypeScript, Vite, Tailwind CSS
- Local runtime: Docker Compose (after Docker Compose is made available)

No command exists yet to run the application because Phase 1 has not been authorized.

## Planned layout

```text
sunmi-pos-development/
├── backend/                 # FastAPI application (Phase 1)
├── frontend/                # React application (Phase 1)
├── infrastructure/          # Compose and local runtime files (Phase 1)
├── documentation/           # Architecture, rules, plans, reports
├── printer-test/            # Reserved for later printer work
└── zywell-sdk/              # Official resources; do not treat as app code
```

## Phase 1 prerequisites

Docker Compose must be installed and the current user must have permission to access the Docker daemon. The exact corrective action will be proposed for approval before any system change.
# ThanhDuongQuanApp
