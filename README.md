# Sunmi POS Development

Local-first modular-monolith project for a restaurant/pub POS system. The target users are Owner, Cashier and Waiter; the intended devices include desktop browsers, iPhone, Android, and later a SUNMI T1-G.

## Current phase

**Phase 1 is complete.** The platform foundation is operational with FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL 16 (via Docker Compose), and React TypeScript Vite frontend.
See the full report: [Phase 1 Implementation Report](documentation/PHASE_1_REPORT.md).

Read these first:

- [Project overview](documentation/PROJECT_OVERVIEW.md)
- [Architecture](documentation/ARCHITECTURE.md)
- [Business rules](documentation/BUSINESS_RULES.md)
- [Development plan](documentation/DEVELOPMENT_PLAN.md)
- [Android and printer environment report](documentation/ENVIRONMENT_REPORT.md)
- [Phase 1 report](documentation/PHASE_1_REPORT.md)

## Proposed local stack

- Backend: Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL
- Frontend: React, TypeScript, Vite, CSS Design System
- Local runtime: Docker Compose (PostgreSQL 16)

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
