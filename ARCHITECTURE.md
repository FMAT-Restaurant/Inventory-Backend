# Architecture

## Overview

Inventory Backend is a NestJS microservice for restaurant inventory. It persists to MongoDB via Mongoose and integrates asynchronously with Menu and Orders via RabbitMQ. In production it is exposed through the API Gateway.

## Module Boundaries

| Layer | Location | Responsibility | Allowed Dependencies |
| --- | --- | --- | --- |
| App | `src/app.*`, `src/main.ts` | Bootstrap and composition | Modules, database, common NestJS |
| Database | `src/database/` | MongoDB connection lifecycle | Mongoose, config |
| Broker | `src/broker/` | Messaging infrastructure | `amqplib`, NestJS common |
| Item | `src/modules/item/` | Catalog and stock/cost updates | Supplier service, Mongoose, broker (for events), NestJS common |
| Batch | `src/modules/batch/` | Batches and synchronization | Item service, Supplier service, Mongoose |
| Recipe | `src/modules/recipe/` | Recipes and availability | Item service, ItemChangeEmitter, broker publisher, Mongoose |
| Supplier | `src/modules/suppliers/` | Suppliers | Mongoose |

## Dependency Rules

- Modules must not create circular dependencies. Use `ItemChangeEmitter` for in-process reactions (Item → Recipe) instead of direct circular imports.
- Services call other domain services through injection; avoid reaching into internal state of other modules.
- Broker is optional. Publishers/consumers must handle connection failures without blocking business operations.
- DTOs and schemas are local to modules; shared contracts live in `src/broker/event-conventions.ts` or module DTOs.

## Event Flow

1. `ItemService.updateStockAndCost` or batch sync updates item stock/cost and emits `ITEM_CHANGED_EVENT` via `ItemChangeEmitter`.
2. `RecipeService` listens and recomputes availability for affected recipes.
3. On transition `preparable → non-preparable`, `RecipeService` publishes `inventory.recipe.not-available` to `inventory.topic`.
4. `RecipeService.registerOrUpdate` and `remove` publish `inventory.recipe.availability-changed` to reflect current state.
5. `RecipeEvents` consumes menu plate events to create/update recipes.

## Protected Zones

Do not edit without explicit task approval:

- `dist/` - Build artifacts
- `openapi.yml` - Generated OpenAPI specification
- `node_modules/` - Dependencies
- `src/generated/` - Generated sources
- `*.tsbuildinfo` - TypeScript build cache
- `.env` - Local secrets (use `.env.example`)

## Configuration

See `docs/SPEC.md` §11 for environment variables. The service must start without RabbitMQ and without requiring external services beyond MongoDB for HTTP routes where applicable.

## Messaging Conventions

- Routing keys: `<microservice>.<entity>.<action>`
- Exchanges: topic, durable
- One exchange per publisher
- Broker failures must not crash the app or block business operations
- Messages should be acked only after successful processing; transient errors may be retried
