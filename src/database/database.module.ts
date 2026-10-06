import 'dotenv/config';
import { Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

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
