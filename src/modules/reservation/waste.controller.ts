import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  RequiredPermissions,
} from '../../common/auth/auth.decorators.js';
import { PERMISSIONS, type AuthUser } from '../../common/auth/auth.types.js';
import { CreateWasteDto } from './dto/create-waste.dto.js';
import { WasteService } from './waste.service.js';

@ApiTags('movements')
@Controller('movements')
export class WasteController {
  constructor(private readonly wasteService: WasteService) {}

  @Post('waste')
  @RequiredPermissions(PERMISSIONS.BATCHES_WRITE)
  @ApiOperation({
    summary: 'Registrar una merma de un lote',
    description:
      'Descuenta del lote la cantidad perdida y registra el movimiento de merma. Solo requiere el lote, la cantidad y el motivo. Las mermas de órdenes llegan por evento desde Órdenes.',
  })
  @ApiCreatedResponse({ description: 'Merma registrada' })
  @ApiUnprocessableEntityResponse({
    description: 'La cantidad excede lo que queda en el lote',
  })
  create(@Body() dto: CreateWasteDto, @CurrentUser() user?: AuthUser) {
    // El responsable sale del usuario autenticado, no del cliente.
    const createdBy = user?.staffId ?? user?.userId ?? 'system';
    return this.wasteService.registerManual(dto, createdBy);
  }
}
