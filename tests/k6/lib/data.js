let sequence = 0;

export function uniqueSuffix() {
  sequence += 1;
  const vu = typeof __VU === 'number' ? __VU : 0;
  const iter = typeof __ITER === 'number' ? __ITER : 0;
  return `${Date.now().toString(36)}-${vu}-${iter}-${sequence}`;
}

export function itemPayload(overrides = {}) {
  const suffix = uniqueSuffix();
  return Object.assign(
    {
      sku: `K6-${suffix}`.toUpperCase(),
      name: `k6 item ${suffix}`,
      description: 'Item creado por las pruebas k6',
      category: 'k6',
      unit: 'kg',
      minStock: 5,
      isPerishable: true,
      storageCondition: 'Refrigerado',
      averageCost: 10,
    },
    overrides,
  );
}

export function supplierPayload(overrides = {}) {
  const suffix = uniqueSuffix();
  return Object.assign(
    {
      name: `k6 supplier ${suffix}`,
      contactName: 'k6 load test',
      phone: '+52 55 0000 0000',
      email: `k6-${suffix}@example.com`,
      address: 'Origen k6',
    },
    overrides,
  );
}

export function batchPayload(itemId, overrides = {}) {
  return Object.assign(
    {
      itemId,
      quantity: 100,
      expirationDate: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      cost: 10,
      batchNumber: `K6-${uniqueSuffix()}`.toUpperCase(),
    },
    overrides,
  );
}

export function recipePayload(itemIds, overrides = {}) {
  const suffix = uniqueSuffix();
  return Object.assign(
    {
      plateId: `K6-PLATE-${suffix}`.toUpperCase(),
      name: `k6 recipe ${suffix}`,
      items: itemIds.map((itemId) => ({ itemId, requiredQuantity: 1 })),
    },
    overrides,
  );
}

export function menuPlateEvent({ sourceId, name, items, sourceType = 'plate' }) {
  return {
    sourceId,
    name,
    sourceType,
    items,
    timestamp: new Date().toISOString(),
  };
}

export function orderEvent({
  eventId,
  orderId,
  items,
  reason,
  correlationId,
  version = 1,
}) {
  return {
    eventId,
    version,
    occurredAt: new Date().toISOString(),
    correlationId: correlationId || eventId,
    orderId,
    items,
    reason,
  };
}
