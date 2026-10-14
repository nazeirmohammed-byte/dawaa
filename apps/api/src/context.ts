import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestStore = {
  requestId: string;
  tenantId?: string;
};

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function currentTenantId(): string | undefined {
  return requestContext.getStore()?.tenantId;
}

export function setCurrentTenantId(tenantId: string): void {
  const store = requestContext.getStore();
  if (store) store.tenantId = tenantId;
}
