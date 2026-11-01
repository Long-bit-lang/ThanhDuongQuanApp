# Architecture

## Chosen shape: modular monolith

One FastAPI deployment and one PostgreSQL database are appropriate for the expected scale. Modules own application services, policies, repositories, API schemas, and tests, while sharing a single transaction boundary where an operation crosses modules. This avoids premature microservice complexity without blocking later extraction.

```text
React PWA-ready client
        │ REST + WebSocket
        ▼
FastAPI API layer ── authentication / RBAC / validation
        ▼
Application services ── transactions / idempotency / concurrency checks
        ▼
Domain modules ── accounts, catalog, tables, service, billing, payments,
                  reporting, printing, audit
        ▼
Repositories ── SQLAlchemy
        ▼
PostgreSQL ── Alembic migrations + seed data
```

## Backend module boundaries

| Module | Responsibility |
| --- | --- |
| `identity` | Users, password hashes, sessions/tokens, roles and policies |
| `catalog` | Categories, menu items, sale availability and image metadata |
| `floor` | Tables and table state projection |
| `service` | Service sessions, order batches, order lines, cancellation, merge/split/transfer history |
| `billing` | Bill snapshots, line/bill discounts, adjustments and post-payment cancellation |
| `payments` | Single payment record and local VietQR mock; never creates automatic refund |
| `reporting` | Revenue query/read models, role enforcement and date ranges |
| `printing` | Receipt rendering, preview and mock print adapter; no device SDK dependency initially |
| `audit` | Append-only important-action records |

Routes remain thin: parse input, call an application service, serialize output. Business calculations and permission checks live in services/domain policies, not routes.

## Data integrity design

- Monetary values use PostgreSQL `NUMERIC`, Python `Decimal`, and string-safe JSON serialization; never float.
- Order lines snapshot item name and unit price at ordering time.
- Menu items with transaction history are archived/hidden, not deleted.
- Payment records and finalized bill history are immutable facts; later changes are represented by adjustments and audit records.
- Multi-record actions execute in database transactions.
- Service-session/table mutation locks relevant rows (`SELECT ... FOR UPDATE`) and uses a version/revision field to reject stale concurrent client updates.
- Create-order and confirm-payment calls require an idempotency key stored with the resulting operation.

## Local networking

In Phase 1 the frontend is configured with a runtime API base URL, not a hard-coded `localhost` value. Compose publishes services on all host interfaces; the browser on a phone reaches `http://192.168.1.22:<port>` on the same Wi-Fi. CORS origins are an explicit local-development allowlist. Production origin policy is deferred.

## Proposed dependencies (Phase 1 approval required)

Backend: FastAPI, Uvicorn, SQLAlchemy 2.x, Alembic, asyncpg or psycopg, Pydantic Settings, passlib with Argon2, PyJWT or a server-side secure-session implementation, pytest, httpx, and testcontainers or a dedicated PostgreSQL test service.

Frontend: React, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS, and a small form/validation pair such as React Hook Form plus Zod. Dependency versions will be selected only when scaffolding starts, based on compatibility with installed Python 3.14 and Node 24.

## Printing boundary

The `printing` module receives a normalized receipt document and delegates to a `PrinterAdapter` interface. The initial adapter renders a preview and records a mock print result. A later Android/SUNMI adapter may depend on the official ZYWELL SDK without changing billing logic. Real hardware success is never inferred from mock output.
