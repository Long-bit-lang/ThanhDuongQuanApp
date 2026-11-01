# Confirmed business rules

## Core invariants

- Exactly 50 tables are seeded; each is empty or serving.
- A service session may own several tables; merge, split, and item transfer actions are historical events.
- A final bill belongs to at most one service session.
- An order line snapshots its product name and unit price. A cancelled line is retained with cancellation metadata and excluded from current totals.
- A paid bill may be adjusted by cancelling a line. The original payment stays unchanged; the difference is recorded and never becomes an automatic refund.
- A bill is paid at most once, by cash or mock VietQR. Split payments are out of scope.
- Bill/item discounts may be percentage or fixed amount. Calculation clamps payable total at zero and records every discount/adjustment.
- Menu items with history are not physically deleted. An unavailable item blocks new orders but preserves prior orders.
- Passwords are securely hashed; only an Owner creates/resets accounts; staff cannot self-reset passwords.

## Authorization summary

| Action | OWNER | CASHIER | WAITER |
| --- | :---: | :---: | :---: |
| Account management | Yes | No | No |
| Menu create/edit/hide | Yes | Yes | No |
| Open session / order / cancel | Yes | Yes | Yes |
| Merge/split/transfer | Yes | Yes | Yes |
| Create bill / discount / confirm payment | Yes | Yes | No |
| Receipt preview / mock print | Yes | Yes | No |
| Revenue report | Yes | Yes | No |

## Required audit events

Account creation/reset, menu archive/edit, session open/close, order submission, cancellation, merge, split, transfer, discount, bill finalization, post-payment adjustment, payment confirmation, and mock print request record actor, timestamp, entity references, action, and relevant before/after snapshot.

## Proposed state model

```text
Table: EMPTY | SERVING
Service session: OPEN | BILLED | PAID | ADJUSTED
Order line: ACTIVE | CANCELLED
Bill: DRAFT | FINALIZED | PAID | ADJUSTED
Payment: CONFIRMED (one immutable record per bill)
```

The exact status transitions and whether a paid bill becomes `ADJUSTED` or retains `PAID` plus an adjustment flag require confirmation before schema design.
