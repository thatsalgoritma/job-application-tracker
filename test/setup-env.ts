process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/job_tracker?schema=public';
process.env.JWT_SECRET ??= 'test-only-secret-that-is-at-least-32-characters';
