import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ description: 'Nombre del proveedor', example: 'Distribuidora Central' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Nombre del contacto', example: 'Juan Pérez' })
  @IsString()
  @IsOptional()
  contactName?: string;

  @ApiPropertyOptional({ description: 'Teléfono de contacto', example: '+52 55 1234 5678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Correo electrónico', example: 'contacto@proveedor.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Dirección', example: 'Av. Reforma 123, CDMX' })
  @IsString()
  @IsOptional()
  address?: string;
}
