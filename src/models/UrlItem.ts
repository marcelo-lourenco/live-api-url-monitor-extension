export type AuthType = 'noauth' | 'apikey' | 'basic' | 'bearer' | 'oauth2' | 'awsv4' | 'oauth1';

export interface NoAuth {
  type: 'noauth';
}

export interface ApiKeyAuth {
  type: 'apikey';
  key: string;
  value: string;
  addTo: 'header' | 'query';
}

export interface BasicAuth {
  type: 'basic';
  username: string;
  password?: string;
}

export interface BearerTokenAuth {
  type: 'bearer';
  token: string;
}

export interface OAuth2Auth {
  type: 'oauth2';
  token: string;
  headerPrefix: string;
}

// Placeholder interfaces for complex auth types. Their fields can be added later.
export interface AwsV4Auth { type: 'awsv4'; accessKey?: string; secretKey?: string; region?: string; service?: string; sessionToken?: string; }
export interface OAuth1Auth { type: 'oauth1'; consumerKey?: string; consumerSecret?: string; token?: string; tokenSecret?: string; }

// A union type for all possible authentication configurations.
export type AuthConfig = NoAuth | ApiKeyAuth | BasicAuth | BearerTokenAuth | OAuth2Auth | AwsV4Auth | OAuth1Auth;

export interface UrlItem {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  interval: number;
  expectedStatusCode: number;
  headers?: Record<string, string>;
  auth?: AuthConfig;
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
    auth: { type: 'noauth' },
    lastStatus: undefined,
    lastChecked: undefined
  };
}