# SPEC — Inventory Backend

## 1. Resumen

Inventory Backend es un microservicio NestJS responsable del inventario del restaurante: catálogo de items, proveedores, lotes, recetas, disponibilidad de platillos, stock, movimientos y reservas. Persiste en MongoDB y se integra de forma asíncrona con los microservicios de Menú y Órdenes mediante RabbitMQ. En producción se expone únicamente a través del API Gateway.

Este documento describe la arquitectura, los módulos, los contratos generales y las decisiones de diseño. Los detalles finos de implementación se definirán en especificaciones posteriores.

## 2. Arquitectura general

```text
Frontend
   |
   v
API Gateway (autenticación, autorización, enrutamiento)
   |
   v
Inventory Backend (NestJS)
   |            \
   |             \--> RabbitMQ <--> Menú
   |                        ^
   |                        |
   |                     Órdenes
   v
MongoDB
```

### Principios

- Arquitectura modular por dominio.
- API HTTP para operaciones administrativas y de consulta.
- Eventos asíncronos para integración entre microservicios.
- MongoDB como fuente de verdad del inventario.
- RabbitMQ como transporte de eventos, no como fuente de verdad.
- El servicio debe operar aunque el broker no esté disponible.
- La autenticación y los permisos provienen del API Gateway.
- Las operaciones que afectan stock deben ser idempotentes, auditables y consistentes.

## 3. Stack y runtime

| Elemento          | Tecnología / versión                                 |
| ----------------- | ---------------------------------------------------- |
| Runtime           | Node.js según `.nvmrc`                               |
| Framework         | NestJS 12                                            |
| Persistencia      | MongoDB 7.0 mediante Mongoose 8 y `@nestjs/mongoose` |
| Mensajería        | RabbitMQ mediante `amqplib`                          |
| Validación        | `class-validator` y `class-transformer`              |
| Documentación API | `@nestjs/swagger` y OpenAPI 3.0                      |
| Pruebas           | Vitest, Supertest y MongoDB para e2e                 |
| Calidad           | Oxlint, Prettier, Husky, Commitlint y SonarQube      |
| Contenedores      | Docker y Docker Compose                              |

## 4. Estructura de módulos

### 4.1 Módulos actuales

| Módulo            | Responsabilidad                                                     |
| ----------------- | ------------------------------------------------------------------- |
| `AppModule`       | Composición raíz de la aplicación.                                  |
| `DatabaseModule`  | Conexión a MongoDB y observabilidad de eventos de conexión.         |
| `BrokerModule`    | Conexión, publicación y consumo de eventos en RabbitMQ.             |
| `ItemsModule`     | Catálogo de items, stock, estado, búsqueda y eventos de cambio.     |
| `BatchModule`     | Lotes, vencimientos, stock y costo promedio.                        |
| `SuppliersModule` | Catálogo de proveedores.                                            |
| `RecipeModule`    | Recetas, disponibilidad, porciones, costo y publicación de eventos. |
| `TestModule`      | Reset de base de datos restringido a dev/QA.                        |

### 4.2 Dominios considerados

| Dominio                    | Responsabilidad esperada                                                             |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Autenticación/Autorización | Validación del token del gateway y verificación de permisos.                         |
| Movimientos                | Registro auditable de entradas, salidas, ajustes, consumos, mermas y compensaciones. |
| Reservas                   | Compromiso temporal de stock para órdenes.                                           |
| Integración con Órdenes    | Consumo de eventos de órdenes para reservar, consumir, liberar y ajustar stock.      |
| FEFO                       | Selección de lotes por vencimiento más próximo en toda salida.                       |
| Notificaciones             | Evaluación de impacto y emisión de `Inventario.Receta.NoDisponible`.                 |

## 5. Modelo de dominio

### 5.1 Entidades actuales

| Entidad      | Propósito                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `Item`       | Ingrediente o insumo con SKU, nombre, categoría, unidad, stock mínimo, costo y stock total/reservado. |
| `Batch`      | Lote de un item con cantidad, cantidad inicial, vencimiento, costo, proveedor y estado.               |
| `Supplier`   | Proveedor con datos de contacto.                                                                      |
| `Recipe`     | Receta de un platillo identificada por `plateId`, compuesta por items y cantidades requeridas.        |
| `RecipeItem` | Relación item-cantidad dentro de una receta.                                                          |

### 5.2 Entidades consideradas

| Entidad            | Propósito                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `StockMovement`    | Movimiento auditable de stock con tipo, cantidad, lote, origen, referencia externa y actor. |
| `StockReservation` | Reserva de stock asociada a una orden o referencia externa, con estado y vigencia.          |
| `ProcessedEvent`   | Registro de eventos procesados para garantizar idempotencia.                                |

### 5.3 Reglas de stock

- `availableStock = max(0, totalStock - reservedStock)`.
- `totalStock` se deriva de lotes válidos y no vencidos.
- `reservedStock` se deriva de reservas activas.
- Las salidas descuentan de lotes aplicando FEFO.
- Los lotes vencidos no son utilizables.
- Todo cambio de stock debe poder explicarse mediante movimientos.

## 6. API HTTP

### 6.1 Convenciones

- Base path: raíz del servicio; en producción el gateway antepone su prefijo.
- Formato: JSON.
- Validación global con `whitelist`, `forbidNonWhitelisted` y `transform`.
- Documentación interactiva en `/api` y documento JSON en `/api-json`.
- OpenAPI generado en `openapi.yml` para releases.
- Autenticación esperada: token del API Gateway.
- Autorización esperada: permisos por recurso y acción.

### 6.2 Recursos actuales

| Recurso           | Operaciones                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `/`               | Health básico.                                                              |
| `/items`          | Crear, listar, buscar, obtener, actualizar y desactivar.                    |
| `/batches`        | Crear, listar, obtener, actualizar y eliminar.                              |
| `/suppliers`      | Crear, listar, obtener, actualizar y eliminar.                              |
| `/recipes`        | Registrar/actualizar por `plateId`, listar, obtener, actualizar y eliminar. |
| `/apo/test/reset` | Reset de base de datos en dev/QA.                                           |

El contrato detallado de cada endpoint se mantiene en `openapi.yml` y en los DTOs de cada módulo.

### 6.3 Recursos considerados

| Recurso                  | Propósito                                                                     |
| ------------------------ | ----------------------------------------------------------------------------- |
| `/movements`             | Consulta de movimientos de inventario.                                        |
| `/reservations`          | Consulta y administración de reservas.                                        |
| Endpoints de integración | Operaciones internas invocadas por otros servicios, si el diseño lo requiere. |

### 6.4 Códigos de error esperados

| Código | Uso                                                  |
| ------ | ---------------------------------------------------- |
| `400`  | Datos inválidos o solicitud incompleta.              |
| `401`  | Token ausente, inválido o vencido.                   |
| `403`  | Token válido sin permisos suficientes.               |
| `404`  | Recurso no encontrado.                               |
| `409`  | Conflicto de unicidad o de estado.                   |
| `422`  | Operación válida pero no aplicable al estado actual. |
| `500`  | Error interno no controlado.                         |

## 7. Autenticación y autorización

### 7.1 Modelo

- El API Gateway autentica al usuario y emite o reenvía un token firmado.
- Inventario valida el token y extrae identidad, roles y permisos.
- Inventario no emite tokens ni gestiona sesiones.
- La autorización se evalúa por operación y recurso.

### 7.2 Reglas

- Sin token válido: `401`.
- Token válido sin permiso: `403`.
- Los permisos deben cubrir lectura y escritura por dominio.
- Las operaciones sensibles deben registrar al actor responsable.
- Los eventos internos deben validar origen o confianza según el contrato.
- El endpoint de reset permanece bloqueado fuera de dev/QA.

### 7.3 Decisiones pendientes

- Formato exacto del token y mecanismo de validación.
- Catálogo de permisos y su nomenclatura.
- Tratamiento de identidades de servicio a servicio.

## 8. Mensajería y eventos

### 8.1 Convención actual

- Routing key: `<microservicio>.<entidad>.<accion>`.
- Exchanges de tipo `topic` y durables.
- Un exchange por microservicio publicador.
- Una cola por dominio suscriptor dentro de Inventario.

### 8.2 Integración actual con Menú

| Elemento           | Valor                                                            |
| ------------------ | ---------------------------------------------------------------- |
| Exchange consumido | `menu.topic`                                                     |
| Eventos consumidos | `menu.plate.created`, `menu.plate.updated`, `menu.plate.deleted` |
| Cola de recetas    | `cola_recipe_events`                                             |
| Exchange publicado | `inventory.topic`                                                |
| Evento publicado   | `inventory.recipe.availability-changed`                          |
| Cola de items      | `cola_item_events`                                               |
| Cola de lotes      | `cola_batch_events`                                              |

### 8.3 Integración considerada con Órdenes

Órdenes será el microservicio que solicite apartar, consumir, liberar o ajustar stock. Inventario debe consumir sus eventos en una cola propia del dominio.

| Aspecto                | Definición general                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Exchange esperado      | Un exchange propio de Órdenes, por confirmar.                                                      |
| Eventos esperados      | Creación de orden, reserva solicitada, orden servida/consumida, cancelación, liberación y ajustes. |
| Cola de Inventario     | Cola exclusiva para eventos de órdenes.                                                            |
| Idempotencia           | Por identificador único de orden y de operación.                                                   |
| Orden de procesamiento | Debe tolerarse reentrega y, cuando aplique, eventos fuera de orden.                                |
| Respuesta              | Inventario debe publicar el resultado o error de negocio que Órdenes necesite conocer.             |

Los nombres definitivos de exchanges, routing keys y payloads deben acordarse y versionarse antes de implementar la integración.

### 8.4 Envelope de evento considerado

Todo evento debería incluir, como mínimo:

- Identificador del evento.
- Tipo o routing key.
- Versión del contrato.
- Marca de tiempo.
- Identificador de correlación.
- Referencia externa de la orden o platillo.
- Payload específico del evento.

### 8.5 Procesamiento

- Los mensajes se confirman (`ack`) solo después de aplicar el efecto de negocio.
- Los errores definitivos se rechazan sin reencolar para evitar bucles.
- Los errores transitorios deben reintentarse con backoff.
- Los mensajes agotados deben enviarse a una cola de mensajes fallidos.
- Los consumidores deben ser idempotentes.
- La caída del broker no debe impedir el arranque ni las operaciones HTTP.

## 9. Movimientos, reservas y FEFO

### 9.1 Movimientos

Los movimientos son el registro auditable de todo cambio de stock. Deben permitir explicar el estado actual del inventario y reconstruir su historial.

Tipos considerados:

- Entrada por lote o compra.
- Salida por consumo de orden.
- Reserva y liberación de stock.
- Ajuste manual positivo o negativo.
- Merma por vencimiento o pérdida.
- Compensación por corrección.

Reglas generales:

- Un movimiento no se edita; se compensa.
- Todo movimiento debe tener origen y referencia.
- Un evento repetido no debe generar un movimiento repetido.
- Ningún movimiento puede dejar stock negativo.

### 9.2 Reservas

Una reserva compromete stock sin consumirlo. Debe poder:

- Crearse a partir de una orden.
- Consultarse por orden o referencia externa.
- Confirmarse y convertirse en consumo.
- Liberarse por cancelación.
- Expirar según la política acordada con Órdenes.

La reserva afecta `reservedStock`; el consumo afecta lotes y `totalStock`.

### 9.3 FEFO

Toda salida de inventario debe seleccionar lotes válidos ordenados por fecha de vencimiento ascendente. Los lotes vencidos se excluyen. Ante empate de fecha, debe existir un criterio determinista.

El vencimiento de un lote debe reflejarse en el stock disponible y generar el movimiento o merma correspondiente.

## 10. Disponibilidad de recetas y notificaciones

### 10.1 Cálculo actual

- Una receta es preparable si todos sus items tienen stock disponible suficiente para al menos una porción.
- El máximo de porciones se calcula con el mínimo de `floor(stockDisponible / cantidadRequerida)`.
- El costo de producción se calcula con la suma de `cantidadRequerida * costoPromedio`.
- La disponibilidad se recalcula al cambiar un item o una receta.
- Los cambios se publican como `inventory.recipe.availability-changed`.

### 10.2 Notificación proactiva considerada

Cuando una reducción de stock haga que una receta pase de preparable a no preparable, Inventario debe emitir `Inventario.Receta.NoDisponible` con:

- Platillo afectado.
- Ingredientes limitantes.
- Marca de tiempo.
- Referencia de correlación cuando aplique.

La evaluación debe limitarse a las recetas que usan el item afectado, no debe emitirse si la receta sigue siendo preparable y debe evitar duplicados mientras la receta permanezca no disponible.

## 11. Configuración

| Variable                       | Propósito                                          |
| ------------------------------ | -------------------------------------------------- |
| `MONGODB_URI` / `DATABASE_URL` | Conexión a MongoDB.                                |
| `PORT`                         | Puerto HTTP local del servicio.                    |
| `NODE_ENV`                     | Ambiente: `development`, `qa` o `production`.      |
| `FRONTEND_URL`                 | Orígenes permitidos por CORS, separados por comas. |
| `RABBITMQ_URL`                 | Conexión a RabbitMQ.                               |
| `RABBITMQ_ENABLED`             | Permite deshabilitar el broker explícitamente.     |
| `MONGO_INITDB_*`               | Credenciales y base inicial de MongoDB en Compose. |
| `APP_HOST_PORT`                | Puerto publicado por Compose en desarrollo.        |
| `APP_VERSION`                  | Versión mostrada en OpenAPI y releases.            |

### Ambientes

- **Desarrollo:** app y MongoDB en Compose; app publicada en el host; sin red del gateway.
- **Producción:** app conectada a la red externa del gateway con alias `inventory-backend`; sin puertos publicados; MongoDB tampoco se publica.

## 12. Observabilidad

- Logs de conexión, desconexión y error de MongoDB y RabbitMQ.
- Logs de eventos publicados y consumidos.
- Logs de errores de negocio con contexto.
- Trazabilidad por orden, evento, item, lote y movimiento.
- Healthcheck HTTP para el orquestador.
- Métricas y trazas pueden incorporarse sin cambiar los contratos de dominio.

## 13. Pruebas

| Nivel       | Alcance                                                              |
| ----------- | -------------------------------------------------------------------- |
| Unitarias   | Servicios, DTOs, esquemas, guards, convenciones y manejo de eventos. |
| Integración | Conexión a MongoDB y comportamiento del broker.                      |
| e2e         | API HTTP contra una base de datos de prueba.                         |
| Contratos   | Validación de payloads de eventos y compatibilidad entre servicios.  |

Comandos principales:

```bash
npm run lint
npm run test
npm run test:cov
npm run test:e2e
npm run build
npm run openapi:generate
```

## 14. CI, releases y despliegue

- CI ejecuta lint, pruebas con cobertura, build, generación de OpenAPI y análisis en SonarQube.
- Los tags `v*.*.*` generan un release con notas y `openapi.yml`.
- Husky ejecuta pruebas antes del commit y Commitlint valida el mensaje.
- Docker Compose define los ambientes de desarrollo y producción.
- El servicio se publica en el puerto interno `8083` cuando corre en contenedor.

## 15. Estado actual y decisiones abiertas

### Implementado

- CRUD de items, lotes, proveedores y recetas.
- Baja lógica de items.
- Cálculo de stock disponible, estado, disponibilidad, porciones y costo.
- Sincronización de stock y costo desde lotes.
- Consumo de eventos de Menú y publicación de disponibilidad.
- Broker opcional.
- API documentada, validación global y CORS.
- Reset restringido por ambiente.
- Pruebas, lint y CI.

### Considerado, no implementado

- Validación del token del gateway y permisos.
- Integración con Órdenes.
- Movimientos de inventario.
- Reservas y su ciclo de vida.
- FEFO y vencimiento automático de lotes.
- Notificación proactiva de indisponibilidad.
- Reintentos con backoff y cola de mensajes fallidos.
- Idempotencia persistente de eventos.
- Formato uniforme de errores.

### Decisiones abiertas

- Contrato definitivo de eventos entre Órdenes e Inventario.
- Mecanismo de validación del token y catálogo de permisos.
- Política de expiración de reservas.
- Estrategia de consistencia entre MongoDB y RabbitMQ.
- Necesidad de un outbox o patrón equivalente para publicación confiable.
- Versión y evolución de los contratos de eventos.
