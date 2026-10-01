import { Controller, Get } from '@nestjs/common';
import { EventPublisher } from './broker/event-publisher.service.js';

@Controller('test-broker')
export class AppController {
  constructor(private readonly eventPublisher: EventPublisher) {}

  @Get('publicar')
  async probarPublicacion() {
    const exchangeName = 'mi_exchange_prueba';
    const routingKey = 'evento.prueba.enviado';
    const payload = {
      mensaje: '¡Hola desde mi microservicio!',
      fecha: new Date().toISOString(),
    };

    // Publica el evento hacia el broker independiente
    await this.eventPublisher.publish(exchangeName, routingKey, payload);

    return { status: 'Evento publicado con éxito desde el microservicio' };
  }
}
