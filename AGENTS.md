# AGENTS.md

## Purpose

This file is the operational contract for coding agents working in this repository. It is short, actionable, and points to the sources of truth. Do not duplicate requirements or architecture here.

## Read First

Read these documents in order before making changes:

1. `docs/REQUIREMENTS.md` - Functional and non-functional requirements with IDs.
2. `docs/SPEC.md` - Architecture, modules, messaging, and current implementation status.
3. `ARCHITECTURE.md` - Module boundaries, dependencies, and protected zones.
4. `docs/REPO_MAP.md` - Where to find entry points, tests, events, and routes.
5. `TASKS.md` - Task index and traceability to requirements.
6. `TASK_UNDER_TEST.md` - The task to implement (if present).

## Sources of Truth

- **Requirements:** `docs/REQUIREMENTS.md` is the source of truth for `RF-*` requirements.
- **Specification:** `docs/SPEC.md` is the source of truth for architecture, contracts, and implementation status.
- **Do not redefine:** Do not change requirements or specs to make tests pass. If they conflict with the task, stop and ask for human input.
- **Task scope:** Use `TASK_UNDER_TEST.md` for the bounded change. Do not turn the task into a new source of truth.

## Repository Map (Quick)

- `src/` - NestJS application (modules, controllers, services, schemas, broker)
- `src/modules/item/` - Items catalog and `ItemChangeEmitter`
- `src/modules/recipe/` - Recipes and availability logic
- `src/modules/batch/` - Batches and stock/cost synchronization
- `src/modules/suppliers/` - Suppliers
- `src/broker/` - RabbitMQ publisher/consumer and event conventions
- `src/database/` - MongoDB connection
- `test/` - E2E tests (`*.e2e-spec.ts`)
- `docs/` - Requirements, spec, and repo map
- `scripts/` - Deterministic verification and checks
- `results/` - Agent run evidence and audit artifacts
- `.github/workflows/` - CI pipelines

## Standard Commands

Use these commands from the repository root. The single verification contract is `scripts/verify_repo.sh`.

| Action | Command | Notes |
| --- | --- | --- |
| Install | `npm ci` | Use Node version from `.nvmrc` |
| Lint | `npm run lint` | Oxlint on `src/` and `test/` |
| Test (unit) | `npm test` | Vitest; does not require MongoDB |
| Test (e2e) | `npm run test:e2e` | Requires MongoDB; use `docker compose up -d --wait db` |
| Build | `npm run build` | Nest build to `dist/` |
| OpenAPI | `npm run openapi:generate` | Builds and generates `openapi.yml` |
| Verify all | `./scripts/verify_repo.sh` | Runs lint, unit tests, build, OpenAPI, and repo contract checks |

## Change Rules

- **Stay scoped:** Only change files required by the task. Do not refactor unrelated code.
- **Follow conventions:** Match existing style, use existing modules/services, and respect NestJS patterns.
- **Do not weaken tests:** Do not modify tests to hide failures. If behavior changes, update tests only when the task explicitly requires it.
- **No new dependencies:** Do not add packages without strong justification and human approval.
- **Respect messaging:** Use `src/broker/event-conventions.ts` for routing keys and payloads. Keep the broker optional.
- **Do not touch protected paths:** See `docs/REPO_MAP.md` and `ARCHITECTURE.md` for protected/managed files.
- **Preserve compatibility:** Keep existing API contracts and event shapes compatible unless the task explicitly requires changes.
- **Secrets:** Never commit `.env`, credentials, or secrets. Only `.env.example` may be tracked.

## Trigger Map (Known)

- **Item changes:** `ItemChangeEmitter` emits on item create/update/remove and `ItemService.updateStockAndCost`. `RecipeService` reacts to recompute availability.
- **Batch changes:** `BatchService.syncItemStockAndCost` updates item stock/cost via `ItemService.updateStockAndCost` (which emits item changes).
- **Menu events:** `RecipeEvents` consumes `menu.plate.*` to register/update recipes.
- **Orders:** Not implemented in this repository. Do not add an Orders consumer unless the task explicitly requires it and a contract exists.

## Stop Conditions

Stop and ask for human input when:

- **Requirements conflict:** The task contradicts `docs/REQUIREMENTS.md` or `docs/SPEC.md`.
- **Architecture boundary change:** The change requires moving code across module boundaries or changing shared contracts.
- **Destructive action:** The change would delete data, drop collections, or run destructive migrations.
- **Missing contract:** An integration (e.g., Orders) requires an event contract that does not exist in the repo.
- **Secrets/external access:** The change requires credentials, external network access not configured, or modifying secrets.
- **Scope creep:** The change grows beyond `TASK_UNDER_TEST.md` into unimplemented features.
- **Tests cannot run safely:** Tests require external services not available and the task cannot be validated.

## Definition of Done

A change is done only when:

- [ ] The change matches `TASK_UNDER_TEST.md` and respects `docs/REQUIREMENTS.md` / `docs/SPEC.md`.
- [ ] Code follows existing conventions and does not touch protected paths.
- [ ] Lint passes: `npm run lint`
- [ ] Unit tests pass: `npm test`
- [ ] Build passes: `npm run build`
- [ ] Repository contract passes: `./scripts/verify_repo.sh` (or equivalent evidence documented)
- [ ] Evidence is recorded: modified files, commands executed, and proof the change works.
- [ ] No secrets or generated artifacts were modified.
- [ ] If behavior changes, tests were added/updated only as required by the task.
- [ ] Known gaps are documented if they cannot be addressed within scope.
