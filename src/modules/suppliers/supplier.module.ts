import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SuppliersController } from './supplier.controller.js';
import { SupplierService } from './supplier.service.js';
import { Supplier, SupplierSchema } from './schemas/supplier.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
    ]),
  ],
  controllers: [SuppliersController],
  providers: [SupplierService],
  exports: [SupplierService],
})
export class SuppliersModule {}
