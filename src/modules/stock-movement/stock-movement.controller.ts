import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryStockMovementsDto } from './dto/query-stock-movements.dto.js';
import { StockMovementService } from './stock-movement.service.js';

@ApiTags('movements')
@Controller('movements')
export class StockMovementController {
  constructor(
    private readonly stockMovementService: StockMovementService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar movimientos de inventario',
    description:
      'Los movimientos son de solo lectura: no se editan ni eliminan; las correcciones se hacen con movimientos compensatorios.',
  })
  @ApiOkResponse({ description: 'Lista de movimientos obtenida con éxito' })
  findAll(@Query() query: QueryStockMovementsDto) {
    return this.stockMovementService.findAll(query);
  }
}
