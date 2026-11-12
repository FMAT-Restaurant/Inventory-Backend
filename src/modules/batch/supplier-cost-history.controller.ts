import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../common/auth/auth.decorators.js';
import { PERMISSIONS } from '../../common/auth/auth.types.js';
import { BatchService } from './batch.service.js';
import { QueryCostHistoryDto } from './dto/query-cost-history.dto.js';

// Vive en el módulo de lotes porque el historial sale de las compras
// (lotes); se expone bajo /suppliers para que el recurso sea el proveedor.
@ApiTags('suppliers')
@Controller('suppliers')
export class SupplierCostHistoryController {
  constructor(private readonly batchService: BatchService) {}

  @Get(':id/cost-history')
  @RequiredPermissions(PERMISSIONS.SUPPLIERS_READ)
  @ApiOperation({
    summary: 'Historial de costos de compra de un proveedor',
    description:
      'Lista las compras (lotes) del proveedor en orden cronológico con su costo unitario de compra.',
  })
  @ApiParam({ name: 'id', description: 'ID del proveedor (ObjectId)' })
  @ApiOkResponse({ description: 'Historial obtenido con éxito' })
  @ApiNotFoundResponse({ description: 'Proveedor no encontrado' })
  findCostHistory(
    @Param('id') id: string,
    @Query() query: QueryCostHistoryDto,
  ) {
    return this.batchService.getSupplierCostHistory(id, query.itemId);
  }
}
