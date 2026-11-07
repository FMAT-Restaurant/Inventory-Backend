# AFTER Agent Run

## Run Context
- Agent: opencode (clean session)
- Model: big-pickle
- Tools: glob, grep, read, edit, bash
- Permissions: file read/write/edit, shell execution in repo
- Baseline commit/tag: ada08-baseline (30069da)
- Ready branch: ada08/after-ready
- Task under test: CR-NOTIF-01 in TASK_UNDER_TEST.md
- Prompt: Use the exact prompt from the ADA execution section (clean session)

## Prompt to Use
```text
Implement the change described in TASK_UNDER_TEST.md.

Before making any changes:
- inspect the repository,
- identify the relevant project context,
- determine how the project is built, tested, and validated,
- respect the existing architecture and repository conventions.

When finished:
- run the appropriate validation,
- report the files modified,
- report the commands executed,
- provide evidence that the requested change works.

Do not ask for additional repository context unless it is necessary to proceed safely.
```

## Clarification Questions
None. The repository instructions (`AGENTS.md`), architecture, repo map, task index, requirements, and spec provided enough context to proceed safely.

## Repository Exploration
Read in the documented order and used as the source of truth:
- `AGENTS.md` (commands, change rules, trigger map, stop conditions, Definition of Done)
- `docs/REQUIREMENTS.md` §5.10 and §5.11 (RF-NOTIF-01..07, RF-EVT-03/05)
- `docs/SPEC.md` §8 and §10.2 (event conventions and unavailability notification)
- `ARCHITECTURE.md` (module boundaries, event flow, protected zones)
- `docs/REPO_MAP.md` (module/test/event locations and change guide)
- `TASKS.md` (CR-NOTIF-01 traceability)
- `TASK_UNDER_TEST.md` (bounded change and acceptance scenarios)

Implementation context inspected:
- `src/modules/item/item-change.emitter.ts`
- `src/modules/item/item.service.ts`
- `src/modules/batch/batch.service.ts`
- `src/modules/recipe/recipe.service.ts`, `recipe.module.ts`, `recipe.events.ts`
- `src/modules/recipe/schemas/recipe.schema.ts`
- `src/broker/event-conventions.ts`, `event-publisher.service.ts`
- `src/modules/recipe/recipe.service.spec.ts`
- `package.json`, `vitest.config.ts`, `scripts/verify_repo.sh`, `scripts/check_repo_contract.py`
- `.github/workflows/on_pr.yml`, `.github/workflows/verify.yml`

Key findings:
- The existing trigger is `ItemChangeEmitter` (`ITEM_CHANGED_EVENT`), emitted by `ItemService.updateStockAndCost` and batch synchronization.
- The repository routing-key convention is lowercase (`<microservice>.<entity>.<action>`), and `ARCHITECTURE.md`/`docs/REPO_MAP.md` already name `inventory.recipe.not-available`.
- RabbitMQ is optional; publish failures are logged and must not block the business operation.
- No Orders consumer, stock-movement entity, reservation lifecycle, or FEFO consumption exists and none was added.

## Incorrect Assumptions
- Initially considered extending `ItemChangedEvent` with previous/current stock to detect the transition. Corrected: persisted `Recipe.lastKnownAvailability` keeps the existing in-process contract unchanged and makes duplicate suppression verifiable.
- Did not assume the Spanish logical name `Inventario.Receta.NoDisponible` is a literal routing key; used the existing convention `inventory.recipe.not-available`.
- Did not implement retry/backoff, DLQ, Orders integration, movements, reservations, or FEFO consumption; the task and requirements mark them as out of scope or future work.

## Failed / Unknown Commands
None. All requested commands succeeded. The Nest `ERROR` lines printed during `npm test` are expected output from existing tests that deliberately simulate broker failures; they are not test failures.

## Out-of-Scope Changes
None. Changes are limited to:
- `src/broker/event-conventions.ts`
- `src/modules/recipe/recipe.service.ts`
- `src/modules/recipe/schemas/recipe.schema.ts`
- `src/modules/recipe/recipe.service.spec.ts`

No Orders consumer, stock-movement entity, reservation/FEFO consumption, new dependency, secret, environment file, generated artifact, or requirement redefinition was introduced. `openapi.yml` remained unchanged.

## Validation Evidence
Commands executed from the repository root:
- `npm run lint` → PASS (oxlint)
- `npm test` → PASS (21 test files, 262 tests)
- `npm run build` → PASS (nest build)
- `./scripts/verify_repo.sh` → PASS (repository contract, lint, unit tests, build, OpenAPI generation)

Scenario coverage in `src/modules/recipe/recipe.service.spec.ts`:
- AC-01: preparable → non-preparable publishes one `inventory.recipe.not-available` event with `plateId`, `name`, and `limitingIngredients`.
- AC-02: item not used by any recipe publishes no unavailability event.
- AC-03: one item shared by two recipes publishes one event per affected plate.
- AC-04: reduction that leaves enough stock publishes no unavailability event.
- AC-05: second reduction while already unavailable publishes no additional event.
- AC-06: broker publish failure is logged and does not throw or fail the stock operation; known availability state is preserved for a later retry attempt.

## Final Result
PASS

## Comparison with BEFORE

| Indicator | BEFORE | AFTER |
| :--- | :--- | :--- |
| Clarification questions | Multiple (task IDs, trigger, event contract, session) | None |
| Failed/unknown commands | Few (rename confusion) | None (only expected broker-error logs in tests) |
| Incorrect assumptions | Trigger, event naming, task IDs, deduplication | None material; persisted state and conventional routing key selected from repo docs |
| Out-of-scope files modified | None (kept scoped) | None (4 scoped source/test files) |
| Validations executed correctly | lint, test, build | lint, test, build, `./scripts/verify_repo.sh` |
| Final result | PARTIAL | PASS |
| Qualitative observation | Had to infer many things; task had wrong IDs | Trigger, event convention, deduplication approach, and validation contract were discoverable from AGENTS/architecture/repo map |
| Discoverability | Low - no AGENTS.md, no map | High - AGENTS.md, ARCHITECTURE.md, docs/REPO_MAP.md, TASKS.md |
| Implicit Knowledge | Documented in results/implicit-knowledge.md | Existing remediations were sufficient; no new implicit knowledge required to complete the task |
| Improvement classification | N/A | N/A for this run (no new readiness improvements introduced) |
| CI / shared checks | CI ran lint/test/build/openapi but no shared contract script | verify.yml calls scripts/verify_repo.sh |
