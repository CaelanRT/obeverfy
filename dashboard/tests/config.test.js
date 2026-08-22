import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSupabaseError, validateSupabaseConfig } from '../src/lib/config.js';

test('accepts a configured browser-safe Supabase client', () => {
  assert.deepEqual(
    validateSupabaseConfig(
      'https://project.supabase.co',
      'sb_publishable_example-key',
    ),
    [],
  );
});

test('reports missing, placeholder, malformed, and secret configuration', () => {
  assert.equal(validateSupabaseConfig('', '').length, 2);
  assert.equal(
    validateSupabaseConfig('https://xxxxx.supabase.co', 'sb_publishable_...').length,
    2,
  );
  assert.deepEqual(validateSupabaseConfig('not-a-url', 'sb_publishable_key'), [
    'VITE_SUPABASE_URL is not a valid URL.',
  ]);
  assert.match(
    validateSupabaseConfig('https://project.supabase.co', 'sb_secret_key')[0],
    /secret key/,
  );
});

test('formats Supabase errors with a safe fallback', () => {
  assert.equal(formatSupabaseError({ message: '  Request failed  ' }), 'Request failed');
  assert.equal(formatSupabaseError(null, 'Try again later.'), 'Try again later.');
});
