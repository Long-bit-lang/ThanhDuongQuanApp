# Project overview

## Objective

Build a practical restaurant/pub POS system, initially for local testing on one Ubuntu laptop. The system must preserve business history, enforce permissions on the backend, and remain extensible for later PWA, SUNMI, printer, VietQR, and cloud work.

## Scope now

- Local browser-based system for five concurrent users.
- Fifty tables, three roles, menu, service sessions, orders, bills, discounts, payment mock, printing mock, and revenue report.
- Responsive desktop and mobile web user interface.
- PostgreSQL-backed data with migrations and seed data.
- REST API plus WebSocket events for table/order refresh.

## Explicitly deferred

- VPS/cloud deployment, real banking/VietQR integration, Android APK/PWA packaging, and physical ZYWELL printing.
- Inventory management, employee-level revenue reporting, split payments, and automatic refunds.

## User roles

| Role | Primary responsibilities |
| --- | --- |
| OWNER | Accounts, configuration, menu/tables, operational and revenue controls |
| CASHIER | Orders, billing, discounts, payments, print preview/mock, revenue report |
| WAITER | Mobile-first table service, orders, notes, cancellation, merge/split/transfer |

Authorization is enforced by API policy/service checks. The UI may hide unavailable actions for clarity but is never the security boundary.

## Repository boundary

`zywell-sdk/` holds downloaded, official printer material from earlier environment preparation. It remains isolated from application source. `printer-test/` is reserved for a future, separately authorized device phase.
