# Tasks Index

## Active / Measurement Task

| Task ID | Title | Requirements | Files of Interest | Status |
| --- | --- | --- | --- | --- |
| CR-ORD-01 | Orders events and stock reservations (Phase 1) | RF-RES-01..05, RF-RES-07, RF-RES-08, RF-ORD-01, RF-ORD-02, RF-ORD-04..07, RF-RECIPE-08, RF-EVT-03, RF-EVT-07 | `src/modules/reservation/`, `src/modules/processed-event/`, `src/modules/item/item.service.ts`, `src/broker/` | Under test (`TASK_UNDER_TEST.md`) |

## Traceability (Planned / Existing)

| Requirement | Module(s) | Status | Notes |
| --- | --- | --- | --- |
| RF-EVT-01 | Recipe | Implemented | Menu events consumed |
| RF-EVT-02 | Recipe/Broker | Implemented | Availability published |
| RF-EVT-03 | Broker/All | Implemented | Broker optional |
| RF-EVT-04 | Broker | Implemented | Ack/reject patterns |
| RF-EVT-05 | Broker | Partially implemented | Reconnect/backoff added; DLQ and processing retries pending |
| RF-EVT-06 | Broker | Implemented | Orders envelope includes eventId, version, occurredAt, correlationId |
| RF-EVT-07 | Reservation/Broker | Implemented | Orders events consumed from `cola_orders_events` |
| RF-NOTIF-01..07 | Recipe/Item | Partially implemented | Triggered via item changes; Orders integration pending |
| RF-ORD-01..02,04..07 | Reservation | Partially implemented | Created/confirmed/cancelled handled; served consumption pending |
| RF-ORD-03 | Reservation | Considered | Served event logged only; FEFO consumption pending |
| RF-RES-01..05,07,08 | Reservation/Item | Implemented | Phase 1 lifecycle, cache, idempotency and rejection |
| RF-RES-06 | Reservation/Batch | Considered | FEFO consumption pending |
| RF-MOV-* | - | Considered | Movements pending |
| RF-FEFO-* | Batch/Item | Partially implemented | Expiration status exists; automatic consumption pending |

Traceability details are maintained in `docs/REQUIREMENTS.md` and `docs/SPEC.md`.
