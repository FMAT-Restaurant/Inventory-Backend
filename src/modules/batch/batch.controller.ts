import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BatchService } from './batch.service.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { QueryBatchesDto } from './dto/query-batches.dto.js';
import {
  CurrentUser,
  RequiredPermissions,
} from '../../common/auth/auth.decorators.js';
import { PERMISSIONS, type AuthUser } from '../../common/auth/auth.types.js';

@ApiTags('batches')
@Controller('batches')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post()
  @RequiredPermissions(PERMISSIONS.BATCHES_WRITE)
  @ApiOperation({ summary: 'Crear un nuevo lote' })
  @ApiCreatedResponse({ description: 'Lote creado con éxito' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos' })
  @ApiNotFoundResponse({ description: 'Item referenciado no encontrado' })
  @ApiConflictResponse({ description: 'Ya existe un lote con ese número' })
  create(@Body() createBatchDto: CreateBatchDto) {
    return this.batchService.create(createBatchDto);
  }

  @Get()
  @RequiredPermissions(PERMISSIONS.BATCHES_READ)
  @ApiOperation({ summary: 'Obtener la lista paginada de lotes' })
  @ApiOkResponse({ description: 'Lista paginada de lotes obtenida con éxito' })
  findAll(@Query() query: QueryBatchesDto) {
    return this.batchService.findAll(query);
  }

  @Get(':id')
  @RequiredPermissions(PERMISSIONS.BATCHES_READ)
  @ApiOperation({ summary: 'Obtener un lote por su ID' })
  @ApiParam({ name: 'id', description: 'ID único del lote (ObjectId)' })
  @ApiOkResponse({ description: 'Lote obtenido con éxito' })
  @ApiNotFoundResponse({ description: 'Lote no encontrado' })
  findOne(@Param('id') id: string) {
    return this.batchService.findOne(id);
  }

  @Patch(':id')
  @RequiredPermissions(PERMISSIONS.BATCHES_WRITE)
  @ApiOperation({ summary: 'Actualizar un lote' })
  @ApiParam({ name: 'id', description: 'ID único del lote' })
  @ApiOkResponse({ description: 'Lote actualizado con éxito' })
  @ApiBadRequestResponse({ description: 'Operación no permitida por estado del lote' })
  @ApiConflictResponse({ description: 'El ajuste dejaría el stock por debajo del reservado' })
  @ApiNotFoundResponse({ description: 'Lote no encontrado' })
  update(
    @Param('id') id: string,
    @Body() updateBatchDto: UpdateBatchDto,
    @CurrentUser() user?: AuthUser,
  ) {
    const createdBy = user?.staffId ?? user?.userId ?? 'system';
    return this.batchService.update(id, updateBatchDto, createdBy);
  }

  @Delete(':id')
  @RequiredPermissions(PERMISSIONS.BATCHES_WRITE)
  @ApiOperation({ summary: 'Eliminar un lote' })
  @ApiParam({ name: 'id', description: 'ID único del lote' })
  @ApiOkResponse({ description: 'Lote eliminado con éxito' })
  @ApiBadRequestResponse({ description: 'No se puede eliminar un lote caducado, agotado o consumido' })
  @ApiConflictResponse({ description: 'La eliminación dejaría el stock por debajo del reservado' })
  @ApiNotFoundResponse({ description: 'Lote no encontrado' })
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    const createdBy = user?.staffId ?? user?.userId ?? 'system';
    return this.batchService.remove(id, createdBy);
  }
}
