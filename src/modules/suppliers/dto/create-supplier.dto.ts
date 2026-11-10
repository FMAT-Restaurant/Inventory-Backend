import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../../common/validation.js';

export class CreateSupplierDto {
  @ApiProperty({ description: 'Nombre del proveedor', example: 'Distribuidora Central' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'Nombre del contacto', example: 'Juan Pérez' })
  @Trim()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  contactName?: string;

  @ApiPropertyOptional({ description: 'Teléfono de contacto', example: '+52 55 1234 5678' })
  @Trim()
  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Correo electrónico', example: 'contacto@proveedor.com' })
  @Trim()
  @IsEmail()
  @MaxLength(254)
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Dirección', example: 'Av. Reforma 123, CDMX' })
  @Trim()
  @IsString()
  @MaxLength(250)
  @IsOptional()
  address?: string;
}
