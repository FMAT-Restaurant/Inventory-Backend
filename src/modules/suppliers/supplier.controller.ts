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
import { SupplierService } from './supplier.service.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { QuerySuppliersDto } from './dto/query-suppliers.dto.js';
import { RequiredPermissions } from '../../common/auth/auth.decorators.js';
import { PERMISSIONS } from '../../common/auth/auth.types.js';

@ApiTags('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @RequiredPermissions(PERMISSIONS.SUPPLIERS_WRITE)
  @ApiOperation({ summary: 'Crear un nuevo proveedor' })
  @ApiCreatedResponse({ description: 'Proveedor creado con éxito' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos' })
  @ApiConflictResponse({ description: 'Ya existe un proveedor con ese nombre' })
  create(@Body() createSupplierDto: CreateSupplierDto) {
    return this.supplierService.create(createSupplierDto);
  }

  @Get()
  @RequiredPermissions(PERMISSIONS.SUPPLIERS_READ)
  @ApiOperation({
    summary: 'Obtener la lista de proveedores',
    description:
      'Devuelve los proveedores activos. Con includeInactive=true incluye también los dados de baja.',
  })
  @ApiOkResponse({ description: 'Lista de proveedores obtenida con éxito' })
  findAll(@Query() query: QuerySuppliersDto) {
    return this.supplierService.findAll(query);
  }

  @Get(':id')
  @RequiredPermissions(PERMISSIONS.SUPPLIERS_READ)
  @ApiOperation({ summary: 'Obtener un proveedor por su ID' })
  @ApiParam({ name: 'id', description: 'ID único del proveedor (ObjectId)' })
  @ApiOkResponse({ description: 'Proveedor obtenido con éxito' })
  @ApiNotFoundResponse({ description: 'Proveedor no encontrado' })
  findOne(@Param('id') id: string) {
    return this.supplierService.findOne(id);
  }

  @Patch(':id')
  @RequiredPermissions(PERMISSIONS.SUPPLIERS_WRITE)
  @ApiOperation({ summary: 'Actualizar un proveedor' })
  @ApiParam({ name: 'id', description: 'ID único del proveedor' })
  @ApiOkResponse({ description: 'Proveedor actualizado con éxito' })
  @ApiNotFoundResponse({ description: 'Proveedor no encontrado' })
  update(@Param('id') id: string, @Body() updateSupplierDto: UpdateSupplierDto) {
    return this.supplierService.update(id, updateSupplierDto);
  }

  @Delete(':id')
  @RequiredPermissions(PERMISSIONS.SUPPLIERS_WRITE)
  @ApiOperation({ summary: 'Eliminar un proveedor' })
  @ApiParam({ name: 'id', description: 'ID único del proveedor' })
  @ApiOkResponse({ description: 'Proveedor eliminado con éxito' })
  @ApiNotFoundResponse({ description: 'Proveedor no encontrado' })
  remove(@Param('id') id: string) {
    return this.supplierService.remove(id);
  }
}
