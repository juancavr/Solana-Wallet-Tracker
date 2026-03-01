import { afterEach } from 'vitest';

// Use in-memory DB for tests
process.env.DB_PATH = ':memory:';
// NODE_ENV is read-only in strict TS; cast through unknown to set it
(process.env as Record<string, string>)['NODE_ENV'] = 'test';

afterEach(() => {
  // Reset the global DB singleton between tests
  if (global.__coinstatDb) {
    try {
      global.__coinstatDb.close();
    } catch {}
    global.__coinstatDb = undefined;
  }
});
