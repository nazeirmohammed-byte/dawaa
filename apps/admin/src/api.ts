export class ApiError extends Error {
  readonly fields: Record<string, string>;
  constructor(
    message: string,
    readonly code = '',
    fields: Record<string, string> = {},
  ) {
    super(message);
    this.fields = fields;
  }
}

function fieldsOf(details: unknown): Record<string, string> {
  if (!details || typeof details !== 'object') return {};
  const fields = (details as { fields?: unknown }).fields;
  if (!fields || typeof fields !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string; details?: unknown };
  if (!response.ok) throw new ApiError(body.message ?? 'تعذر إكمال الطلب', body.code ?? '', fieldsOf(body.details));
  return body as T;
}

export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}
