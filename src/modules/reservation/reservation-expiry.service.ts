import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ReservationService } from './reservation.service.js';

const DEFAULT_SWEEP_INTERVAL_MS = 60000;

function resolveSweepInterval(): number {
  const configured = Number(process.env.RESERVATION_SWEEP_INTERVAL_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_SWEEP_INTERVAL_MS;
}

@Injectable()
export class ReservationExpiryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ReservationExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(private readonly reservationService: ReservationService) {}

  onModuleInit(): void {
    const interval = resolveSweepInterval();
    if (interval === 0) {
      this.logger.warn(
        'Barrido de reservas expiradas deshabilitado (RESERVATION_SWEEP_INTERVAL_MS=0).',
      );
      return;
    }

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
      const expired = await this.reservationService.expireDue();
      if (expired > 0) {
        this.logger.log(`🧹 ${expired} reserva(s) expirada(s) liberada(s).`);
      }
      return expired;
    } catch (error) {
      this.logger.error(
        '❌ Error al expirar reservas:',
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
