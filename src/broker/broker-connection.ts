import type { Logger } from '@nestjs/common';
import * as amqp from 'amqplib';

export const DEFAULT_BROKER_URL =
  'amqp://admin:supersecurepassword@host.docker.internal:5672';

// Solo se necesitan estos métodos del logger, lo que permite pasarlo desde
// los servicios y sustituirlo fácilmente en las pruebas.
export type BrokerLogger = Pick<Logger, 'error' | 'warn'>;

export interface BrokerConnection {
  connection: amqp.ChannelModel;
  channel: amqp.Channel;
}

export function resolveBrokerUrl(): string {
  return process.env.RABBITMQ_URL || DEFAULT_BROKER_URL;
}

export async function openBrokerConnection(
  brokerUrl: string = resolveBrokerUrl(),
): Promise<BrokerConnection> {
  const connection = await amqp.connect(brokerUrl);
  const channel = await connection.createChannel();
  return { connection, channel };
}

export async function closeBrokerConnection(
  channel: amqp.Channel | null,
  connection: amqp.ChannelModel | null,
): Promise<void> {
  await channel?.close();
  await connection?.close();
}

/**
 * Registra los listeners de error y cierre de una conexión/canal de RabbitMQ.
 *
 * Sin un listener de 'error', amqplib emite un error no capturado y Node
 * termina el proceso cuando el broker cierra la conexión inesperadamente.
 * `onDisconnected` se invoca en ambos cierres para que el servicio descarte
 * su referencia al canal.
 */
export function attachBrokerListeners(
  role: string,
  logger: BrokerLogger,
  connection: amqp.ChannelModel | null,
  channel: amqp.Channel | null,
  onDisconnected: () => void,
): void {
  connection?.on('error', (error) => {
    logger.error(`❌ Error en la conexión de RabbitMQ (${role}):`, error);
  });
  connection?.on('close', () => {
    logger.warn(`⚠️ Conexión de RabbitMQ cerrada (${role}).`);
    onDisconnected();
  });
  channel?.on('error', (error) => {
    logger.error(`❌ Error en el canal de RabbitMQ (${role}):`, error);
  });
  channel?.on('close', () => {
    logger.warn(`⚠️ Canal de RabbitMQ cerrado (${role}).`);
    onDisconnected();
  });
}
