# Repository Readiness Audit

## Measurement Setup

- Baseline commit/tag: `ada08-baseline` (`30069da`)
- Task under test: `CR-NOTIF-01` in `TASK_UNDER_TEST.md`
- Sources of truth detected: `docs/REQUIREMENTS.md`, `docs/SPEC.md`
- Stack: NestJS 12 + Mongoose 8 + MongoDB + RabbitMQ + Vitest
- Audit performed before any repository-readiness improvement.

## BEFORE

| Dimension | Score 0-5 | Weighted | Evidence / Main Gap |
| :--- | :---: | :---: | :--- |
| Entry Point & Navigation | 2 | 6/15 | `README.md` exists but is obsolete ("Aún no hay modelos de inventario en MongoDB") and does not mention recipes, batches, suppliers, or the broker. There is no `docs/REPO_MAP.md`. Module entry points and tests are only discoverable by listing directories. |
| Agent Instructions | 0 | 0/15 | No `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or equivalent. Commands, sources of truth, boundaries, stop conditions, and Definition of Done must be inferred. |
| Build / Run / Test | 3 | 9/15 | `package.json` and README document install, run, lint, test, e2e, and build commands. There is no single verification contract; e2e requires a running MongoDB and the relationship between unit/e2e/CI is not explicit. |
| Architecture Boundaries | 3 | 6/10 | `docs/SPEC.md` §4 and §8 describe modules and messaging, but there is no explicit list of protected paths, dependency rules, or "do not edit" zones. Generated `openapi.yml`, `dist/`, and broker contracts are not marked as protected. |
| Requirements & Traceability | 2 | 4/10 | `docs/REQUIREMENTS.md` and `docs/SPEC.md` use stable IDs, but there is no `TASKS.md` index. The original task referenced nonexistent `TASK-12` / `RF-12`; it was rewritten to `CR-NOTIF-01` / `RF-NOTIF-*` before the baseline, yet no traceability index exists. |
| Automation & Guardrails | 3 | 6/10 | Oxlint, Vitest, Husky pre-commit, Commitlint, and a GitHub Actions CI exist. There is no repository contract check, no protected-path check, no secret scan, and no shared local/CI verification script. |
| Testability & Evidence | 3 | 9/15 | 21 unit test files / 256 passing tests, plus an e2e config. The Definition of Done and evidence format are implicit; there is no `results/` evidence workflow and acceptance scenarios are not indexed. |
| Safety & Permissions | 2 | 4/10 | `.env` is ignored and only `.env.example` is tracked. There are no explicit stop conditions, protected paths, secret-pattern checks, or documented approval gates for destructive operations. |

**TOTAL BEFORE: 44 / 100**

## Top 3 Friction Points

1. **No `AGENTS.md`.** The agent must infer sources of truth, official commands, change rules, stop conditions, and the Definition of Done.
2. **Obsolete README and no repository map.** The README claims there are no inventory models and gives no route from a task to the relevant module, test, or architecture boundary.
3. **Broken traceability and no single verification contract.** The task originally used IDs that did not exist in the requirements, and there is no `TASKS.md`, no `scripts/verify_repo.sh`, and no shared local/CI contract.

## Additional Observations

- The working tree contained untracked `docs/`, `TASK_UNDER_TEST.md`, and the ADA instructions before the baseline. They are now committed so BEFORE and AFTER share the same functional state.
- Unit tests run without MongoDB; e2e tests require a database and are a separate command.
- `ItemChangeEmitter` already emits on item stock updates and batch synchronization, which makes it the correct existing trigger for RF-NOTIF-01 without introducing an Orders consumer.

## AFTER

_Pending completion of the repository-readiness improvements and the AFTER agent run._
