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
import { ItemService } from './item.service.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { QueryItemsDto } from './dto/query-items.dto.js';

@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo item' })
  @ApiCreatedResponse({ description: 'Item creado con éxito' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos' })
  @ApiConflictResponse({ description: 'Ya existe un item con ese nombre' })
  create(@Body() createItemDto: CreateItemDto) {
    return this.itemsService.create(createItemDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener la lista de items',
    description:
      'Permite buscar por nombre usando el parámetro q (coincidencia parcial, sin distinguir mayúsculas).',
  })
  @ApiOkResponse({ description: 'Lista de items obtenida con éxito' })
  findAll(@Query() query: QueryItemsDto) {
    return this.itemsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un item por su ID' })
  @ApiParam({ name: 'id', description: 'ID único del item (ObjectId)' })
  @ApiOkResponse({ description: 'Item obtenido con éxito' })
  @ApiNotFoundResponse({ description: 'Item no encontrado' })
  findOne(@Param('id') id: string) {
    return this.itemsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un item' })
  @ApiParam({ name: 'id', description: 'ID único del item (ObjectId)' })
  @ApiOkResponse({ description: 'Item actualizado con éxito' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos' })
  @ApiNotFoundResponse({ description: 'Item no encontrado' })
  @ApiConflictResponse({ description: 'Ya existe un item con ese nombre' })
  update(@Param('id') id: string, @Body() updateItemDto: UpdateItemDto) {
    return this.itemsService.update(id, updateItemDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Desactivar un item',
    description:
      'Baja lógica: el item se marca como inactivo y deja de aparecer en el listado.',
  })
  @ApiParam({ name: 'id', description: 'ID único del item (ObjectId)' })
  @ApiOkResponse({ description: 'Item desactivado con éxito' })
  @ApiNotFoundResponse({ description: 'Item no encontrado' })
  remove(@Param('id') id: string) {
    return this.itemsService.remove(id);
  }
}
