import type { ZodError } from 'zod';

export function fieldsFromZod(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== 'string' || fields[key]) continue;
    if (issue.code === 'invalid_string') fields[key] = 'email';
    else if (issue.code === 'too_big') fields[key] = 'range';
    else if (issue.code === 'too_small' && (issue.type === 'number' || issue.type === 'array')) fields[key] = 'range';
    else if (issue.code === 'too_small' && typeof issue.minimum === 'number' && issue.minimum >= 10) fields[key] = 'short';
    else if (issue.code === 'too_small') fields[key] = 'required';
    else fields[key] = 'invalid';
  }
  return fields;
}

export function takenField(error: unknown): 'email' | 'phone' | null {
  const parts = [error instanceof Error ? error.message : ''];
  if (error && typeof error === 'object' && 'meta' in error) {
    parts.push(JSON.stringify((error as { meta?: unknown }).meta ?? ''));
  }
  const text = parts.join(' ');
  if (text.includes('UX_Users_phone') || text.includes('UX_Users_tenant_phone')) return 'phone';
  if (text.includes('UX_Users_email')) return 'email';
  return null;
}
