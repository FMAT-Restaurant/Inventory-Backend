export type EventHandler = (payload: any) => void | Promise<void>;

export interface EventSubscription {
  // Patrón de routing key (soporta comodines '*' y '#' de exchanges topic)
  routingKey: string;
  exchange: string;
  handler: EventHandler;
}

/**
 * Registro declarativo de suscripciones del customer.
 * Indica qué eventos le interesan y qué hacer cuando llega cada uno:
 *
 *   const subscriptions = new EventSubscriptions()
 *     .on('inventory.topic', 'ingredient.created', (payload) => {...})
 *     .on('inventory.topic', 'batch.#', (payload) => {...});
 *
 *   await consumer.consumeSubscriptions(subscriptions, 'cola_inventory');
 */
export class EventSubscriptions {
  private readonly subscriptions: EventSubscription[] = [];

  on(exchange: string, routingKey: string, handler: EventHandler): this {
    const alreadySubscribed = this.subscriptions.some(
      (s) => s.exchange === exchange && s.routingKey === routingKey,
    );

    if (alreadySubscribed) {
      throw new Error(
        `Ya existe una suscripción para '${routingKey}' en el exchange '${exchange}'`,
      );
    }

    this.subscriptions.push({ exchange, routingKey, handler });
    return this;
  }

  get all(): EventSubscription[] {
    return [...this.subscriptions];
  }

  // Regresa las suscripciones cuyo patrón coincide con la routing key del mensaje
  matching(routingKey: string): EventSubscription[] {
    return this.subscriptions.filter((s) =>
      EventSubscriptions.topicMatches(s.routingKey, routingKey),
    );
  }

  // Implementación del algoritmo de matching de exchanges topic de RabbitMQ
  private static topicMatches(pattern: string, routingKey: string): boolean {
    const patternParts = pattern.split('.');
    const keyParts = routingKey.split('.');

    const match = (patternIndex: number, keyIndex: number): boolean => {
      if (patternIndex === patternParts.length) {
        return keyIndex === keyParts.length;
      }

      if (patternParts[patternIndex] === '#') {
        // '#' consume cero o más segmentos
        for (let i = keyIndex; i <= keyParts.length; i++) {
          if (match(patternIndex + 1, i)) {
            return true;
          }
        }
        return false;
      }

      if (
        keyIndex === keyParts.length ||
        (patternParts[patternIndex] !== '*' &&
          patternParts[patternIndex] !== keyParts[keyIndex])
      ) {
        return false;
      }

      return match(patternIndex + 1, keyIndex + 1);
    };

    return match(0, 0);
  }
}
