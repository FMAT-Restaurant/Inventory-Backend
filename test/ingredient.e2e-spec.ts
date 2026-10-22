import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { Ingredient } from './../src/modules/ingredient/schemas/ingredient.schema.js';

const validPayload = {
  sku: 'ING-0001',
  name: 'Tomate',
  category: 'Verduras',
  unit: 'kg',
  minStock: 10,
  storageCondition: 'Refrigerado',
};

describe('IngredientsController (e2e)', () => {
  let app: INestApplication<App>;
  let ingredientModel: Model<Ingredient>;

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

    ingredientModel = app.get<Model<Ingredient>>(getModelToken(Ingredient.name));
  });

  beforeEach(async () => {
    await ingredientModel.deleteMany({});
  });

  afterAll(async () => {
    await ingredientModel.deleteMany({});
    await app.close();
  });

  describe('POST /ingredients', () => {
    it('crea un ingrediente y lo persiste en MongoDB', async () => {
      const response = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      expect(response.body).toMatchObject(validPayload);
      expect(response.body._id).toBeDefined();
      expect(response.body.isActive).toBe(true);

      const persisted = await ingredientModel.findById(response.body._id).exec();
      expect(persisted).not.toBeNull();
      expect(persisted?.name).toBe('Tomate');
      expect(persisted?.sku).toBe('ING-0001');
    });

    it('expone los virtuals de stock y estado en la respuesta', async () => {
      const response = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      expect(response.body.availableStock).toBe(0);
      expect(response.body.status).toBe('CRITICO');
    });

    it('aplica los valores por defecto de isPerishable y averageCost', async () => {
      const response = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      expect(response.body.isPerishable).toBe(false);
      expect(response.body.averageCost).toBe(0);
    });

    it('rechaza un payload sin sku', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ ...validPayload, sku: undefined })
        .expect(400);
    });

    it('rechaza un payload sin storageCondition', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ ...validPayload, storageCondition: undefined })
        .expect(400);
    });

    it('rechaza un stock mínimo negativo', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ ...validPayload, minStock: -5 })
        .expect(400);
    });

    it('rechaza un supplierIdSugested que no es un ObjectId', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ ...validPayload, supplierIdSugested: 'no-es-un-objectid' })
        .expect(400);
    });

    it('rechaza propiedades no declaradas en el DTO', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ ...validPayload, hack: 1 })
        .expect(400);
    });

    it('devuelve 409 si el nombre ya existe', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ ...validPayload, sku: 'ING-0002' })
        .expect(409);
    });
  });

  describe('GET /ingredients', () => {
    it('devuelve una lista vacía cuando no hay registros', async () => {
      const response = await request(app.getHttpServer())
        .get('/ingredients')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('devuelve todos los ingredientes persistidos', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ ...validPayload, sku: 'ING-0001', name: 'Harina' });
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({
          ...validPayload,
          sku: 'ING-0002',
          name: 'Aceite',
          unit: 'litro',
        });

      const response = await request(app.getHttpServer())
        .get('/ingredients')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.map((i: { name: string }) => i.name).sort()).toEqual([
        'Aceite',
        'Harina',
      ]);
    });

    it('no devuelve los ingredientes desactivados', async () => {
      const created = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/ingredients/${created.body._id}`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/ingredients')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /ingredients/:id', () => {
    it('devuelve el ingrediente solicitado', async () => {
      const created = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/ingredients/${created.body._id}`)
        .expect(200);

      expect(response.body).toMatchObject(validPayload);
    });

    it('devuelve 404 con un ObjectId válido pero inexistente', async () => {
      await request(app.getHttpServer())
        .get('/ingredients/6abdfaa63ceac40d52dfea99')
        .expect(404);
    });

    it('devuelve 404 con un id que no es un ObjectId', async () => {
      await request(app.getHttpServer())
        .get('/ingredients/no-es-un-id')
        .expect(404);
    });

    it('devuelve 404 con un ingrediente desactivado', async () => {
      const created = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/ingredients/${created.body._id}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/ingredients/${created.body._id}`)
        .expect(404);
    });
  });

  describe('PATCH /ingredients/:id', () => {
    it('actualiza los campos enviados', async () => {
      const created = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`/ingredients/${created.body._id}`)
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
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/ingredients/${created.body._id}`)
        .send({ isActive: false })
        .expect(400);
    });

    it('devuelve 400 con un payload vacío', async () => {
      const created = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/ingredients/${created.body._id}`)
        .send({})
        .expect(400);
    });

    it('devuelve 404 con un id que no es un ObjectId', async () => {
      await request(app.getHttpServer())
        .patch('/ingredients/no-es-un-id')
        .send({ name: 'Tomate' })
        .expect(404);
    });

    it('devuelve 404 con un ingrediente desactivado', async () => {
      const created = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/ingredients/${created.body._id}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/ingredients/${created.body._id}`)
        .send({ name: 'Tomate perita' })
        .expect(404);

      const persisted = await ingredientModel.findById(created.body._id).exec();
      expect(persisted?.name).toBe('Tomate');
    });

    it('devuelve 404 con un ObjectId válido pero inexistente', async () => {
      await request(app.getHttpServer())
        .patch('/ingredients/6abdfaa63ceac40d52dfea99')
        .send({ name: 'Tomate' })
        .expect(404);
    });

    it('devuelve 409 si el nombre ya existe', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ ...validPayload, sku: 'ING-0001', name: 'Harina' })
        .expect(201);

      const created = await request(app.getHttpServer())
        .post('/ingredients')
        .send({ ...validPayload, sku: 'ING-0002', name: 'Aceite' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/ingredients/${created.body._id}`)
        .send({ name: 'Harina' })
        .expect(409);
    });
  });

  describe('DELETE /ingredients/:id', () => {
    it('desactiva el ingrediente sin borrarlo de MongoDB', async () => {
      const created = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/ingredients/${created.body._id}`)
        .expect(200);

      const persisted = await ingredientModel.findById(created.body._id).exec();
      expect(persisted).not.toBeNull();
      expect(persisted?.isActive).toBe(false);
    });

    it('devuelve 404 con un id que no es un ObjectId', async () => {
      await request(app.getHttpServer())
        .delete('/ingredients/no-es-un-id')
        .expect(404);
    });

    it('devuelve 404 con un ObjectId válido pero inexistente', async () => {
      await request(app.getHttpServer())
        .delete('/ingredients/6abdfaa63ceac40d52dfea99')
        .expect(404);
    });

    it('devuelve 404 si el ingrediente ya estaba desactivado', async () => {
      const created = await request(app.getHttpServer())
        .post('/ingredients')
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/ingredients/${created.body._id}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/ingredients/${created.body._id}`)
        .expect(404);
    });
  });
});
