# Tasks Index

## Active / Measurement Task

| Task ID | Title | Requirements | Files of Interest | Status |
| --- | --- | --- | --- | --- |
| CR-NOTIF-01 | Proactive recipe unavailability notification | RF-NOTIF-01, RF-NOTIF-02, RF-NOTIF-03, RF-NOTIF-04, RF-NOTIF-05, RF-NOTIF-06, RF-NOTIF-07, RF-EVT-03, RF-EVT-05 | `src/modules/recipe/`, `src/broker/event-conventions.ts`, `src/modules/item/item-change.emitter.ts` | Under test (`TASK_UNDER_TEST.md`) |

## Traceability (Planned / Existing)

| Requirement | Module(s) | Status | Notes |
| --- | --- | --- | --- |
| RF-EVT-01 | Recipe | Implemented | Menu events consumed |
| RF-EVT-02 | Recipe/Broker | Implemented | Availability published |
| RF-EVT-03 | Broker/All | Implemented | Broker optional |
| RF-EVT-04 | Broker | Implemented | Ack/reject patterns |
| RF-EVT-05 | Broker | Considered | Retry/backoff/DLQ pending |
| RF-NOTIF-01..07 | Recipe/Item | Partially implemented | Triggered via item changes; Orders integration pending |
| RF-ORD-* | - | Considered | Orders integration pending |
| RF-RES-* | - | Considered | Reservations pending |
| RF-MOV-* | - | Considered | Movements pending |
| RF-FEFO-* | Batch/Item | Partially implemented | Expiration status exists; automatic consumption pending |

Traceability details are maintained in `docs/REQUIREMENTS.md` and `docs/SPEC.md`.
