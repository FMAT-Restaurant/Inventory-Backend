import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { IngredientService } from './ingredient.service.js';
import { CreateIngredientDto } from './dto/create-ingredient.dto.js';
import { UpdateIngredientDto } from './dto/update-ingredient.dto.js';

@ApiTags('ingredients')
@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo ingrediente' })
  @ApiCreatedResponse({ description: 'Ingrediente creado con éxito' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos' })
  @ApiConflictResponse({ description: 'Ya existe un ingrediente con ese nombre' })
  create(@Body() createIngredientDto: CreateIngredientDto) {
    return this.ingredientsService.create(createIngredientDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener la lista completa de ingredientes' })
  @ApiOkResponse({ description: 'Lista de ingredientes obtenida con éxito' })
  findAll() {
    return this.ingredientsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un ingrediente por su ID' })
  @ApiParam({ name: 'id', description: 'ID único del ingrediente (ObjectId)' })
  @ApiOkResponse({ description: 'Ingrediente obtenido con éxito' })
  @ApiNotFoundResponse({ description: 'Ingrediente no encontrado' })
  findOne(@Param('id') id: string) {
    return this.ingredientsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un ingrediente' })
  @ApiParam({ name: 'id', description: 'ID único del ingrediente (ObjectId)' })
  @ApiOkResponse({ description: 'Ingrediente actualizado con éxito' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos' })
  @ApiNotFoundResponse({ description: 'Ingrediente no encontrado' })
  @ApiConflictResponse({ description: 'Ya existe un ingrediente con ese nombre' })
  update(
    @Param('id') id: string,
    @Body() updateIngredientDto: UpdateIngredientDto,
  ) {
    return this.ingredientsService.update(id, updateIngredientDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Desactivar un ingrediente',
    description:
      'Baja lógica: el ingrediente se marca como inactivo y deja de aparecer en el listado.',
  })
  @ApiParam({ name: 'id', description: 'ID único del ingrediente (ObjectId)' })
  @ApiOkResponse({ description: 'Ingrediente desactivado con éxito' })
  @ApiNotFoundResponse({ description: 'Ingrediente no encontrado' })
  remove(@Param('id') id: string) {
    return this.ingredientsService.remove(id);
  }
}
