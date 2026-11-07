# AI Usage Log

This log records the significant decisions, accepted/rejected suggestions, and evidence produced while preparing the repository for agentic work.

## Entry 1 — Initial repository audit and measurement design

- **Context:** The repository was audited against the ADA-08 readiness dimensions before any improvement.
- **AI finding:** The repository has real tests, lint, Husky, and CI, but no `AGENTS.md`, no repository map, no single verification command, and no explicit protected paths. The README is obsolete and the task originally used IDs (`TASK-12`, `RF-12`) that do not exist in `docs/REQUIREMENTS.md`.
- **Human decision:** Keep the task scoped to the existing item-stock trigger flow. Do not implement the full Orders consumer, stock movements, reservations, or FEFO consumption in this change.
- **Accepted:** Adapt the task to the existing `ItemChangeEmitter` flow and document the Orders integration as a non-goal.
- **Rejected:** Implementing the complete Orders/FEFO integration during this exercise; it would require a contract that the repository explicitly marks as undecided.
- **Scores:** BEFORE = 44/100, recorded in `REPOSITORY_READINESS_AUDIT.md`.

## Entry 2 — Baseline preservation

- **Context:** BEFORE and AFTER must start from the same functional state.
- **Action:** Rewrote the task as `TASK_UNDER_TEST.md` in English with real requirement IDs, committed the baseline documentation and task, and created the `ada08-baseline` tag.
- **Human validation:** The human authorized the baseline commit and tag.
- **Evidence:** Baseline commit `30069da`, tag `ada08-baseline`.
- **Controlled variable:** The baseline includes the corrected task as the measurement instrument, not as a readiness improvement.

## Entry 3 — Task rewrite and traceability

- **Context:** The original task was in Spanish, referenced `RF-12` and `TASK-12`, and contained `[cite: N]` artifacts that do not map to this repository.
- **Change:** Rewrote the task as `CR-NOTIF-01` referencing `RF-NOTIF-01..07`, `RF-EVT-03`, `RF-EVT-05`, and the acceptance scenarios derived from `docs/REQUIREMENTS.md` §5.10 and `docs/SPEC.md` §10.2.
- **Accepted:** Real requirement IDs, explicit non-goals, and a verification section with TC-12-01..05.
- **Rejected:** Copying acceptance criteria into the task as a second source of truth.
- **Remaining gap:** A dedicated `TASKS.md` index is still missing; it is added in the readiness improvements.

## Entry 4 — BEFORE agent run

_Pending execution._

## Entry 5 — AGENTS.md design

_Pending._

## Entry 6 — Guardrail and CI design

_Pending._

## Entry 7 — Discoverability and implicit knowledge

_Pending._

## Entry 8 — Final evaluation and AFTER handoff

_Pending._
