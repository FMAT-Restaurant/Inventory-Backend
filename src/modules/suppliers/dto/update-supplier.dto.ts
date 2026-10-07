import { PartialType } from '@nestjs/swagger';
import { CreateSupplierDto } from './create-supplier.dto.js';

// Todos los campos son opcionales al actualizar.
export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
