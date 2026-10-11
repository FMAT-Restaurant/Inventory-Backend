import { ForbiddenException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestEnvGuard } from './test-env.guard.js';

describe('TestEnvGuard', () => {
  const guard = new TestEnvGuard();
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it.each(['development', 'dev', 'qa'])(
    'permite el reset cuando NODE_ENV=%s',
    (env) => {
      vi.stubEnv('NODE_ENV', env);
      expect(guard.canActivate()).toBe(true);
    },
  );

  it('permite el reset cuando NODE_ENV no está definido', () => {
    delete process.env.NODE_ENV;
    expect(guard.canActivate()).toBe(true);
  });

  it.each(['production', 'staging'])(
    'bloquea el reset cuando NODE_ENV=%s',
    (env) => {
      vi.stubEnv('NODE_ENV', env);
      expect(() => guard.canActivate()).toThrow(ForbiddenException);
    },
  );
});
