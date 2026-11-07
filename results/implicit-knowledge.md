# Implicit Knowledge Found

## IK-01
- **What:** Item stock changes emit events through `ItemChangeEmitter` and are consumed by `RecipeService.publishAvailabilityForItem`.
- **How was it discovered:** Searched for `ITEM_CHANGED_EVENT`, read `item.service.ts`, `item-change.emitter.ts`, and `recipe.service.ts`.
- **Should this remain implicit?** NO
- **Where should it become explicit?** `AGENTS.md` / `docs/REPO_MAP.md` / `ARCHITECTURE.md`
- **Risk:** Agent might look for an Orders consumer or a generic "stock movement" service that does not exist.

## IK-02
- **What:** The routing key for recipe unavailability follows the repository convention (`inventory.*`) rather than the Spanish literal used in the task.
- **How was it discovered:** Read `src/broker/event-conventions.ts` and existing usage of `inventory.recipe.availability-changed`.
- **Should this remain implicit?** NO
- **Where should it become explicit?** `AGENTS.md` / `docs/SPEC.md` / `docs/REPO_MAP.md`
- **Risk:** Agent could emit events with the literal `Inventario.Receta.NoDisponible` and break the messaging contract.

## IK-03
- **What:** The task references `RF-12` / `TASK-12`, but those IDs do not exist in `docs/REQUIREMENTS.md`. Valid IDs are `RF-NOTIF-01..07` in §5.10.
- **How was it discovered:** Grepped for `RF-12` and compared with `docs/REQUIREMENTS.md`.
- **Should this remain implicit?** NO
- **Where should it become explicit?** `TASKS.md` / `AGENTS.md`
- **Risk:** Agent might invent or rename requirements instead of mapping to existing ones.

## IK-04
- **What:** RabbitMQ is optional (`RABBITMQ_ENABLED=false` support). Publish/consume failures are logged and must not block business operations.
- **How was it discovered:** Read `EventPublisher`, `EventConsumer`, `RecipeService.publishAvailabilityChanged`, and existing tests.
- **Should this remain implicit?** NO
- **Where should it become explicit?** `AGENTS.md` / `docs/REPO_MAP.md`
- **Risk:** Agent could throw exceptions on broker failures or add hard dependencies.

## IK-05
- **What:** Deduplication of "already unavailable" notifications is not stored anywhere; it must be inferred and added to avoid repeated events.
- **How was it discovered:** Read `recipe.service.ts` and `docs/SPEC.md` §10.2 (requires avoiding duplicates).
- **Should this remain implicit?** NO
- **Where should it become explicit?** `AGENTS.md` / `ARCHITECTURE.md` (and implemented as a persistent state to be verifiable)
- **Risk:** Agent could emit events on every stock reduction.

## IK-06
- **What:** Orders integration, stock movements, reservations, and FEFO consumption are marked as "Considerado/pendiente" in requirements/spec and not implemented.
- **How was it discovered:** Read `docs/REQUIREMENTS.md` §5.8–§5.9 and `docs/SPEC.md` §8–§9.
- **Should this remain implicit?** NO
- **Where should it become explicit?** `AGENTS.md` / `docs/REPO_MAP.md` / `TASKS.md`
- **Risk:** Agent could scope-creep into large unimplemented features.

## Remediation Plan

| IK | Remediation | Type |
| :-- | :-- | :-- |
| IK-01 | Document trigger in `AGENTS.md`, `docs/REPO_MAP.md`, `ARCHITECTURE.md` | Context/Navigation |
| IK-02 | Document messaging convention in `AGENTS.md` and `docs/REPO_MAP.md` | Context/Navigation |
| IK-03 | Create `TASKS.md` mapping tasks to `RF-*` IDs | Traceability |
| IK-04 | Document optional broker behavior and failure tolerance in `AGENTS.md` | Context |
| IK-05 | Document deduplication rule and show the implemented state field; verify via tests | Guardrail + Test |
| IK-06 | Add non-goals and out-of-scope list in `AGENTS.md` and `docs/REPO_MAP.md` | Context/Navigation |
