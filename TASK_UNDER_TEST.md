# Task Under Test

Change ID: CR-NOTIF-01

## Goal

Implement an asynchronous recipe-unavailability notification in the Inventory service.

Whenever the available stock of an item decreases, evaluate every recipe that uses that item. If a recipe transitions from preparable to non-preparable, publish the logical event `Inventario.Receta.NoDisponible` through the inventory messaging conventions, including the affected plate and the limiting ingredient(s).

Do not publish when:

- the recipe remains preparable,
- the item is not used by any registered recipe, or
- the recipe was already unavailable before the stock reduction.

Observe stock reductions through the existing item-stock update flow. Consuming `Ordenes.Orden.Servida` events, creating a stock-movement entity, and implementing FEFO consumption are out of scope for this change.

## Requirements Covered

- RF-NOTIF-01: Evaluate recipes that use an item when its available stock decreases.
- RF-NOTIF-02: Emit `Inventario.Receta.NoDisponible` when a recipe transitions to non-preparable.
- RF-NOTIF-03: Identify the affected plate, limiting ingredients, and timestamp.
- RF-NOTIF-04: Emit one event per affected plate when several recipes share the item.
- RF-NOTIF-05: Do not emit when the recipe remains preparable or the item has no recipe.
- RF-NOTIF-06: Publish asynchronously without blocking the stock operation.
- RF-NOTIF-07: Avoid repeated notifications while the recipe remains unavailable.
- RF-EVT-03: Keep the service and business operation working when the broker is unavailable.
- RF-EVT-05: Retry/backoff is a known gap; this change must at least not block or lose the business operation.

Acceptance scenarios are derived from `docs/REQUIREMENTS.md` §5.10 and `docs/SPEC.md` §10.2.

## Verification

Provide executable evidence for these scenarios:

- AC-01 (transition to unavailable): a recipe that was preparable becomes non-preparable after an item stock reduction, and one event is published with the plate and limiting ingredient(s).
- AC-02 (no recipe impact): reducing stock of an item that belongs to no recipe publishes no unavailability event.
- AC-03 (multiple recipes): one item shared by several recipes produces one event per recipe that lost preparability.
- AC-04 (still sufficient): a stock reduction that leaves enough stock publishes no event.
- AC-05 (no duplicates): a second reduction while the recipe is already unavailable publishes no additional event.
- AC-06 (broker unavailable): a publish failure is logged and does not fail the stock operation.

Reference test cases: TC-12-01 through TC-12-05.

Commands:

- `npm run lint`
- `npm test`
- `npm run build`
- If `scripts/verify_repo.sh` exists, run it as the repository verification contract.

## Constraints

- Use `docs/REQUIREMENTS.md` and `docs/SPEC.md` as the source of truth.
- Keep changes scoped to this task.
- Do not redefine requirements in this file.
- Do not add an Orders consumer, stock-movement entity, reservations, outbound FEFO consumption, or new dependencies.
- Follow the existing event conventions instead of creating a parallel contract.
- Do not modify generated artifacts, secrets, or environment files.

## Non-Goals

- Consuming `Ordenes.Orden.Servida`.
- Persisting an auditable stock-movement history.
- Implementing reservation lifecycle or FEFO consumption.
- Adding a full retry/backoff and dead-letter infrastructure.
