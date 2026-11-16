import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ReservationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CONSUMED = 'consumed',
  RELEASED = 'released',
  EXPIRED = 'expired',
}

export const ACTIVE_RESERVATION_STATUSES = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
] as const;

@Schema({ _id: false })
export class ReservationItem {
  @Prop({ type: Types.ObjectId, ref: 'Item', required: true })
  itemId: Types.ObjectId;

  @Prop({ required: true, min: 0.0001 })
  quantity: number;
}
export const ReservationItemSchema =
  SchemaFactory.createForClass(ReservationItem);

// Platillo que originó la reserva: permite relacionar la oferta de Menú
// (`offerId`) con la receta (`plateId`) cuando llegan mermas de la orden.
@Schema({ _id: false })
export class ReservationLine {
  @Prop({ type: String, default: null, trim: true })
  offerId?: string | null;

  @Prop({ type: String, required: true, trim: true })
  plateId: string;

  @Prop({ required: true, min: 0 })
  quantity: number;
}
export const ReservationLineSchema =
  SchemaFactory.createForClass(ReservationLine);

@Schema({ collection: 'stock_reservations', timestamps: true })
export class StockReservation extends Document {
  @Prop({ required: true, trim: true })
  orderId: string;

  @Prop({ type: [ReservationItemSchema], required: true, default: [] })
  items: ReservationItem[];

  @Prop({ type: [ReservationLineSchema], default: [] })
  lines: ReservationLine[];

  @Prop({
    required: true,
    type: String,
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  @Prop({ type: String, default: null, trim: true })
  eventId?: string | null;

  @Prop({ type: String, default: null, trim: true })
  correlationId?: string | null;

  @Prop({ type: String, default: null, trim: true })
  reason?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export const StockReservationSchema =
  SchemaFactory.createForClass(StockReservation);

StockReservationSchema.index({ orderId: 1 }, { unique: true });
StockReservationSchema.index({ status: 1, expiresAt: 1 });
StockReservationSchema.index({ 'items.itemId': 1, status: 1 });
