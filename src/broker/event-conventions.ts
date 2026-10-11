// Convención de eventos compartida con el microservicio de menú.
// TODO: provisional — cuando el equipo de menú pase el convenio real
// (exchanges, claves, durable), solo hay que ajustar este archivo.

// Exchange topic desde donde publica el microservicio de menú
export const MENU_EXCHANGE = 'menu.topic';

// Exchange topic desde donde publica este microservicio (inventario)
export const INVENTORY_EXCHANGE = 'inventory.topic';

// Routing keys que publica el menú
export const MenuRoutingKeys = {
  PlateCreated: 'plate.created',
  PlateUpdated: 'plate.updated',
  PlateDeleted: 'plate.deleted',
} as const;

// Routing keys que publica el inventario
export const InventoryRoutingKeys = {
  RecipeAvailabilityChanged: 'recipe.availability.changed',
} as const;

// Cola exclusiva de este microservicio para escuchar al menú
export const RECIPE_EVENTS_QUEUE = 'cola_recipe_events';

// Payload publicado cuando cambia la disponibilidad de una receta
export interface RecipeAvailabilityChangedEvent {
  plateId: string;
  name: string;
  isAvailable: boolean;
  maxPreparablePortions: number;
  productionCost: number;
  timestamp: string;
}
