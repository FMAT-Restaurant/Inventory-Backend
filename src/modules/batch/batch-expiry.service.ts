import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { BatchService } from './batch.service.js';

const DEFAULT_SWEEP_INTERVAL_MS = 60000;

function resolveSweepInterval(): number {
  const configured = Number(process.env.BATCH_EXPIRY_SWEEP_INTERVAL_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_SWEEP_INTERVAL_MS;
}

/**
 * Barrido periódico de lotes vencidos: mantiene el estado de los lotes y el
 * stock de los items al día aunque nadie consulte ni edite el lote.
 */
@Injectable()
export class BatchExpiryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(BatchExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(private readonly batchService: BatchService) {}

  onApplicationBootstrap(): void {
    const interval = resolveSweepInterval();
    if (interval === 0) {
      this.logger.warn(
        'Barrido de lotes vencidos deshabilitado (BATCH_EXPIRY_SWEEP_INTERVAL_MS=0).',
      );
      return;
    }

    // Primer barrido al arrancar: cubre los lotes que vencieron mientras el
    // servicio estaba detenido.
    void this.sweep();
    this.timer = setInterval(() => {
      void this.sweep();
    }, interval);
    this.timer.unref?.();
  }

  async sweep(): Promise<number> {
    if (this.sweeping) {
      return 0;
    }

    this.sweeping = true;
    try {
      const updated = await this.batchService.syncExpiredStatuses();
      if (updated > 0) {
        this.logger.log(`🧹 ${updated} lote(s) actualizados por vencimiento.`);
      }
      return updated;
    } catch (error) {
      this.logger.error(
        '❌ Error al actualizar lotes vencidos:',
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    } finally {
      this.sweeping = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
