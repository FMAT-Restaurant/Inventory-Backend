import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { Item } from './../src/modules/item/schemas/item.schema.js';

const validPayload = {
  sku: 'ING-0001',
  name: 'Tomate',
  category: 'Verduras',
  unit: 'kg',
  minStock: 10,
  storageCondition: 'Refrigerado',
};

describe('ItemsController (e2e)', () => {
  let app: INestApplication<App>;
  let itemModel: Model<Item>;

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

    itemModel = app.get<Model<Item>>(getModelToken(Item.name));
  });

  beforeEach(async () => {
    await itemModel.deleteMany({});
  });

  afterAll(async () => {
    await itemModel.deleteMany({});
    await app.close();
  });

  describe('POST /items', () => {
    it('crea un item y lo persiste en MongoDB', async () => {
      const response = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      expect(response.body).toMatchObject(validPayload);
      expect(response.body._id).toBeDefined();
      expect(response.body.isActive).toBe(true);

      const persisted = await itemModel.findById(response.body._id).exec();
      expect(persisted).not.toBeNull();
      expect(persisted?.name).toBe('Tomate');
      expect(persisted?.sku).toBe('ING-0001');
    });

    it('expone los virtuals de stock y estado en la respuesta', async () => {
      const response = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      expect(response.body.availableStock).toBe(0);
      expect(response.body.status).toBe('CRITICO');
    });

    it('aplica los valores por defecto de isPerishable y averageCost', async () => {
      const response = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      expect(response.body.isPerishable).toBe(false);
      expect(response.body.averageCost).toBe(0);
    });

    it('rechaza un payload sin sku', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: undefined })
        .expect(400);
    });

    it('rechaza un payload sin storageCondition', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, storageCondition: undefined })
        .expect(400);
    });

    it('rechaza un stock mínimo negativo', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, minStock: -5 })
        .expect(400);
    });

    it('rechaza un supplierIdSugested que no es un ObjectId', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, supplierIdSugested: 'no-es-un-objectid' })
        .expect(400);
    });

    it('rechaza propiedades no declaradas en el DTO', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, hack: 1 })
        .expect(400);
    });

    it('devuelve 409 si el nombre ya existe', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0002' })
        .expect(409);
    });
  });

  describe('GET /items', () => {
    it('devuelve una lista vacía cuando no hay registros', async () => {
      const response = await request(app.getHttpServer())
        .get('/items')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('devuelve todos los items persistidos', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0001', name: 'Harina' });
      await request(app.getHttpServer())
        .post('/items')
        .send({
          ...validPayload,
          sku: 'ING-0002',
          name: 'Aceite',
          unit: 'litro',
        });

      const response = await request(app.getHttpServer())
        .get('/items')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.map((i: { name: string }) => i.name).sort()).toEqual(
        ['Aceite', 'Harina'],
      );
    });

    it('no devuelve los items desactivados', async () => {
      const created = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/items/${created.body._id}`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/items')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('busca por coincidencia parcial del nombre', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0001', name: 'Tomate' });
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0002', name: 'Tomate perita' });
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0003', name: 'Harina' });

      const response = await request(app.getHttpServer())
        .get('/items')
        .query({ q: 'tom' })
        .expect(200);

      expect(
        response.body.map((item: { name: string }) => item.name).sort(),
      ).toEqual(['Tomate', 'Tomate perita']);
    });

    it('busca sin distinguir mayúsculas', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0001', name: 'Tomate' });

      const response = await request(app.getHttpServer())
        .get('/items')
        .query({ q: 'TOMATE' })
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Tomate');
    });

    it('devuelve una lista vacía cuando no hay coincidencias', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0001', name: 'Tomate' });

      const response = await request(app.getHttpServer())
        .get('/items')
        .query({ q: 'cebolla' })
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('no devuelve items desactivados aunque coincidan con la búsqueda', async () => {
      const created = await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0001', name: 'Tomate' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/items/${created.body._id}`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/items')
        .query({ q: 'tomate' })
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('trata los caracteres especiales de regex como texto literal', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0001', name: 'Tom.ate' });
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0002', name: 'Tomate' });

      const response = await request(app.getHttpServer())
        .get('/items')
        .query({ q: 'tom.ate' })
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Tom.ate');
    });

    it('devuelve todos los items activos cuando q está vacío', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0001', name: 'Tomate' });
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0002', name: 'Harina' });

      const response = await request(app.getHttpServer())
        .get('/items')
        .query({ q: '' })
        .expect(200);

      expect(response.body).toHaveLength(2);
    });
  });

  describe('GET /items/:id', () => {
    it('devuelve el item solicitado', async () => {
      const created = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/items/${created.body._id}`)
        .expect(200);

      expect(response.body).toMatchObject(validPayload);
    });

    it('devuelve 404 con un ObjectId válido pero inexistente', async () => {
      await request(app.getHttpServer())
        .get('/items/6abdfaa63ceac40d52dfea99')
        .expect(404);
    });

    it('devuelve 404 con un id que no es un ObjectId', async () => {
      await request(app.getHttpServer()).get('/items/no-es-un-id').expect(404);
    });

    it('devuelve 404 con un item desactivado', async () => {
      const created = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/items/${created.body._id}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/items/${created.body._id}`)
        .expect(404);
    });
  });

  describe('PATCH /items/:id', () => {
    it('actualiza los campos enviados', async () => {
      const created = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`/items/${created.body._id}`)
        .send({ name: 'Tomate perita', minStock: 25 })
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Tomate perita',
        minStock: 25,
        sku: 'ING-0001',
      });
    });

    it('no permite cambiar el estado activo', async () => {
      const created = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/items/${created.body._id}`)
        .send({ isActive: false })
        .expect(400);
    });

    it('devuelve 400 con un payload vacío', async () => {
      const created = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/items/${created.body._id}`)
        .send({})
        .expect(400);
    });

    it('devuelve 404 con un id que no es un ObjectId', async () => {
      await request(app.getHttpServer())
        .patch('/items/no-es-un-id')
        .send({ name: 'Tomate' })
        .expect(404);
    });

    it('devuelve 404 con un item desactivado', async () => {
      const created = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/items/${created.body._id}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/items/${created.body._id}`)
        .send({ name: 'Tomate perita' })
        .expect(404);

      const persisted = await itemModel.findById(created.body._id).exec();
      expect(persisted?.name).toBe('Tomate');
    });

    it('devuelve 404 con un ObjectId válido pero inexistente', async () => {
      await request(app.getHttpServer())
        .patch('/items/6abdfaa63ceac40d52dfea99')
        .send({ name: 'Tomate' })
        .expect(404);
    });

    it('devuelve 409 si el nombre ya existe', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0001', name: 'Harina' })
        .expect(201);

      const created = await request(app.getHttpServer())
        .post('/items')
        .send({ ...validPayload, sku: 'ING-0002', name: 'Aceite' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/items/${created.body._id}`)
        .send({ name: 'Harina' })
        .expect(409);
    });
  });

  describe('DELETE /items/:id', () => {
    it('desactiva el item sin borrarlo de MongoDB', async () => {
      const created = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/items/${created.body._id}`)
        .expect(200);

      const persisted = await itemModel.findById(created.body._id).exec();
      expect(persisted).not.toBeNull();
      expect(persisted?.isActive).toBe(false);
    });

    it('devuelve 404 con un id que no es un ObjectId', async () => {
      await request(app.getHttpServer())
        .delete('/items/no-es-un-id')
        .expect(404);
    });

    it('devuelve 404 con un ObjectId válido pero inexistente', async () => {
      await request(app.getHttpServer())
        .delete('/items/6abdfaa63ceac40d52dfea99')
        .expect(404);
    });

    it('devuelve 404 si el item ya estaba desactivado', async () => {
      const created = await request(app.getHttpServer())
        .post('/items')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/items/${created.body._id}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/items/${created.body._id}`)
        .expect(404);
    });
  });
});
