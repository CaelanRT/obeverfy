function isPlaceholder(value) {
  return value?.includes('xxxxx') || value?.endsWith('...');
}

export function validateSupabaseConfig(url, publishableKey) {
  const issues = [];

  if (!url) {
    issues.push('VITE_SUPABASE_URL is missing.');
  } else if (isPlaceholder(url)) {
    issues.push('VITE_SUPABASE_URL still contains its example value.');
  } else {
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        issues.push('VITE_SUPABASE_URL must use http or https.');
      }
    } catch {
      issues.push('VITE_SUPABASE_URL is not a valid URL.');
    }
  }

  if (!publishableKey) {
    issues.push('VITE_SUPABASE_PUBLISHABLE_KEY is missing.');
  } else if (isPlaceholder(publishableKey)) {
    issues.push('VITE_SUPABASE_PUBLISHABLE_KEY still contains its example value.');
  } else if (publishableKey.startsWith('sb_secret_')) {
    issues.push(
      'VITE_SUPABASE_PUBLISHABLE_KEY contains a secret key. Replace it immediately with a publishable key.',
    );
  }

  return issues;
}

export function formatSupabaseError(error, fallback = 'Supabase could not complete the request.') {
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}
