import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { QueryPendingSummaryDto } from './dto/query-pending-summary.dto.js';
import { QueryReservationsDto } from './dto/query-reservations.dto.js';
import { ReservationService } from './reservation.service.js';
import { RequiredPermissions } from '../../common/auth/auth.decorators.js';
import { PERMISSIONS } from '../../common/auth/auth.types.js';

@ApiTags('reservations')
@Controller('reservations')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  @Get()
  @RequiredPermissions(PERMISSIONS.RESERVATIONS_READ)
  @ApiOperation({
    summary: 'Listar reservas de stock',
    description:
      'Permite filtrar por estado, orden o item. Las reservas pendientes expiradas no se incluyen.',
  })
  @ApiOkResponse({ description: 'Lista de reservas obtenida con éxito' })
  findAll(@Query() query: QueryReservationsDto) {
    return this.reservationService.findAll(query);
  }

  @Get('pending/summary')
  @RequiredPermissions(PERMISSIONS.RESERVATIONS_READ)
  @ApiOperation({
    summary: 'Resumen de stock apartado pendiente',
    description:
      'Agrupa las reservas pendientes por item para conocer cuánto stock está apartado pero aún no confirmado.',
  })
  @ApiOkResponse({ description: 'Resumen de reservas pendientes' })
  getPendingSummary(@Query() query: QueryPendingSummaryDto) {
    return this.reservationService.getPendingSummary(query.itemId);
  }

  @Get(':orderId')
  @RequiredPermissions(PERMISSIONS.RESERVATIONS_READ)
  @ApiOperation({ summary: 'Obtener la reserva de una orden' })
  @ApiParam({ name: 'orderId', description: 'Referencia externa de la orden' })
  @ApiOkResponse({ description: 'Reserva obtenida con éxito' })
  @ApiNotFoundResponse({ description: 'Reserva no encontrada' })
  findByOrderId(@Param('orderId') orderId: string) {
    return this.reservationService.findByOrderId(orderId);
  }
}
