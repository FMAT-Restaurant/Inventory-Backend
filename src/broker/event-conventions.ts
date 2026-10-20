// Convención de eventos compartida entre microservicios.
// Formato de routing key: <microservicio>.<entidad>.<accion>
//   p. ej. 'menu.plate.created', 'inventory.recipe.availability-changed'
// TODO: provisional — cuando el equipo confirme el convenio real
// (exchanges, claves, durable), solo hay que ajustar este archivo.

// Exchange topic desde donde publica el microservicio de menú
export const MENU_EXCHANGE = 'menu.topic';

// Único exchange por el que publica este microservicio (inventario)
export const INVENTORY_EXCHANGE = 'inventory.topic';

// Routing keys que publica el menú
export const MenuRoutingKeys = {
  PlateCreated: 'menu.plate.created',
  PlateUpdated: 'menu.plate.updated',
  PlateDeleted: 'menu.plate.deleted',
} as const;

// Routing keys que publica el inventario
export const InventoryRoutingKeys = {
  RecipeAvailabilityChanged: 'inventory.recipe.availability-changed',
} as const;

// Una cola por dominio suscriptor de este microservicio
export const RECIPE_EVENTS_QUEUE = 'cola_recipe_events';
export const INGREDIENT_EVENTS_QUEUE = 'cola_ingredient_events';
export const BATCH_EVENTS_QUEUE = 'cola_batch_events';

// Payload de los eventos de menú (placeholder hasta tener el contrato real)
export interface PlateEventItem {
  ingredientId: string;
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
