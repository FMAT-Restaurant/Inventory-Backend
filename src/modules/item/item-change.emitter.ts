import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export const ITEM_CHANGED_EVENT = 'item.changed';

export type ItemChangeAction = 'created' | 'updated' | 'removed';

export interface ItemChangedEvent {
  itemId: string;
  action: ItemChangeAction;
}

// Bus de eventos en proceso: el servicio de items anuncia sus cambios
// y el de recetas reacciona (sin dependencias cíclicas entre módulos).
@Injectable()
export class ItemChangeEmitter extends EventEmitter {}
