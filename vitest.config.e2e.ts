import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const TEST_DATABASE = 'inventory_test';

const baseUri =
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/inventory';

const testUri = baseUri.replace(/(\/\/[^/]*\/)[^/?]+/, `$1${TEST_DATABASE}`);

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      MONGODB_URI: testUri,
      // Los e2e de negocio no pasan por Kong. La autenticación se prueba
      // de forma dedicada en test/auth.e2e-spec.ts con su propia app.
      AUTH_ENABLED: 'false',
    },
  },
});
