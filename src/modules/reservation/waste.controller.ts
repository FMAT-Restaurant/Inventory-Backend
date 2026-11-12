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
    summary: 'Registrar merma de una orden servida',
    description:
      'Registra la pérdida de insumos ya descontados al servir la orden. No modifica el stock.',
  })
  @ApiCreatedResponse({ description: 'Merma registrada' })
  @ApiUnprocessableEntityResponse({
    description:
      'La orden no está servida, el lote no fue consumido por ella o la cantidad excede lo consumido',
  })
  create(@Body() dto: CreateWasteDto, @CurrentUser() user?: AuthUser) {
    // El responsable sale del usuario autenticado, no del cliente.
    const createdBy = user?.staffId ?? user?.userId ?? 'system';
    return this.wasteService.register(dto, createdBy);
  }
}
