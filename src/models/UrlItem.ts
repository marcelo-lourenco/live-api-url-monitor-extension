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
export interface AwsV4Auth { type: 'awsv4'; accessKey?: string; secretKey?: string; service?: string; sessionToken?: string; }
export interface OAuth1Auth { type: 'oauth1'; consumerKey?: string; consumerSecret?: string; token?: string; tokenSecret?: string; }

// A union type for all possible authentication configurations.
export type AuthConfig = NoAuth | ApiKeyAuth | BasicAuth | BearerTokenAuth | OAuth2Auth | AwsV4Auth | OAuth1Auth;

export interface QueryParam {
    key: string;
    value: string;
}

export type BodyType = 'none' | 'raw'; // Add other types as needed (form-data, x-www-form-urlencoded, binary, GraphQL)

export interface NoBody {
    type: 'none';
}

export interface RawBody {
    type: 'raw';
    content: string;
}

export type RequestBody = NoBody | RawBody;

export interface UrlItem {
    type: 'url';
    id: string;
    name: string;
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
    interval: number;
    expectedStatusCode: number;
    headers?: Record<string, string>;
    queryParams?: QueryParam[]; // New: For URL query parameters
    auth?: AuthConfig;
    body?: RequestBody; // New: For request body
    lastStatus?: 'up' | 'down';
    lastChecked?: string;
    parentId: string | null;
}

export interface FolderItem {
    type: 'folder';
    id: string;
    name: string;
    parentId: string | null;
}

export type TreeViewItem = UrlItem | FolderItem;

export function isUrlItem(item: TreeViewItem): item is UrlItem {
    return item.type === 'url';
}

export function createDefaultUrlItem(): Omit<UrlItem, 'id'> {
    return {
        type: 'url',
        name: '',
        url: '',
        method: 'GET',
        interval: 60,
        expectedStatusCode: 200,
        headers: {},
        queryParams: [], // Default to empty array
        auth: { type: 'noauth' }, // Default to no auth
        body: { type: 'none' }, // Default to no body
        lastStatus: undefined,
        lastChecked: undefined,
        parentId: null
    };
}
