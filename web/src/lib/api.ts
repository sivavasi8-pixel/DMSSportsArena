export class ApiError extends Error {
  constructor(public status: number, message: string, public data: any = {}) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    credentials: "same-origin",
    headers: opts.form ? undefined : opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data ?? {});
  return data as T;
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, body: unknown = {}) => api<T>(p, { method: "POST", body });
export const patch = <T = any>(p: string, body: unknown) => api<T>(p, { method: "PATCH", body });
export const put = <T = any>(p: string, body: unknown) => api<T>(p, { method: "PUT", body });
export const del = <T = any>(p: string) => api<T>(p, { method: "DELETE" });
