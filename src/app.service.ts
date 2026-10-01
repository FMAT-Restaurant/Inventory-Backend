import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventConsumer } from './broker/event-customer.service.js';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly eventConsumer: EventConsumer) {}

  async onModuleInit() {
    await this.eventConsumer.consume(
      'mi_exchange_prueba',
      '#', // '#' captura todos los eventos que lleguen al exchange
      (payload) => {
        this.logger.log('🎉 [AppService] ¡Evento recibido en el backend!');
        this.logger.log(JSON.stringify(payload, null, 2));
      },
    );
  }

  getHello(): string {
    return 'Hello World!';
  }
}
