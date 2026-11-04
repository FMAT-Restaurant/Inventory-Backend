import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ReservationStatus } from '../schemas/stock-reservation.schema.js';

export class QueryReservationsDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estado de la reserva',
    enum: ReservationStatus,
  })
  @IsEnum(ReservationStatus)
  @IsOptional()
  status?: ReservationStatus;

  @ApiPropertyOptional({ description: 'Filtrar por referencia externa de orden' })
  @IsString()
  @IsOptional()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ID de item (ObjectId)' })
  @IsMongoId()
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Máximo de resultados a devolver' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}
