# Development plan

## Environment findings (Phase 0)

| Item | Observed status | Impact |
| --- | --- | --- |
| Ubuntu | 26.04.1 LTS | Supported local host |
| Python | 3.14.6 | Verify library support at scaffold time |
| Node / npm | 24.22.0 / 11.19.1 | Suitable pending selected Vite compatibility check |
| Git | 2.53.0 | Available |
| Docker CLI | 29.1.3 | Installed |
| Docker Compose | Not available (`docker compose` unknown) | Phase 1 blocker |
| Docker daemon access | Permission denied at `/var/run/docker.sock` | Phase 1 blocker |
| PostgreSQL client | Not installed | No direct database fallback confirmed |
| Current LAN IPv4 | 192.168.1.22 | Candidate local phone-access address; may change by DHCP |

No files in the unrelated OOP workspace were changed. Existing ZYWELL files and the environment report were preserved.

## Phased delivery

| Phase | Deliverable | Completion proof |
| --- | --- | --- |
| 1 | Compose local runtime, FastAPI health endpoint, React starter, Alembic setup | Browser reaches frontend; frontend calls backend; backend reaches PostgreSQL |
| 2 | Login, logout, Owner/Cashier/Waiter policies and seed accounts | API authorization tests and role-based UI smoke tests |
| 3 | Tables, menu categories/items and availability | Migration, seeded 50 tables, CRUD permission tests |
| 4 | Sessions, orders, notes, cancellation and realtime events | Transaction/idempotency tests and two-client update test |
| 5 | Merge/split/transfer history | Conflict tests plus audit verification |
| 6 | Bills, discounts, post-payment adjustments | Decimal total and immutable-payment tests |
| 7 | Cash/VietQR mock, receipt preview and mock print | Single-payment and preview/mock tests |
| 8 | Date-filtered reporting and test hardening | Authorization, concurrent-operation and data-integrity test suite |
| 9 | PWA/SUNMI/ZYWELL/real VietQR/cloud | Only on explicit request after local system is stable |

## Phase 1 proposed file layout

```text
backend/
  app/{api,core,modules,db}/
  alembic/
  tests/
frontend/
  src/{app,features,shared}/
infrastructure/
  compose.yaml
  .env.example
```

## Questions requiring confirmation before Phase 1

1. Should a receipt/bill number follow a human-readable format (for example `HD-YYYYMMDD-0001`), and does its sequence reset daily?
2. When a paid bill is adjusted, should its externally visible status be `ADJUSTED`, or stay `PAID` with a visible adjustment balance?
3. For a table split, may the destination be an existing empty table only, or can a new logical session be created before assigning a physical table?
4. Does an order cancellation require any role restriction after a bill is finalized but before payment, or may all roles that can cancel do so until payment?
5. Which timezone governs receipts and reports? Proposed default: `Asia/Ho_Chi_Minh`.
6. What initial demo menu categories, items, prices, and three sample account usernames should be seeded? Passwords will be supplied or generated only after confirmation.
7. Is the proposed owner/cashier/waiter permission matrix correct, especially whether a Cashier may edit the menu and a Waiter may merge tables?

## Required approval before Phase 1

The local Docker approach cannot yet run. Before scaffolding, request approval to install Docker Compose and grant the current user Docker daemon access (normally via the `docker` group, requiring a new login session). This is a system-level change and has not been made.
