# BEFORE Agent Run

## Run Context
- Agent: opencode (this session)
- Model: big-pickle
- Tools: glob, grep, read, edit, write, bash, todowrite, question
- Permissions: file read/write/edit, shell execution in repo
- Baseline commit/tag: ada08-baseline (30069da)
- Branch at start: task/stock-movement-entity/agent-ready-BEFORE
- Task under test: CR-NOTIF-01 in TASK_UNDER_TEST.md
- Note: This was not a clean session; repository context was loaded at the start of the ADA conversation.

## Clarification Questions
- Asked 6 questions to disambiguate scope, event contract, baseline handling, session cleanliness, task rewriting, and language. The answers defined the experimental plan above.

## Repository Exploration
Files explored to understand the repository:
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.config.e2e.ts`, `nest-cli.json`
- `README.md`, `docs/REQUIREMENTS.md`, `docs/SPEC.md`
- `src/app.module.ts`, `src/modules/*/module.ts`
- `src/broker/event-conventions.ts`, `src/broker/event-publisher.service.ts`, `src/broker/event-customer.service.ts`, `src/broker/event-subscriptions.ts`
- `src/modules/item/item.service.ts`, `src/modules/item/item-change.emitter.ts`
- `src/modules/batch/batch.service.ts`
- `src/modules/recipe/recipe.service.ts`, `src/modules/recipe/recipe.service.spec.ts`, `src/modules/recipe/recipe.schema.ts`, `src/modules/recipe/recipe.events.ts`
- `.github/workflows/on_pr.yml`, `.husky/pre-commit`, `.husky/commit-msg`
- `test/app.e2e-spec.ts`, `test/item.e2e-spec.ts`

## Incorrect Assumptions
- Assumed there was a stock-movement/Orders flow to hook into; none exists. Corrected to use `ItemChangeEmitter`.
- Assumed the logical name `Inventario.Receta.NoDisponible` must be used as the routing key literally; the repo uses conventional routing keys, so a new key `inventory.recipe.not-available` was added.
- Assumed the original task IDs were valid; they were not present in `docs/REQUIREMENTS.md`.
- Assumed we needed to implement full broker retry/backoff infrastructure; the requirements mark it as considered/future and the existing pattern logs publish failures.

## Failed / Unknown Commands
- `ls task_undert_test.md` after rename (expected failure).
- Tests produce Nest logs about broker connections failing in test environment (expected because RabbitMQ is optional and tests mock publishers/consumers).
- No build/lint/test commands failed.

## Out-of-Scope Changes
- None intended. The implementation is limited to recipe availability evaluation on item changes, event conventions, schema state for deduplication, tests, and SPEC updates.
- No Orders consumer, movements, reservations, or FEFO consumption added.

## Validation Evidence
Commands executed:
- `npm test -- --run` → 21 test files, 263 tests passed
- `npm run lint` → PASS (oxlint)
- `npm run build` → PASS (nest build)

Behavior verified by unit tests:
- Transition preparable→unavailable emits `inventory.recipe.not-available` with plate and limiting ingredients (AC-01)
- Item not in any recipe produces no event (AC-02)
- Multiple affected recipes produce one event each (AC-03)
- Sufficient stock produces no event (AC-04)
- Already unavailable produces no duplicate event (AC-05)
- Broker publish failure logs and does not throw/block (AC-06)
- Reacts via `ItemChangeEmitter` on item changes

## Final Result
PARTIAL

Rationale: The functional change satisfies CR-NOTIF-01 against existing repository patterns and all tests pass, but the execution started from a non-clean session and required correcting the task, adapting to existing architecture, and inferring the correct trigger. A repository that was agent-ready would have stated the trigger, event naming convention, and deduplication requirements explicitly.
