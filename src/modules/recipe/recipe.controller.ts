import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
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
import type { Response } from 'express';
import { RecipeService } from './recipe.service.js';
import { CreateRecipeDto } from './dto/create-recipe.dto.js';
import { UpdateRecipeDto } from './dto/update-recipe.dto.js';
import { QueryRecipesDto } from './dto/query-recipes.dto.js';
import { RecipeResponseDto } from './dto/recipe-response.dto.js';
import {
  Blocked,
  RequiredPermissions,
} from '../../common/auth/auth.decorators.js';
import { PERMISSIONS } from '../../common/auth/auth.types.js';

@ApiTags('recipes')
@Controller('recipes')
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  @Post()
  @Blocked('Las recetas se gestionan mediante eventos de Menú')
  @ApiOperation({
    summary: 'Registrar o actualizar una receta (idempotente por plateId)',
  })
  @ApiCreatedResponse({
    description: 'Receta registrada exitosamente',
    type: RecipeResponseDto,
  })
  @ApiOkResponse({
    description:
      'Receta existente actualizada exitosamente de forma idempotente',
    type: RecipeResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Datos de entrada inválidos o incompletos',
  })
  @ApiNotFoundResponse({
    description: 'Uno o más items referenciados no existen en el catálogo',
  })
  @ApiConflictResponse({ description: 'Conflicto al persistir la receta' })
  async createOrUpdate(
    @Body() createRecipeDto: CreateRecipeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RecipeResponseDto> {
    const { recipe, isNew } =
      await this.recipeService.registerOrUpdate(createRecipeDto);
    res.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return recipe;
  }

  @Get()
  @RequiredPermissions(PERMISSIONS.RECIPES_READ)
  @ApiOperation({
    summary:
      'Obtener el listado de recetas con cálculo de disponibilidad y costo en tiempo real',
  })
  @ApiOkResponse({
    description: 'Lista de recetas obtenida con éxito',
    type: [RecipeResponseDto],
  })
  findAll(@Query() query: QueryRecipesDto): Promise<RecipeResponseDto[]> {
    return this.recipeService.findAll(query);
  }

  @Get(':id')
  @RequiredPermissions(PERMISSIONS.RECIPES_READ)
  @ApiOperation({
    summary:
      'Obtener una receta con su detalle de disponibilidad por su ID (ObjectId) o plateId',
  })
  @ApiParam({
    name: 'id',
    description: 'ID único de MongoDB (ObjectId) o plateId del platillo',
    example: 'PLATE-BURGER-01',
  })
  @ApiOkResponse({
    description: 'Detalle de la receta y disponibilidad obtenido con éxito',
    type: RecipeResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Receta no encontrada' })
  findOne(@Param('id') id: string): Promise<RecipeResponseDto> {
    return this.recipeService.findOne(id);
  }

  @Patch(':id')
  @Blocked('Las recetas se gestionan mediante eventos de Menú')
  @ApiOperation({ summary: 'Actualizar parcialmente una receta' })
  @ApiParam({
    name: 'id',
    description: 'ID único de MongoDB (ObjectId) o plateId del platillo',
  })
  @ApiOkResponse({
    description: 'Receta actualizada con éxito',
    type: RecipeResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Receta o items no encontrados' })
  update(
    @Param('id') id: string,
    @Body() updateRecipeDto: UpdateRecipeDto,
  ): Promise<RecipeResponseDto> {
    return this.recipeService.update(id, updateRecipeDto);
  }

  @Delete(':id')
  @Blocked('Las recetas se gestionan mediante eventos de Menú')
  @ApiOperation({ summary: 'Eliminar una receta' })
  @ApiParam({
    name: 'id',
    description: 'ID único de MongoDB (ObjectId) o plateId del platillo',
  })
  @ApiOkResponse({ description: 'Receta eliminada con éxito' })
  @ApiNotFoundResponse({ description: 'Receta no encontrada' })
  remove(@Param('id') id: string): Promise<void> {
    return this.recipeService.remove(id);
  }
}
