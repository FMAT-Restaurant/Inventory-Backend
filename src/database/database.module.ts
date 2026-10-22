import 'dotenv/config';
import { Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => {
        const uri =
          process.env.MONGODB_URI ||
          process.env.DATABASE_URL ||
          'mongodb://127.0.0.1:27017/inventory';
        const logger = new Logger('DatabaseModule');

        return {
          uri,
          lazyConnection: true,
          // Ante un reinicio del contenedor de MongoDB la conexión queda en
          // estado fallido; sin reintentos el servicio responde 500 hasta que
          // se reinicia a mano.
          retryAttempts: 10,
          retryDelay: 3000,
          serverSelectionTimeoutMS: 15000,
          connectionFactory: (connection: Connection) => {
            connection.on('connected', () => {
              logger.log('Conexion con MongoDB verificada');
            });
            connection.on('error', (error) => {
              logger.error(`Error de conexion con MongoDB: ${error}`);
            });
            connection.on('disconnected', () => {
              logger.warn('Conexion con MongoDB perdida');
            });
            return connection;
          },
        };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
