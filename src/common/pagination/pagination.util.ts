export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function normalizePagination(
  page?: number,
  limit?: number,
  maxLimit = MAX_LIMIT,
): { page: number; limit: number } {
  const normalizedLimit = Math.min(
    Math.max(Math.trunc(limit ?? DEFAULT_LIMIT), 1),
    maxLimit,
  );
  const normalizedPage = Math.max(Math.trunc(page ?? DEFAULT_PAGE), 1);
  return { page: normalizedPage, limit: normalizedLimit };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(limit, 1)));
  const safePage = Math.min(page, totalPages);
  return {
    items,
    total,
    page: safePage,
    limit,
    totalPages,
  };
}
