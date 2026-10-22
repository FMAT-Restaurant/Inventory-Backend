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
    },
  },
});
