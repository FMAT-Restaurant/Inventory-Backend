import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { RecipeController } from './recipe.controller.js';
import { RecipeService } from './recipe.service.js';
import { RecipeResponseDto } from './dto/recipe-response.dto.js';

describe('RecipeController', () => {
  let controller: RecipeController;
  let service: RecipeService;

  const mockResponseDto: RecipeResponseDto = {
    id: '507f1f77bcf86cd799439011',
    plateId: 'PLATE-001',
    name: 'Hamburguesa clásica',
    isAvailable: true,
    maxPreparablePortions: 10,
    productionCost: 25.5,
    items: [
      {
        ingredientId: '60d5ec9af682fbd39a1b865b',
        ingredientName: 'Carne',
        unit: 'kg',
        requiredQuantity: 0.2,
        availableStock: 2,
        hasSufficientStock: true,
      },
    ],
  };

  const mockRecipeService = {
    registerOrUpdate: vi.fn(),
    findAll: vi.fn().mockResolvedValue([mockResponseDto]),
    findOne: vi.fn().mockResolvedValue(mockResponseDto),
    update: vi.fn().mockResolvedValue(mockResponseDto),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  const mockRes = {
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecipeController],
      providers: [
        {
          provide: RecipeService,
          useValue: mockRecipeService,
        },
      ],
    }).compile();

    controller = module.get<RecipeController>(RecipeController);
    service = module.get<RecipeService>(RecipeService);
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('createOrUpdate', () => {
    it('debería responder con HTTP 201 si es un nuevo registro', async () => {
      mockRecipeService.registerOrUpdate.mockResolvedValue({
        recipe: mockResponseDto,
        isNew: true,
      });

      const dto = {
        plateId: 'PLATE-001',
        name: 'Hamburguesa clásica',
        items: [{ ingredientId: '60d5ec9af682fbd39a1b865b', requiredQuantity: 0.2 }],
      };

      const result = await controller.createOrUpdate(dto, mockRes);

      expect(service.registerOrUpdate).toHaveBeenCalledWith(dto);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result).toEqual(mockResponseDto);
    });

    it('debería responder con HTTP 200 si fue actualización idempotente', async () => {
      mockRecipeService.registerOrUpdate.mockResolvedValue({
        recipe: mockResponseDto,
        isNew: false,
      });

      const dto = {
        plateId: 'PLATE-001',
        name: 'Hamburguesa clásica',
        items: [{ ingredientId: '60d5ec9af682fbd39a1b865b', requiredQuantity: 0.2 }],
      };

      const result = await controller.createOrUpdate(dto, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toEqual(mockResponseDto);
    });
  });

  describe('findAll', () => {
    it('debería retornar listado de recetas', async () => {
      const result = await controller.findAll({});

      expect(service.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual([mockResponseDto]);
    });
  });

  describe('findOne', () => {
    it('debería retornar una receta por ID o plateId', async () => {
      const result = await controller.findOne('PLATE-001');

      expect(service.findOne).toHaveBeenCalledWith('PLATE-001');
      expect(result).toEqual(mockResponseDto);
    });
  });

  describe('update', () => {
    it('debería actualizar una receta', async () => {
      const updateDto = { name: 'Nueva Hamburguesa' };
      const result = await controller.update('PLATE-001', updateDto);

      expect(service.update).toHaveBeenCalledWith('PLATE-001', updateDto);
      expect(result).toEqual(mockResponseDto);
    });
  });

  describe('remove', () => {
    it('debería eliminar una receta', async () => {
      await controller.remove('PLATE-001');

      expect(service.remove).toHaveBeenCalledWith('PLATE-001');
    });
  });
});
