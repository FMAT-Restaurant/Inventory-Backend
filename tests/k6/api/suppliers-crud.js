import { check } from 'k6';
import { smokeOptions } from '../config/options.js';
import { supplierPayload } from '../lib/data.js';
import { del, get, json, patch, post } from '../lib/http.js';

export const options = smokeOptions;

export default function () {
  const payload = supplierPayload();

  const created = post('/suppliers', payload, { tag: 'suppliers/create' });
  const supplier = json(created);
  const supplierId = supplier && supplier._id;

  check(created, {
    'crear proveedor responde 201': (res) => res.status === 201,
    'crear proveedor devuelve id': () => Boolean(supplierId),
    'crear proveedor conserva nombre': () =>
      Boolean(supplier) && supplier.name === payload.name,
  });

  const listed = get('/suppliers', { tag: 'suppliers/list' });
  check(listed, {
    'listar proveedores responde 200': (res) => res.status === 200,
    'listar proveedores incluye el registro': (res) => {
      const body = json(res);
      return (
        Array.isArray(body) &&
        body.some((entry) => entry._id === supplierId)
      );
    },
  });

  const found = get(`/suppliers/${supplierId}`, { tag: 'suppliers/get' });
  check(found, {
    'obtener proveedor responde 200': (res) => res.status === 200,
  });

  const updated = patch(
    `/suppliers/${supplierId}`,
    { contactName: 'contacto k6 actualizado' },
    { tag: 'suppliers/update' },
  );
  check(updated, {
    'actualizar proveedor responde 200': (res) => res.status === 200,
    'actualizar proveedor cambia contacto': (res) => {
      const body = json(res);
      return Boolean(body) && body.contactName === 'contacto k6 actualizado';
    },
  });

  const duplicate = post('/suppliers', payload, {
    tag: 'suppliers/duplicate',
  });
  check(duplicate, {
    'proveedor duplicado responde 409': (res) => res.status === 409,
  });

  const removed = del(`/suppliers/${supplierId}`, {
    tag: 'suppliers/delete',
  });
  check(removed, {
    'eliminar proveedor responde 200': (res) => res.status === 200,
  });

  const afterDelete = get(`/suppliers/${supplierId}`, {
    tag: 'suppliers/get-after-delete',
  });
  check(afterDelete, {
    'proveedor eliminado responde 404': (res) => res.status === 404,
  });
}
