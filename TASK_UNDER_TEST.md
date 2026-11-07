# Task Under Test

Change ID: CR-ORD-01

## Goal

Implement Phase 1 of the Orders integration: reserve, confirm, release, expire, and query stock reservations, with a read-through in-memory cache for pending reservations.

Inventory must consume Orders events from its own queue, apply stock reservations idempotently, and publish the outcome so Orders can react. The service must keep working when RabbitMQ is unavailable and must resume consumption after reconnecting.

Phase 2 (consuming a served order with FEFO, `StockMovement` audit rows, and batch depletion) is explicitly out of scope for this change.

## Requirements Covered

- RF-RES-01..05, RF-RES-07, RF-RES-08: reservation creation, lifecycle, release/expiry, rejection without partial state, and idempotency by order reference.
- RF-ORD-01, RF-ORD-02, RF-ORD-04..07: Orders consumer, async processing, cancellation releases, idempotent event references, and result publication.
- RF-RECIPE-08: availability continues to use available stock (`totalStock - reservedStock`).
- RF-EVT-03, RF-EVT-07: broker is optional and Orders events use a dedicated inventory queue.

`RF-RES-06` and `RF-ORD-03` remain pending for Phase 2.

## Contract (Provisional)

- Exchange: `ordenes.topic` (topic, durable).
- Queue: `cola_orders_events` (durable).
- Routing keys consumed: `ordenes.order.created`, `ordenes.order.confirmed`, `ordenes.order.cancelled`, `ordenes.order.served`.
- Envelope: `eventId`, `version`, `occurredAt`, `correlationId?`, `orderId`, `items?`, `reason?`.
- Routing keys published: `inventory.reservation.confirmed`, `inventory.reservation.rejected`, `inventory.reservation.released`, `inventory.reservation.expired`.
- Result payload: `orderId`, `status`, `reason?`, `items?`, `timestamp`, plus correlation fields when available.

The contract must be confirmed with the Orders team before production. `ordenes.order.served` is acknowledged in Phase 1 but does not consume stock yet.

## Acceptance Scenarios

- AC-01: `order.created` increments `reservedStock` atomically and publishes `inventory.reservation.confirmed`.
- AC-02: insufficient stock publishes `inventory.reservation.rejected`, reserves nothing, and leaves no partial increments.
- AC-03: `order.confirmed` moves a pending reservation to confirmed and publishes the result.
- AC-04: `order.cancelled` releases the reserved stock and publishes `inventory.reservation.released`.
- AC-05: pending reservations expire after the configured TTL and publish `inventory.reservation.expired`.
- AC-06: duplicate `eventId` or repeated `orderId` does not apply the effect twice.
- AC-07: a broker outage does not block startup or HTTP operations; the consumer reconnects and restores subscriptions.
- AC-08: `GET /reservations`, `GET /reservations/:orderId`, and `GET /reservations/pending/summary` expose persisted reservations and pending reserved quantities.

## Verification

Commands:

- `npm run lint`
- `npm test`
- `npm run build`
- `./scripts/verify_repo.sh`

Evidence must include unit tests for reservation lifecycle, cache invalidation/TTL, item stock mutation, idempotency, and broker reconnection behavior.

## Constraints

- Use `docs/REQUIREMENTS.md` and `docs/SPEC.md` as the source of truth.
- Keep changes scoped to Phase 1.
- Do not add dependencies without approval.
- Do not modify `openapi.yml`, `dist/`, or secrets.
- Keep existing event shapes compatible and the broker optional.

## Non-Goals

- FEFO consumption and batch depletion on served orders.
- `StockMovement` records for reservation lifecycle.
- Dead-letter queues and full processing retry policy.
- Replacing the in-memory cache with a shared cache.
