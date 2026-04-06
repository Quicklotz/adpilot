import fetch from 'node-fetch';
import { getConfig, getToken } from './config';

const BASE_URL = 'https://graph.facebook.com';

export interface ApiResponse<T = any> {
  data?: T[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
    previous?: string;
  };
  id?: string;
  success?: boolean;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
  [key: string]: any;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  params?: Record<string, any>;
  body?: Record<string, any>;
  token?: string;
}

function buildUrl(endpoint: string, params: Record<string, any> = {}): string {
  const { apiVersion } = getConfig();
  const base = endpoint.startsWith('http')
    ? endpoint
    : `${BASE_URL}/${apiVersion}/${endpoint.replace(/^\//, '')}`;
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(
        key,
        typeof value === 'object' ? JSON.stringify(value) : String(value)
      );
    }
  }
  return url.toString();
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', params = {}, body, token } = options;
  const accessToken = token || getToken();

  const allParams = { ...params, access_token: accessToken };

  let url: string;
  let fetchOptions: any = { method };

  if (method === 'GET' || method === 'DELETE') {
    url = buildUrl(endpoint, allParams);
  } else {
    url = buildUrl(endpoint);
    const formBody = new URLSearchParams();
    const merged = { ...allParams, ...body };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== null) {
        formBody.set(
          key,
          typeof value === 'object' ? JSON.stringify(value) : String(value)
        );
      }
    }
    fetchOptions.body = formBody;
    fetchOptions.headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  const response = await fetch(url, fetchOptions);
  const data = (await response.json()) as ApiResponse<T>;

  if (data.error) {
    const err = data.error;
    throw new Error(
      `[${err.code}] ${err.type}: ${err.message}${
        err.error_subcode ? ` (subcode: ${err.error_subcode})` : ''
      }`
    );
  }

  return data;
}

export async function apiGet<T = any>(
  endpoint: string,
  params: Record<string, any> = {},
  token?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { method: 'GET', params, token });
}

export async function apiPost<T = any>(
  endpoint: string,
  body: Record<string, any> = {},
  params: Record<string, any> = {},
  token?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { method: 'POST', body, params, token });
}

export async function apiDelete<T = any>(
  endpoint: string,
  params: Record<string, any> = {},
  token?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { method: 'DELETE', params, token });
}

export async function fetchAllPages<T = any>(
  endpoint: string,
  params: Record<string, any> = {},
  maxPages = 10
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | undefined;
  let page = 0;

  const firstResponse = await apiGet<T>(endpoint, params);
  if (firstResponse.data) results.push(...firstResponse.data);
  nextUrl = firstResponse.paging?.next;

  while (nextUrl && page < maxPages - 1) {
    page++;
    const response = await apiRequest<T>(nextUrl.replace(`${BASE_URL}/`, ''));
    if (response.data) results.push(...response.data);
    nextUrl = response.paging?.next;
  }

  return results;
}
