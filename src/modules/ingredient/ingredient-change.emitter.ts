import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export const INGREDIENT_CHANGED_EVENT = 'ingredient.changed';

export type IngredientChangeAction = 'created' | 'removed';

export interface IngredientChangedEvent {
  ingredientId: string;
  action: IngredientChangeAction;
}

// Bus de eventos en proceso: el servicio de ingredientes anuncia sus cambios
// y el de recetas reacciona (sin dependencias cíclicas entre módulos).
@Injectable()
export class IngredientChangeEmitter extends EventEmitter {}
