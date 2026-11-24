import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { Batch, BatchStatus } from './../src/modules/batch/schemas/batch.schema.js';
import { BatchService } from './../src/modules/batch/batch.service.js';
import { Item } from './../src/modules/item/schemas/item.schema.js';
import { Supplier } from './../src/modules/suppliers/schemas/supplier.schema.js';
import {
  StockMovement,
  StockMovementType,
} from './../src/modules/stock-movement/schemas/stock-movement.schema.js';

describe('BatchController (e2e)', () => {
  let app: INestApplication<App>;
  let batchModel: Model<Batch>;
  let itemModel: Model<Item>;
  let supplierModel: Model<Supplier>;
  let movementModel: Model<StockMovement>;
  let batchService: BatchService;

  let itemId: string;
  let supplierId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    batchModel = app.get<Model<Batch>>(getModelToken(Batch.name));
    itemModel = app.get<Model<Item>>(getModelToken(Item.name));
    supplierModel = app.get<Model<Supplier>>(getModelToken(Supplier.name));
    movementModel = app.get<Model<StockMovement>>(
      getModelToken(StockMovement.name),
    );
    batchService = app.get(BatchService);
  });

  beforeEach(async () => {
    await Promise.all([
      batchModel.deleteMany({}),
      movementModel.deleteMany({}),
      itemModel.deleteMany({}),
      supplierModel.deleteMany({}),
    ]);

    const item = await itemModel.create({
      sku: 'ING-BATCH-01',
      name: 'Tomate Saladet',
      category: 'Verduras',
      unit: 'kg',
      minStock: 5,
      storageCondition: 'Refrigerado',
    });
    itemId = String(item._id);

    const supplier = await supplierModel.create({
      name: 'Proveedor Central E2E',
      contactName: 'María López',
      phone: '+52 999 000 1111',
    });
    supplierId = String(supplier._id);
  });

  afterAll(async () => {
    await Promise.all([
      batchModel.deleteMany({}),
      movementModel.deleteMany({}),
      itemModel.deleteMany({}),
      supplierModel.deleteMany({}),
    ]);
    await app.close();
  });

  describe('POST /batches', () => {
    it('crea un lote, combina el SKU, sincroniza stock del item y registra movimiento IN', async () => {
      const response = await request(app.getHttpServer())
        .post('/batches')
        .send({
          batchNumber: 'LOTE-001',
          itemId,
          supplierId,
          quantity: 12,
          cost: 25.5,
          expirationDate: '2099-12-31',
        })
        .expect(201);

      expect(response.body.batchNumber).toBe('ING-BATCH-01-LOTE-001');
      expect(response.body.status).toBe(BatchStatus.ACTIVE);
      expect(response.body.initialQuantity).toBe(12);
      expect(response.body.purchaseCost).toBe(25.5);

      const updatedItem = await itemModel.findById(itemId).exec();
      expect(updatedItem?.totalStock).toBe(12);
      expect(updatedItem?.averageCost).toBe(25.5);

      const movementsRes = await request(app.getHttpServer())
        .get(`/movements?batchId=${response.body._id}`)
        .expect(200);
      expect(movementsRes.body).toHaveLength(1);
      expect(movementsRes.body[0].movementType).toBe(StockMovementType.IN);
      expect(movementsRes.body[0].quantity).toBe(12);
    });

    it('rechaza cost = 0 y quantity = 0 con 400', async () => {
      await request(app.getHttpServer())
        .post('/batches')
        .send({
          itemId,
          quantity: 10,
          cost: 0,
          expirationDate: '2099-12-31',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/batches')
        .send({
          itemId,
          quantity: 0,
          cost: 15,
          expirationDate: '2099-12-31',
        })
        .expect(400);
    });

    it('rechaza número de lote duplicado para el mismo item con 409', async () => {
      const payload = {
        batchNumber: 'DUP-01',
        itemId,
        quantity: 5,
        cost: 10,
        expirationDate: '2099-12-31',
      };

      await request(app.getHttpServer())
        .post('/batches')
        .send(payload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/batches')
        .send(payload)
        .expect(409);
    });
    it('permite crear lotes sin caducidad para insumos no perecederos y exige fecha para perecederos', async () => {
      const spoon = await itemModel.create({
        sku: 'UTC-01',
        name: 'Cucharas',
        category: 'Utensilios',
        unit: 'pza',
        minStock: 10,
        isPerishable: false,
        storageCondition: 'Ambiente',
      });

      const createdSpoonBatch = await request(app.getHttpServer())
        .post('/batches')
        .send({
          batchNumber: 'LOTE-01',
          itemId: String(spoon._id),
          quantity: 50,
          cost: 1.5,
        })
        .expect(201);

      expect(createdSpoonBatch.body.status).toBe(BatchStatus.ACTIVE);
      expect(createdSpoonBatch.body.expirationDate).toBeNull();

      const perishable = await itemModel.create({
        sku: 'VER-PER-01',
        name: 'Lechuga',
        category: 'Verduras',
        unit: 'kg',
        minStock: 2,
        isPerishable: true,
        storageCondition: 'Refrigerado',
      });

      await request(app.getHttpServer())
        .post('/batches')
        .send({
          itemId: String(perishable._id),
          quantity: 5,
          cost: 10,
        })
        .expect(400);
    });
  });

  describe('PATCH /batches/:id (ajuste, auditoría y reservedStock)', () => {
    it('actualiza cantidad con motivo, registra movimiento ADJUSTMENT y rechaza createdBy en body', async () => {
      const created = await request(app.getHttpServer())
        .post('/batches')
        .send({
          batchNumber: 'ADJ-01',
          itemId,
          quantity: 10,
          cost: 20,
          expirationDate: '2099-12-31',
        })
        .expect(201);

      // createdBy no está permitido en el DTO (forbidNonWhitelisted)
      await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({
          quantity: 8,
          reason: 'Conteo físico',
          createdBy: 'impostor',
        })
        .expect(400);

      const patched = await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({
          quantity: 8,
          reason: 'Corrección por conteo físico',
        })
        .expect(200);

      expect(patched.body.quantity).toBe(8);

      const adjustmentsRes = await request(app.getHttpServer())
        .get(
          `/movements?batchId=${created.body._id}&movementType=${StockMovementType.ADJUSTMENT}`,
        )
        .expect(200);
      expect(adjustmentsRes.body).toHaveLength(1);
      expect(adjustmentsRes.body[0].quantity).toBe(-2);
      expect(adjustmentsRes.body[0].reason).toBe(
        'Corrección por conteo físico',
      );
    });

    it('bloquea reducir stock por debajo de item.reservedStock con 409', async () => {
      const created = await request(app.getHttpServer())
        .post('/batches')
        .send({
          batchNumber: 'RES-01',
          itemId,
          quantity: 10,
          cost: 15,
          expirationDate: '2099-12-31',
        })
        .expect(201);

      await itemModel.updateOne({ _id: itemId }, { reservedStock: 7 }).exec();

      await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({ quantity: 5, reason: 'Intento inválido' })
        .expect(409);

      // Reducir a 7 sí cubre las 7 unidades reservadas
      await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({ quantity: 7, reason: 'Ajuste válido' })
        .expect(200);
    });

    it('bloquea edición de lote caducado salvo baja a cantidad 0', async () => {
      const created = await request(app.getHttpServer())
        .post('/batches')
        .send({
          batchNumber: 'EXP-01',
          itemId,
          quantity: 4,
          cost: 12,
          expirationDate: '2020-01-01',
        })
        .expect(201);

      expect(created.body.status).toBe(BatchStatus.EXPIRED);

      await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({ cost: 99 })
        .expect(400);

      const writtenOff = await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({ quantity: 0, reason: 'Baja por caducidad' })
        .expect(200);

      expect(writtenOff.body.status).toBe(BatchStatus.DEPLETED);

      // Agotado ya no se puede volver a modificar
      await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({ quantity: 2 })
        .expect(400);
    });
  });

  describe('DELETE /batches/:id', () => {
    it('elimina un lote activo sin consumo y bloquea lotes caducados o ya consumidos', async () => {
      const untouched = await request(app.getHttpServer())
        .post('/batches')
        .send({
          batchNumber: 'DEL-OK',
          itemId,
          quantity: 6,
          cost: 10,
          expirationDate: '2099-12-31',
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/batches/${untouched.body._id}`)
        .expect(200);

      const consumed = await request(app.getHttpServer())
        .post('/batches')
        .send({
          batchNumber: 'DEL-CONS',
          itemId,
          quantity: 10,
          cost: 10,
          expirationDate: '2099-12-31',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/batches/${consumed.body._id}`)
        .send({ quantity: 7, reason: 'Consumo parcial' })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/batches/${consumed.body._id}`)
        .expect(400);
    });
  });

  describe('GET /suppliers/:id/cost-history y edición pre/post consumo', () => {
    it('permite corregir cost y batchNumber antes del consumo y los bloquea tras consumo', async () => {
      const created = await request(app.getHttpServer())
        .post('/batches')
        .send({
          batchNumber: 'COST-01',
          itemId,
          supplierId,
          quantity: 10,
          cost: 30,
          expirationDate: '2099-12-31',
        })
        .expect(201);

      // Sin consumo: corrige error de captura en cost y batchNumber
      const corrected = await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({ cost: 45, batchNumber: 'COST-01-FIX' })
        .expect(200);
      expect(corrected.body.batchNumber).toBe('ING-BATCH-01-COST-01-FIX');

      const history = await request(app.getHttpServer())
        .get(
          `/suppliers/${supplierId}/cost-history?itemId=${itemId}&page=1&limit=10`,
        )
        .expect(200);
      expect(history.body.total).toBe(1);
      expect(history.body.items[0].cost).toBe(45);

      // Registrar consumo parcial y verificar bloqueo de cost/supplier/batchNumber
      await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({ quantity: 8, reason: 'Consumo parcial' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({ cost: 99 })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/batches/${created.body._id}`)
        .send({ batchNumber: 'OTRO-99' })
        .expect(400);
    });
  });

  describe('Consumo FEFO atómico bajo concurrencia', () => {
    it('consume en orden FEFO y evita stock negativo ante dos consumos paralelos', async () => {
      const first = await request(app.getHttpServer())
        .post('/batches')
        .send({
          batchNumber: 'FEFO-1',
          itemId,
          quantity: 5,
          cost: 10,
          expirationDate: '2099-01-01',
        })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/batches')
        .send({
          batchNumber: 'FEFO-2',
          itemId,
          quantity: 5,
          cost: 12,
          expirationDate: '2099-06-01',
        })
        .expect(201);

      await Promise.all([
        batchService.consumeByFefo(itemId, 4, 'ORD-CONC-1'),
        batchService.consumeByFefo(itemId, 4, 'ORD-CONC-2'),
      ]);

      const [b1, b2, updatedItem] = await Promise.all([
        batchModel.findById(first.body._id).exec(),
        batchModel.findById(second.body._id).exec(),
        itemModel.findById(itemId).exec(),
      ]);

      expect(b1?.quantity).toBe(0);
      expect(b1?.status).toBe(BatchStatus.DEPLETED);
      expect(b2?.quantity).toBe(2);
      expect(updatedItem?.totalStock).toBe(2);
    });
  });
});
