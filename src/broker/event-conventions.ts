// Convención de eventos compartida entre microservicios.
// Formato de routing key: <microservicio>.<entidad>.<accion>
//   p. ej. 'menu.plate.created', 'inventory.recipe.availability-changed'
// TODO: provisional — cuando el equipo confirme el convenio real
// (exchanges, claves, durable), solo hay que ajustar este archivo.

// Exchange topic desde donde publica el microservicio de menú
export const MENU_EXCHANGE = 'menu.topic';

// Exchange topic desde donde publica el microservicio de órdenes
// Contrato provisional: debe validarse con el equipo de Órdenes antes de producción.
export const ORDERS_EXCHANGE = 'ordenes.topic';

// Único exchange por el que publica este microservicio (inventario)
export const INVENTORY_EXCHANGE = 'inventory.topic';

// Routing keys que publica el menú
export const MenuRoutingKeys = {
  PlateCreated: 'menu.plate.created',
  PlateUpdated: 'menu.plate.updated',
  PlateDeleted: 'menu.plate.deleted',
} as const;

// Routing keys que publica el microservicio de órdenes
// Contrato provisional versionado en el envelope (`version: 1`).
export const OrdersRoutingKeys = {
  OrderCreated: 'ordenes.order.created',
  OrderConfirmed: 'ordenes.order.confirmed',
  OrderCancelled: 'ordenes.order.cancelled',
  OrderServed: 'ordenes.order.served',
} as const;

// Routing keys que publica el inventario
export const InventoryRoutingKeys = {
  RecipeAvailabilityChanged: 'inventory.recipe.availability-changed',
  RecipeNotAvailable: 'inventory.recipe.not-available',
  ReservationConfirmed: 'inventory.reservation.confirmed',
  ReservationRejected: 'inventory.reservation.rejected',
  ReservationReleased: 'inventory.reservation.released',
  ReservationExpired: 'inventory.reservation.expired',
  ReservationConsumed: 'inventory.reservation.consumed',
} as const;

// Una cola por dominio suscriptor de este microservicio
export const RECIPE_EVENTS_QUEUE = 'cola_recipe_events';
export const ITEM_EVENTS_QUEUE = 'cola_item_events';
export const BATCH_EVENTS_QUEUE = 'cola_batch_events';
export const ORDERS_EVENTS_QUEUE = 'cola_orders_events';

// Payload de los eventos de menú (placeholder hasta tener el contrato real)
export interface PlateEventItem {
  itemId: string;
  requiredQuantity: number;
}

export interface PlateEvent {
  plateId: string;
  name: string;
  items: PlateEventItem[];
  timestamp: string;
}

// Payload publicado cuando cambia la disponibilidad de una receta
export interface RecipeAvailabilityChangedEvent {
  plateId: string;
  name: string;
  isAvailable: boolean;
  maxPreparablePortions: number;
  productionCost: number;
  timestamp: string;
}

export interface RecipeNotAvailableIngredient {
  itemId: string;
  itemName: string;
  requiredQuantity: number;
  availableStock: number;
}

export interface RecipeNotAvailableEvent {
  plateId: string;
  name: string;
  limitingIngredients: RecipeNotAvailableIngredient[];
  timestamp: string;
}

// Envelope de eventos de órdenes (contrato provisional v1).
export interface OrderEventItem {
  // Lo más común que envíe Órdenes: platillo
  plateId?: string;
  // Se deja comentado/soportado por si al final envían itemId directamente
  // itemId?: string;
  quantity?: number;
  // También soportar itemId directamente si llega en el payload
  itemId?: string;
}

export interface OrderEvent {
  eventId: string;
  version: number;
  occurredAt: string;
  correlationId?: string;
  orderId: string;
  items?: OrderEventItem[];
  reason?: string;
}

// Resultado de una operación de reserva publicado por inventario.
export interface ReservationResultItem {
  itemId: string;
  itemName?: string;
  requestedQuantity: number;
  availableStock?: number;
}

export interface ReservationResultEvent {
  orderId: string;
  status: string;
  eventId?: string;
  correlationId?: string;
  reason?: string;
  items?: ReservationResultItem[];
  timestamp: string;
}
