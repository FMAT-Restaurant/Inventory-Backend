import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BrokerModule } from './broker/broker.module.js'; // 1. Importa tu módulo del broker

@Module({
  imports: [
    BrokerModule, // 2. Agrégalo aquí en los imports
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
