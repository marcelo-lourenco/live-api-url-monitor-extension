export interface UrlItem {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  interval: number;
  expectedStatusCode: number;
  headers?: Record<string, string>;
  username?: string;
  password?: string;
  lastStatus?: 'up' | 'down';
  lastChecked?: string;
}

export function createDefaultUrlItem(): Omit<UrlItem, 'id'> {
  return {
    name: '',
    url: '',
    method: 'GET',
    interval: 60,
    expectedStatusCode: 200,
    headers: {},
    lastStatus: undefined,
    lastChecked: undefined
  };
}