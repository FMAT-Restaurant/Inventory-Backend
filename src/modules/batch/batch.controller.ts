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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { BatchService } from './batch.service.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';

@ApiTags('batches')
@Controller('batches')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo lote' })
  @ApiCreatedResponse({ description: 'Lote creado con éxito' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos' })
  @ApiNotFoundResponse({ description: 'Item referenciado no encontrado' })
  @ApiConflictResponse({ description: 'Ya existe un lote con ese número' })
  create(@Body() createBatchDto: CreateBatchDto) {
    return this.batchService.create(createBatchDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener la lista completa de lotes' })
  @ApiQuery({
    name: 'itemId',
    required: false,
    description: 'Filtrar lotes por ID de item',
  })
  @ApiOkResponse({ description: 'Lista de lotes obtenida con éxito' })
  findAll(@Query('itemId') itemId?: string) {
    return this.batchService.findAll(itemId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un lote por su ID' })
  @ApiParam({ name: 'id', description: 'ID único del lote (ObjectId)' })
  @ApiOkResponse({ description: 'Lote obtenido con éxito' })
  @ApiNotFoundResponse({ description: 'Lote no encontrado' })
  findOne(@Param('id') id: string) {
    return this.batchService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un lote' })
  @ApiParam({ name: 'id', description: 'ID único del lote' })
  @ApiOkResponse({ description: 'Lote actualizado con éxito' })
  @ApiNotFoundResponse({ description: 'Lote no encontrado' })
  update(@Param('id') id: string, @Body() updateBatchDto: UpdateBatchDto) {
    return this.batchService.update(id, updateBatchDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un lote' })
  @ApiParam({ name: 'id', description: 'ID único del lote' })
  @ApiOkResponse({ description: 'Lote eliminado con éxito' })
  @ApiNotFoundResponse({ description: 'Lote no encontrado' })
  remove(@Param('id') id: string) {
    return this.batchService.remove(id);
  }
}
