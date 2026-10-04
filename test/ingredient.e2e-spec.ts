import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { Ingredient } from './../src/modules/ingredient/schemas/ingredient.schema.js';

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
      const payload = { name: 'Tomate', unit: 'kg', stock: 25, cost: 18.5 };

      const response = await request(app.getHttpServer())
        .post('/ingredients')
        .send(payload)
        .expect(201);

      expect(response.body).toMatchObject(payload);
      expect(response.body._id).toBeDefined();

      const persisted = await ingredientModel.findById(response.body._id).exec();
      expect(persisted).not.toBeNull();
      expect(persisted?.name).toBe('Tomate');
    });

    it('aplica el valor por defecto de cost cuando se omite', async () => {
      const response = await request(app.getHttpServer())
        .post('/ingredients')
        .send({ name: 'Sal', unit: 'kg', stock: 10 })
        .expect(201);

      expect(response.body.cost).toBe(0);
    });

    it('rechaza un payload sin name', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ unit: 'kg', stock: 5 })
        .expect(400);
    });

    it('rechaza un stock negativo', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ name: 'Cebolla', unit: 'kg', stock: -5 })
        .expect(400);
    });

    it('rechaza propiedades no declaradas en el DTO', async () => {
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ name: 'Cebolla', unit: 'kg', stock: 5, hack: 1 })
        .expect(400);
    });

    it('devuelve 409 si el nombre ya existe', async () => {
      const payload = { name: 'Cebolla', unit: 'kg', stock: 5, cost: 10 };
      await request(app.getHttpServer()).post('/ingredients').send(payload).expect(201);

      await request(app.getHttpServer())
        .post('/ingredients')
        .send(payload)
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
        .send({ name: 'Harina', unit: 'kg', stock: 50, cost: 18.5 });
      await request(app.getHttpServer())
        .post('/ingredients')
        .send({ name: 'Aceite', unit: 'litro', stock: 20, cost: 120 });

      const response = await request(app.getHttpServer())
        .get('/ingredients')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.map((i: { name: string }) => i.name).sort()).toEqual([
        'Aceite',
        'Harina',
      ]);
    });
  });

  describe('GET /ingredients/:id', () => {
    it('devuelve el ingrediente solicitado', async () => {
      const created = await request(app.getHttpServer())
        .post('/ingredients')
        .send({ name: 'Ajo', unit: 'kg', stock: 2, cost: 30 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/ingredients/${created.body._id}`)
        .expect(200);

      expect(response.body).toMatchObject({ name: 'Ajo', unit: 'kg', stock: 2, cost: 30 });
    });

    it('devuelve 404 con un ObjectId válido pero inexistente', async () => {
      await request(app.getHttpServer())
        .get('/ingredients/6abdfaa63ceac40d52dfea99')
        .expect(404);
    });

    it('devuelve 404 con un id que no es un ObjectId', async () => {
      await request(app.getHttpServer()).get('/ingredients/no-es-un-id').expect(404);
    });
  });
});
