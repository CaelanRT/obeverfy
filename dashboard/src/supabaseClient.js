import { createClient } from '@supabase/supabase-js';
import { validateSupabaseConfig } from './lib/config';

export { formatSupabaseError, validateSupabaseConfig } from './lib/config';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

const issues = validateSupabaseConfig(supabaseUrl, supabasePublishableKey);

export const supabaseConfiguration = Object.freeze({
  isValid: issues.length === 0,
  issues: Object.freeze(issues),
});

export const supabase = supabaseConfiguration.isValid
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;
