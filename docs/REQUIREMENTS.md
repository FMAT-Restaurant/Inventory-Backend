# REQUIREMENTS — Inventory Backend

## 1. Propósito

Este documento define los requisitos funcionales y no funcionales del microservicio de Inventario del sistema de restaurante. Describe el comportamiento esperado del servicio, sus límites, las integraciones con otros microservicios y las reglas de negocio que deben cumplirse.

El documento cubre tanto lo que ya está implementado como las capacidades que el microservicio debe incorporar. Las capacidades no implementadas se identifican explícitamente en la sección de estado de implementación.

## 2. Alcance

### 2.1 Incluido

- Catálogo de items (ingredientes e insumos).
- Gestión de lotes y existencias.
- Gestión de proveedores.
- Registro de recetas y cálculo de disponibilidad de platillos.
- Control de stock total, reservado y disponible.
- Movimientos de inventario y reservas originados por órdenes.
- Descuento de stock por consumo, ajustes y vencimientos.
- Política FEFO (First Expired, First Out) para salidas de inventario.
- Notificación proactiva de indisponibilidad de recetas.
- Consumo y publicación de eventos mediante el message broker.
- Validación de identidad y permisos a partir del token emitido por el API Gateway.
- Exposición de API HTTP documentada con OpenAPI.
- Persistencia en MongoDB.
- Operación en ambientes de desarrollo, QA y producción.

### 2.2 Excluido

- Emisión del token de autenticación. El token lo emite o valida el API Gateway; Inventario solo lo consume y valida.
- Administración del ciclo de vida de las órdenes. Es responsabilidad del microservicio de Órdenes.
- Administración del menú y de los platillos. Es responsabilidad del microservicio de Menú.
- Procesamiento de pagos, facturación y clientes.
- Aprovisionamiento de infraestructura, orquestación y monitoreo de la plataforma.

## 3. Actores y sistemas externos

| Actor / Sistema       | Relación con Inventario                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| Frontend              | Consume la API HTTP para consultar y administrar inventario.                            |
| API Gateway           | Punto de entrada, autenticación y control de acceso. Publica el servicio en producción. |
| Microservicio Menú    | Publica eventos de creación, actualización y eliminación de platillos.                  |
| Microservicio Órdenes | Publica eventos de órdenes que originan reservas, consumos, liberaciones y ajustes.     |
| RabbitMQ              | Transporte de eventos entre microservicios.                                             |
| MongoDB               | Persistencia de items, lotes, proveedores, recetas, movimientos y reservas.             |
| Operación / DevOps    | Despliegue, configuración, monitoreo y diagnóstico del servicio.                        |

## 4. Glosario

| Término          | Definición                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Item             | Ingrediente o insumo inventariable. Puede ser perecedero o no.                                      |
| Lote             | Cantidad de un item recibida con una fecha de vencimiento y un costo unitario.                      |
| Receta           | Composición de un platillo: lista de items y cantidades requeridas por porción.                     |
| Platillo         | Producto del menú identificado por `plateId`.                                                       |
| Stock total      | Suma de existencias válidas de los lotes de un item.                                                |
| Stock reservado  | Cantidad comprometida para órdenes que aún no han sido servidas o confirmadas.                      |
| Stock disponible | `max(0, stock total - stock reservado)`. Es el stock utilizable para nuevas reservas o preparación. |
| Movimiento       | Registro auditable de una entrada, salida, ajuste, reserva, liberación o consumo de stock.          |
| Reserva          | Compromiso temporal de stock para una orden o platillo antes de su consumo definitivo.              |
| FEFO             | First Expired, First Out: consumir primero los lotes con vencimiento más próximo.                   |
| Evento           | Mensaje asíncrono publicado o consumido a través de RabbitMQ.                                       |
| Token de gateway | Credencial emitida por el API Gateway que identifica al usuario y sus permisos.                     |
| Permiso          | Autorización concreta que habilita una operación sobre un recurso.                                  |

## 5. Requisitos funcionales

La columna **Estado** indica si la capacidad está implementada (`Implementado`), parcialmente implementada (`Parcial`) o considerada para el servicio pero aún no implementada (`Considerado`).

### 5.1 Autenticación y autorización

| ID        | Requisito                                                                                                                               | Estado       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| RF-AUT-01 | Inventario debe recibir el token emitido por el API Gateway y validar su autenticidad, vigencia y emisor.                               | Considerado  |
| RF-AUT-02 | Inventario debe extraer del token la identidad del usuario y sus permisos o roles, sin emitir tokens propios.                           | Considerado  |
| RF-AUT-03 | Toda operación HTTP debe autorizarse contra los permisos requeridos por el recurso y la acción.                                         | Considerado  |
| RF-AUT-04 | Las solicitudes sin token válido deben rechazarse con `401`; las solicitudes autenticadas sin permiso deben rechazarse con `403`.       | Considerado  |
| RF-AUT-05 | Los eventos internos deben validar su origen o utilizar un mecanismo de confianza equivalente cuando transporten operaciones sensibles. | Considerado  |
| RF-AUT-06 | El endpoint de pruebas debe permanecer restringido por ambiente y no debe quedar expuesto en producción.                                | Implementado |

### 5.2 Catálogo de items

| ID         | Requisito                                                                                                                                                  | Estado       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| RF-ITEM-01 | El sistema debe permitir crear items con SKU y nombre únicos, categoría, unidad de medida, stock mínimo, condición de almacenamiento y proveedor sugerido. | Implementado |
| RF-ITEM-02 | El sistema debe permitir consultar items activos y buscar por nombre con coincidencia parcial sin distinguir mayúsculas.                                   | Implementado |
| RF-ITEM-03 | El sistema debe permitir actualizar parcialmente un item activo y rechazar actualizaciones sin campos.                                                     | Implementado |
| RF-ITEM-04 | La eliminación de un item debe ser lógica: el registro se conserva inactivo y deja de aparecer en consultas normales.                                      | Implementado |
| RF-ITEM-05 | El sistema debe calcular y exponer `availableStock = max(0, totalStock - reservedStock)`.                                                                  | Implementado |
| RF-ITEM-06 | El sistema debe clasificar el stock de un item como `OPTIMO`, `BAJO` o `CRITICO` según el stock disponible y el stock mínimo.                              | Implementado |
| RF-ITEM-07 | El stock total y el costo promedio deben mantenerse consistentes con los lotes válidos del item.                                                           | Implementado |
| RF-ITEM-08 | El stock total y reservado nunca deben ser negativos.                                                                                                      | Implementado |
| RF-ITEM-09 | Los cambios relevantes de un item deben notificar al dominio de recetas para recalcular la disponibilidad de los platillos afectados.                      | Implementado |

### 5.3 Proveedores

| ID        | Requisito                                                                                             | Estado       |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------ |
| RF-SUP-01 | El sistema debe permitir crear proveedores con nombre único y datos de contacto opcionales.           | Implementado |
| RF-SUP-02 | El sistema debe permitir consultar, actualizar y eliminar proveedores.                                | Implementado |
| RF-SUP-03 | Un proveedor puede estar asociado a items como proveedor sugerido.                                    | Implementado |
| RF-SUP-04 | La eliminación de un proveedor referenciado por un item no debe corromper la integridad del catálogo. | Considerado  |

### 5.4 Lotes y existencias

| ID          | Requisito                                                                                                                    | Estado       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------ |
| RF-BATCH-01 | El sistema debe permitir registrar lotes con item, cantidad, fecha de vencimiento y costo unitario.                          | Implementado |
| RF-BATCH-02 | El número de lote debe ser único por item y puede generarse automáticamente usando el SKU del item.                          | Implementado |
| RF-BATCH-03 | El sistema debe clasificar cada lote como `active`, `expires_today`, `expired` o `depleted`.                                 | Implementado |
| RF-BATCH-04 | Los lotes vencidos o agotados no deben sumar al stock total del item.                                                        | Implementado |
| RF-BATCH-05 | Al crear, actualizar o eliminar un lote, el sistema debe recalcular el stock total y el costo promedio del item.             | Implementado |
| RF-BATCH-06 | El sistema debe permitir consultar lotes por item y obtener un lote por identificador.                                       | Implementado |
| RF-BATCH-07 | El sistema debe actualizar periódicamente el estado de los lotes según la fecha actual, sin depender de una consulta manual. | Considerado  |
| RF-BATCH-08 | El sistema debe registrar como movimiento toda entrada, salida o ajuste derivado de la gestión de lotes.                     | Considerado  |

### 5.5 FEFO

| ID         | Requisito                                                                                                                                     | Estado      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| RF-FEFO-01 | Toda salida de inventario debe consumir primero los lotes con fecha de vencimiento más próxima entre los lotes válidos.                       | Considerado |
| RF-FEFO-02 | Los lotes vencidos no deben ser utilizados para cubrir reservas ni consumos.                                                                  | Considerado |
| RF-FEFO-03 | Cuando un lote vence, el sistema debe retirar su cantidad del stock disponible y registrar el movimiento o merma correspondiente.             | Considerado |
| RF-FEFO-04 | El sistema debe emitir las notificaciones de indisponibilidad que correspondan cuando un vencimiento reduzca la preparabilidad de una receta. | Considerado |
| RF-FEFO-05 | La selección FEFO debe ser determinista ante lotes con la misma fecha de vencimiento.                                                         | Considerado |

### 5.6 Recetas y disponibilidad

| ID           | Requisito                                                                                                                   | Estado       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------ |
| RF-RECIPE-01 | El sistema debe registrar o actualizar una receta de forma idempotente usando `plateId` como identificador funcional.       | Implementado |
| RF-RECIPE-02 | Una receta debe contener al menos un item con cantidad requerida mayor que cero.                                            | Implementado |
| RF-RECIPE-03 | Al registrar o actualizar una receta, todos los items referenciados deben existir en el catálogo.                           | Implementado |
| RF-RECIPE-04 | El sistema debe calcular si una receta es preparable comparando el stock disponible de cada item con la cantidad requerida. | Implementado |
| RF-RECIPE-05 | El sistema debe calcular el máximo de porciones preparables y el costo estimado de producción por porción.                  | Implementado |
| RF-RECIPE-06 | El sistema debe permitir filtrar recetas por disponibilidad.                                                                | Implementado |
| RF-RECIPE-07 | El sistema debe recalcular la disponibilidad de las recetas afectadas cuando cambie el stock de un item.                    | Implementado |
| RF-RECIPE-08 | El cálculo de disponibilidad debe basarse en stock disponible, no en stock total, una vez habilitadas las reservas.         | Implementado |

### 5.7 Movimientos de inventario

| ID        | Requisito                                                                                                                                            | Estado      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| RF-MOV-01 | El sistema debe registrar un movimiento por cada entrada, salida, ajuste, reserva, liberación, consumo o merma que afecte el stock.                  | Considerado |
| RF-MOV-02 | Cada movimiento debe incluir item, lote cuando aplique, cantidad, tipo, origen, referencia externa, fecha y actor o sistema que lo originó.          | Considerado |
| RF-MOV-03 | Los movimientos deben ser auditables y no deben modificarse una vez registrados; las correcciones deben hacerse mediante movimientos compensatorios. | Considerado |
| RF-MOV-04 | El sistema debe impedir que un movimiento de salida deje el stock en negativo.                                                                       | Considerado |
| RF-MOV-05 | Los movimientos originados por eventos deben ser idempotentes: un mismo evento no debe aplicarse dos veces.                                          | Considerado |
| RF-MOV-06 | El sistema debe poder reconstruir o explicar el stock actual a partir de los movimientos y el estado de los lotes.                                   | Considerado |
| RF-MOV-07 | Los ajustes manuales positivos y negativos deben quedar registrados con su motivo y responsable.                                                     | Considerado |

### 5.8 Reservas de stock

| ID        | Requisito                                                                                                                  | Estado      |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | ----------- |
| RF-RES-01 | El sistema debe reservar stock cuando el microservicio de Órdenes solicite apartar ingredientes para una orden o platillo. | Implementado |
| RF-RES-02 | Una reserva debe identificar la orden o referencia externa, los items, las cantidades y su estado.                         | Implementado |
| RF-RES-03 | La reserva debe incrementar el stock reservado sin modificar el stock total ni consumir lotes definitivamente.             | Implementado |
| RF-RES-04 | Una reserva puede confirmarse, consumirse, liberarse o expirar según los eventos recibidos de Órdenes.                     | Parcialmente implementado |
| RF-RES-05 | La liberación o expiración de una reserva debe devolver el stock a disponible de forma consistente.                        | Implementado |
| RF-RES-06 | El consumo de una reserva debe descontar stock de los lotes aplicando FEFO y registrar los movimientos correspondientes.   | Considerado |
| RF-RES-07 | El sistema debe rechazar o reportar reservas que excedan el stock disponible, sin dejar estados parciales inconsistentes.  | Implementado |
| RF-RES-08 | Las reservas deben ser idempotentes respecto a la referencia externa de la orden.                                          | Implementado |

### 5.9 Integración con Órdenes

| ID        | Requisito                                                                                                                                        | Estado      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| RF-ORD-01 | Inventario debe consumir eventos publicados por el microservicio de Órdenes para apartar, consumir, liberar o ajustar stock.                     | Parcialmente implementado |
| RF-ORD-02 | Los eventos de Órdenes deben procesarse de forma asíncrona y tolerante a reintentos sin duplicar efectos.                                        | Parcialmente implementado |
| RF-ORD-03 | El consumo definitivo de stock debe originarse cuando la orden o el platillo se confirme como servido, según el contrato acordado con Órdenes.   | Considerado |
| RF-ORD-04 | La cancelación o rechazo de una orden debe liberar las reservas asociadas.                                                                       | Implementado |
| RF-ORD-05 | Los eventos deben incluir una referencia única e idempotente de la orden y de la operación solicitada.                                           | Implementado |
| RF-ORD-06 | Inventario debe publicar el resultado de las operaciones que Órdenes necesite conocer, al menos cuando una reserva o consumo no pueda aplicarse. | Implementado |
| RF-ORD-07 | Los contratos de eventos entre Inventario y Órdenes deben estar versionados y documentados antes de su implementación.                           | Parcialmente implementado |

### 5.10 Notificación proactiva de indisponibilidad

| ID          | Requisito                                                                                                                  | Estado      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- | ----------- |
| RF-NOTIF-01 | Cada vez que se reduzca el stock disponible de un item, el sistema debe evaluar las recetas que lo utilizan.               | Considerado |
| RF-NOTIF-02 | Si una receta que antes era preparable deja de serlo, el sistema debe emitir el evento `Inventario.Receta.NoDisponible`.   | Considerado |
| RF-NOTIF-03 | El evento debe identificar el platillo afectado, los ingredientes limitantes y la marca de tiempo.                         | Considerado |
| RF-NOTIF-04 | Si varias recetas se ven afectadas por el mismo item, debe emitirse un evento por cada platillo que perdió preparabilidad. | Considerado |
| RF-NOTIF-05 | No debe emitirse el evento si la receta sigue siendo preparable o si el item no pertenece a ninguna receta.                | Considerado |
| RF-NOTIF-06 | Las notificaciones deben emitirse de forma asíncrona y no deben bloquear la operación de negocio que redujo el stock.      | Considerado |
| RF-NOTIF-07 | El sistema debe evitar notificaciones repetidas mientras la receta permanezca no disponible.                               | Considerado |

### 5.11 Eventos y mensajería

| ID        | Requisito                                                                                                                                            | Estado       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| RF-EVT-01 | El sistema debe consumir eventos de Menú para registrar recetas cuando se cree un platillo.                                                          | Implementado |
| RF-EVT-02 | El sistema debe publicar cambios de disponibilidad de recetas en el exchange de inventario.                                                          | Implementado |
| RF-EVT-03 | El sistema debe operar aunque el broker no esté disponible, sin impedir el arranque ni las operaciones de negocio.                                   | Implementado |
| RF-EVT-04 | El sistema debe confirmar (`ack`) los mensajes procesados y rechazar sin reencolar los que fallen de forma definitiva.                               | Implementado |
| RF-EVT-05 | El sistema debe aplicar reintentos con backoff ante fallas transitorias del broker o del procesamiento, y disponer de una cola de mensajes fallidos. | Parcialmente implementado |
| RF-EVT-06 | Los eventos deben incluir metadatos suficientes para trazabilidad e idempotencia.                                                                    | Implementado |
| RF-EVT-07 | El sistema debe poder suscribirse a los eventos de Órdenes en una cola propia del dominio de inventario.                                             | Implementado |

### 5.12 API y operación

| ID        | Requisito                                                                                         | Estado       |
| --------- | ------------------------------------------------------------------------------------------------- | ------------ |
| RF-API-01 | El sistema debe exponer endpoints HTTP para items, lotes, proveedores y recetas.                  | Implementado |
| RF-API-02 | La API debe validar los DTOs, rechazar campos desconocidos y transformar los tipos de entrada.    | Implementado |
| RF-API-03 | La API debe documentarse con OpenAPI y exponer Swagger UI.                                        | Implementado |
| RF-API-04 | El servicio debe exponer un endpoint de salud o respuesta básica para healthchecks.               | Implementado |
| RF-API-05 | El sistema debe permitir el reset de la base de datos únicamente en ambientes de desarrollo o QA. | Implementado |
| RF-API-06 | La API debe aceptar CORS únicamente desde los orígenes configurados.                              | Implementado |
| RF-API-07 | Los errores deben seguir un formato consistente y usar códigos HTTP adecuados.                    | Parcial      |

## 6. Reglas de negocio

1. El stock disponible es siempre `max(0, totalStock - reservedStock)`.
2. El stock total y el stock reservado nunca pueden ser negativos.
3. Un lote vencido o agotado no contribuye al stock total.
4. El costo promedio de un item se calcula con el valor de los lotes válidos y su cantidad.
5. Un item eliminado lógicamente no puede consultarse ni actualizarse por las rutas normales.
6. Una receta sin items no es preparable.
7. Una receta es preparable solo si todos sus items tienen stock disponible suficiente para al menos una porción.
8. El máximo de porciones preparables está limitado por el item con menor cantidad de porciones posibles.
9. El costo de producción de una receta se calcula con el costo promedio actual de sus items.
10. Las recetas se identifican funcionalmente por `plateId`; un mismo `plateId` no puede duplicarse.
11. Toda salida de inventario debe aplicar FEFO sobre lotes válidos.
12. Toda reserva debe poder liberarse sin pérdida de stock.
13. Todo evento que modifique stock debe ser idempotente por referencia externa.
14. Una operación de negocio no debe fallar únicamente porque el broker no esté disponible; el efecto debe registrarse o reintentarse según corresponda.
15. Las notificaciones de indisponibilidad solo se emiten en la transición de disponible a no disponible.
16. Ninguna operación puede dejar stock negativo, reservas huérfanas o movimientos sin referencia.

## 7. Requisitos no funcionales

### 7.1 Seguridad

- Toda solicitud HTTP debe autenticarse mediante el token del API Gateway.
- La autorización debe basarse en permisos o roles, no solo en la autenticación.
- El servicio no debe almacenar secretos en el repositorio; la configuración sensible debe provenir de variables de entorno.
- Los eventos internos deben provenir de fuentes confiables.
- El endpoint de reset debe estar deshabilitado fuera de dev/QA.

### 7.2 Consistencia e integridad

- Las operaciones que afectan stock, reservas, lotes y movimientos deben ser atómicas o compensables.
- Los cálculos de stock deben ser deterministas y reproducibles.
- Los eventos duplicados no deben producir movimientos ni reservas duplicadas.
- Las referencias a items, lotes, proveedores y recetas deben mantener integridad lógica.

### 7.3 Disponibilidad y resiliencia

- El servicio debe arrancar y operar aunque RabbitMQ no esté disponible.
- Las fallas del broker no deben revertir operaciones de negocio ya persistidas.
- Los consumidores deben manejar errores sin entrar en bucles infinitos.
- Las operaciones asíncronas deben tolerar reintentos y mensajes fuera de orden cuando el contrato lo permita.

### 7.4 Rendimiento

- Las consultas de items, lotes y recetas deben usar índices adecuados.
- El cálculo de disponibilidad de recetas no debe degradarse de forma lineal con el catálogo completo cuando existan muchos registros.
- La evaluación de impacto de un cambio de stock debe limitarse a las recetas que usan el item afectado.

### 7.5 Observabilidad

- El servicio debe registrar conexiones, desconexiones y errores del broker.
- Las operaciones relevantes de stock y eventos deben ser trazables.
- Los errores deben incluir contexto suficiente para diagnóstico sin exponer datos sensibles.
- Debe ser posible correlacionar una orden, un evento y los movimientos generados.

### 7.6 Mantenibilidad y calidad

- El código debe pasar lint, compilación y pruebas automatizadas.
- Las reglas de negocio críticas deben tener pruebas unitarias.
- Las integraciones con MongoDB y RabbitMQ deben tener pruebas de integración o e2e cuando sea viable.
- La API debe mantenerse documentada en OpenAPI.
- Los contratos de eventos deben documentarse y versionarse.

### 7.7 Compatibilidad y despliegue

- El servicio debe ejecutarse en Node.js según `.nvmrc`.
- Debe funcionar en Docker Compose en desarrollo y producción.
- En producción debe integrarse con la red del API Gateway y no publicar puertos directamente.
- La configuración debe poder variar por ambiente sin cambiar el código.

## 8. Estado de implementación

### 8.1 Implementado

- CRUD de items con baja lógica, búsqueda y cálculo de stock disponible/estado.
- CRUD de proveedores.
- CRUD de lotes, numeración automática y sincronización de stock/costo.
- Registro idempotente de recetas por `plateId`.
- Cálculo de disponibilidad, porciones máximas y costo de producción.
- Consumo de eventos de Menú para alta de recetas.
- Publicación de cambios de disponibilidad de recetas.
- Consumo de eventos de Órdenes y reservas de stock Fase 1 (crear, confirmar, liberar, expirar, consultar).
- Publicación de resultados de reservas para Órdenes.
- Caché de lectura en memoria para reservas pendientes.
- Idempotencia persistente de eventos de Órdenes por `eventId`.
- Broker opcional, reconexión con backoff y operación tolerante a fallos de conexión.
- API documentada con OpenAPI, validación global y CORS configurable.
- Endpoint de reset restringido por ambiente.
- Pruebas unitarias, e2e, lint y CI.

### 8.2 Considerado y aún no implementado

- Autenticación y autorización mediante token del API Gateway.
- Consumo definitivo de stock al recibir una orden servida.
- Entidad y registro de movimientos de inventario.
- Descuento automático de stock por consumo de órdenes.
- Aplicación de FEFO en salidas.
- Vencimiento automático de lotes y generación de mermas.
- Notificación proactiva `Inventario.Receta.NoDisponible`.
- Reintentos de procesamiento y cola de mensajes fallidos.
- Formato uniforme de errores en toda la API.

## 9. Criterios de aceptación generales

| Área           | Criterio                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Items          | Un item puede crearse, consultarse, buscarse, actualizarse y desactivarse sin perder historial.   |
| Stock          | El stock disponible refleja correctamente total menos reservado y nunca es negativo.              |
| Lotes          | El stock y costo del item se recalculan al modificar sus lotes; los vencidos no suman.            |
| Recetas        | Una receta refleja correctamente si es preparable, cuántas porciones permite y su costo estimado. |
| Reservas       | Una reserva incrementa el stock reservado y puede liberarse o consumirse sin inconsistencias.     |
| FEFO           | Toda salida consume primero los lotes con vencimiento más próximo y omite los vencidos.           |
| Órdenes        | Los eventos de Órdenes producen reservas, consumos o liberaciones idempotentes.                   |
| Notificaciones | Una receta que deja de ser preparable genera un evento con platillo e ingredientes limitantes.    |
| Seguridad      | Las solicitudes sin token o sin permisos se rechazan con `401` o `403`.                           |
| Mensajería     | Los eventos procesados se confirman y los fallidos no generan bucles ni efectos duplicados.       |
| Operación      | El servicio arranca sin broker, expone su API y mantiene healthchecks funcionales.                |

## 10. Supuestos y decisiones abiertas

- El API Gateway es la fuente de verdad para autenticación y permisos.
- El microservicio de Órdenes es la fuente de verdad del ciclo de vida de las órdenes.
- El contrato definitivo de eventos entre Órdenes e Inventario aún debe acordarse y versionarse.
- La política definitiva de expiración de reservas debe confirmarse con Órdenes; Fase 1 usa TTL configurable.
- La consistencia entre MongoDB y RabbitMQ se resuelve con idempotencia persistente y compensación; el outbox sigue pendiente.
- El esquema actual de eventos de Menú es provisional.
