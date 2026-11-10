# Pruebas de carga y eventos con k6

Esta carpeta contiene las pruebas de humo, CRUD y eventos de Inventory-Backend.
El código de la aplicación no se modifica: los escenarios se ejecutan contra la
API HTTP y los exchanges de RabbitMQ.

## Estructura

```text
tests/k6/
  api/       Escenarios HTTP (smoke, CRUD, reservas, carga mixta)
  events/    Escenarios de mensajería (menú, órdenes, eventos salientes)
  config/    Variables de entorno y opciones/thresholds de k6
  lib/       Helpers HTTP, datos, setup y AMQP
  out/       Resúmenes JSON generados por k6 (ignorados por Git)
```

## Inicio rápido (Docker Compose, recomendado)

En macOS no hace falta instalar k6 ni Go. Los scripts usan Docker y la imagen
definida en `tests/k6/Dockerfile`.

```bash
npm run k6:smoke
```

Ese comando:

1. Levanta `db`, `app` y `rabbitmq` con `compose.yaml` + `compose.loadtest.yaml`.
2. Construye la imagen de k6 con la extensión AMQP.
3. Ejecuta `tests/k6/api/smoke.js` y guarda el resumen en `tests/k6/out/`.

Si los puertos `5672`/`15672` ya están ocupados en tu máquina, exporta:

```bash
export RABBITMQ_HOST_PORT=5673
export RABBITMQ_MANAGEMENT_HOST_PORT=15673
```

Suites disponibles:

```bash
npm run k6:smoke    # Humo HTTP
npm run k6:api      # Smoke + CRUD + reservas + carga mixta (~90 s)
npm run k6:events   # Eventos de menú, órdenes y eventos salientes
npm run k6:all      # Todo lo anterior
```

También puedes ejecutar una suite o un archivo concreto:

```bash
./scripts/k6/run.sh api
./scripts/k6/run.sh events
./scripts/k6/run.sh api/smoke.js
K6_RESET_DB=true ./scripts/k6/run.sh all
```

Para no volver a ejecutar `docker compose up` en cada corrida:

```bash
K6_COMPOSE_UP=false ./scripts/k6/run.sh api
```

## k6 nativo (Linux o macOS con Go)

```bash
npm run k6:build

export K6_BASE_URL=http://localhost:8083
export K6_RABBITMQ_URL=amqp://admin:supersecurepassword@localhost:5672
./scripts/k6/run.sh smoke
```

`scripts/k6/build.sh` usa `xk6` si ya está instalado; si no, intenta instalarlo
con Go. Como último recurso construye con Docker (en macOS genera un binario
Linux llamado `bin/k6-linux`, que no se ejecuta de forma nativa).

## Variables de entorno

| Variable | Default | Uso |
| --- | --- | --- |
| `K6_BASE_URL` | `http://localhost:8083` | URL base de la API para k6 nativo |
| `K6_RABBITMQ_URL` | `amqp://admin:supersecurepassword@localhost:5672` | AMQP para eventos |
| `K6_RESET_DB` | `false` | Reinicia la BD antes de cada suite (destructivo) |
| `K6_AUTH_TOKEN` | vacío | Envía `Authorization: Bearer <token>` si se define |
| `K6_POLL_TIMEOUT_MS` | `10000` | Espera máxima de asincronía |
| `K6_POLL_INTERVAL_MS` | `250` | Intervalo de polling |
| `K6_HTTP_P95_MS` | `500` | Threshold HTTP p95 |
| `K6_HTTP_P99_MS` | `1000` | Threshold HTTP p99 |
| `K6_MAX_ERROR_RATE` | `0.01` | Threshold de errores HTTP (1%) |
| `K6_EVENT_P95_MS` | `2000` | Threshold de procesamiento de eventos |

En Docker Compose, `K6_BASE_URL` y `K6_RABBITMQ_URL` se fuerzan a los nombres de
servicio (`app` y `rabbitmq`). En modo nativo se leen de tu shell.

`K6_RESET_DB=true` llama a `DELETE /apo/test/reset`. Ese endpoint solo existe en
`development`/`qa` y borra la base de datos. No lo uses contra producción.

El endpoint usa `dropDatabase()`, que también elimina los índices únicos. En modo
Docker, `scripts/k6/run.sh` limpia la BD y reinicia `app` al inicio y después de
cada archivo para recrear los índices antes de las suites que validan conflictos
(`409`). En modo nativo, reinicia la app manualmente después de un reset antes de
ejecutar `items-crud` o `suppliers-crud`.

## Escenarios

### HTTP

- `api/smoke.js`: health, listados y resumen de reservas.
- `api/items-crud.js`: crear, buscar, obtener, actualizar, duplicado (409),
  validación (400), baja lógica (404).
- `api/suppliers-crud.js`: CRUD completo y duplicado.
- `api/batches-crud.js`: creación, sincronización de stock, ajuste, borrado y
  item inexistente.
- `api/recipes-crud.js`: creación idempotente, disponibilidad, costo, filtros,
  validación y borrado.
- `api/reservations-read.js`: listado, filtros, resumen y 404.
- `api/mixed-workload.js`: escenario de lectura por tasa de llegada y escritura
  con VUs en rampa. Es el escenario que estresa la API.

### Eventos

- `events/menu-plate.js`: publica `menu.source.created/updated/deleted` en
  `menu.topic` y verifica la receta por HTTP.
- `events/orders-reservation.js`: publica `ordenes.order.created/confirmed/
  cancelled` en `ordenes.topic`, verifica reservas, idempotencia por `eventId`
  y rechazo por stock insuficiente.
- `events/outbound-events.js`: declara colas temporales, se enlaza a
  `inventory.topic` y verifica que la app publique eventos de reserva y de
  disponibilidad.

## Notas de mensajería

- El contrato vigente usa `menu.source.*` (no `menu.plate.*`). La fuente de
  verdad es `src/broker/event-conventions.ts`.
- La extensión `github.com/grafana/xk6-amqp` está archivada. La imagen pinea
  `k6 v0.45.1` y `xk6-amqp v0.4.1`; si actualizas k6, valida primero que la
  extensión compile.
- En `xk6-amqp`, al publicar a un exchange el campo `queue_name` se usa como
  routing key. El helper `lib/amqp.js` lo encapsula.
- `Amqp.listen` de la extensión ejecuta el consumidor en una goroutine y cierra
  su canal al retornar. Por eso los escenarios de eventos usan `vus: 1` y
  `lib/amqp.js` conserva un buffer por cola y reintenta la escucha
  (`listenUntil`) hasta recibir el mensaje esperado.
- Las colas de `outbound-events.js` son únicas por corrida y se eliminan al
  final. No usan auto-delete para sobrevivir a los reintentos de `listen`. Si el
  escenario falla antes de limpiar, puedes borrarlas desde la consola de
  RabbitMQ (`http://localhost:15672`).

## Thresholds

- HTTP: `p95 < 500 ms`, `p99 < 1000 ms`, errores `< 1%`, checks `> 99%`.
- Eventos: `event_processing_ms p95 < 2000 ms`.
- Los valores se pueden ajustar con las variables `K6_*` sin tocar el código.

## Limitaciones conocidas

- Las pruebas asumen un entorno de desarrollo/qa con datos descartables.
- `ordenes.order.served` no está implementado en este repositorio; no se prueba.
- Si ejecutas eventos con más de una VU, el listener AMQP puede consumir
  mensajes de forma no determinista. Mantén `vus: 1`.
- Algunos fallos de aserción dejan datos creados (items inactivos, lotes,
  recetas). Usa `K6_RESET_DB=true` para limpiar entre corridas.

## Limpieza

```bash
docker compose -f compose.yaml -f compose.loadtest.yaml down
```

Añade `-v` si también quieres borrar los volúmenes de MongoDB y RabbitMQ.
