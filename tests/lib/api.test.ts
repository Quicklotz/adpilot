/**
 * Tests for the API module.
 *
 * We mock node-fetch and the config module so no real HTTP calls or filesystem
 * reads happen.
 */

jest.mock('node-fetch', () => jest.fn());
jest.mock('../../src/lib/config', () => ({
  getConfig: () => ({ apiVersion: 'v25.0' }),
  getToken: () => 'test-token-123',
}));
jest.mock('../../src/lib/logger', () => ({
  isLoggingEnabled: () => false,
  logApiCall: jest.fn(),
  sanitizeParams: (p: any) => p,
}));

import fetch from 'node-fetch';
import { apiRequest, apiGet, apiPost, apiDelete } from '../../src/lib/api';
import { ApiError } from '../../src/utils/errors';

const mockFetch = fetch as unknown as jest.Mock;

function mockJsonResponse(body: any, status = 200) {
  return {
    json: () => Promise.resolve(body),
    status,
    ok: status >= 200 && status < 300,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('apiRequest – GET', () => {
  it('builds correct URL with params and injects token', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ data: [{ id: '1' }] }));

    await apiGet('act_123/campaigns', { fields: 'id,name', limit: '10' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://graph.facebook.com/v25.0/act_123/campaigns');
    expect(calledUrl).toContain('access_token=test-token-123');
    expect(calledUrl).toContain('fields=id%2Cname');
    expect(calledUrl).toContain('limit=10');
  });

  it('returns data on successful response', async () => {
    const payload = { data: [{ id: '1', name: 'Test' }] };
    mockFetch.mockResolvedValue(mockJsonResponse(payload));

    const result = await apiGet('act_123/campaigns');
    expect(result.data).toEqual([{ id: '1', name: 'Test' }]);
  });
});

describe('apiRequest – POST', () => {
  it('sends form-encoded body', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: '123' }));

    await apiPost('act_123/campaigns', {
      name: 'Test Campaign',
      objective: 'OUTCOME_TRAFFIC',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];

    // POST URL should not have params in query string (except what buildUrl adds)
    expect(calledUrl).toContain('https://graph.facebook.com/v25.0/act_123/campaigns');
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    // The body is a URLSearchParams instance
    const bodyStr = calledOptions.body.toString();
    expect(bodyStr).toContain('access_token=test-token-123');
    expect(bodyStr).toContain('name=Test+Campaign');
    expect(bodyStr).toContain('objective=OUTCOME_TRAFFIC');
  });

  it('returns created resource id', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ id: '999' }));

    const result = await apiPost('act_123/campaigns', { name: 'New' });
    expect(result.id).toBe('999');
  });
});

describe('apiRequest – DELETE', () => {
  it('uses DELETE method', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ success: true }));

    await apiDelete('123456');

    const calledOptions = mockFetch.mock.calls[0][1];
    expect(calledOptions.method).toBe('DELETE');
  });
});

describe('apiRequest – error handling', () => {
  it('throws ApiError on error response', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        error: {
          message: 'Invalid token',
          type: 'OAuthException',
          code: 190,
        },
      })
    );

    await expect(apiGet('me')).rejects.toThrow(ApiError);
    await expect(
      (async () => {
        mockFetch.mockResolvedValue(
          mockJsonResponse({
            error: {
              message: 'Invalid token',
              type: 'OAuthException',
              code: 190,
            },
          })
        );
        return apiGet('me');
      })()
    ).rejects.toThrow(/Invalid token/);
  });

  it('includes error code and type in ApiError message', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        error: {
          message: 'Permissions error',
          type: 'OAuthException',
          code: 10,
          error_subcode: 1234,
        },
      })
    );

    try {
      await apiGet('me');
      fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toContain('[10]');
      expect(err.message).toContain('OAuthException');
      expect(err.message).toContain('subcode: 1234');
    }
  });

  it('retries on rate limit errors', async () => {
    // First call: rate limited, second call: success
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse({
          error: { message: 'Rate limited', type: 'OAuthException', code: 4 },
        })
      )
      .mockResolvedValueOnce(mockJsonResponse({ data: [{ id: '1' }] }));

    // Suppress stderr output during retry
    const stderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const result = await apiGet('act_123/campaigns');
    expect(result.data).toEqual([{ id: '1' }]);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    stderrWrite.mockRestore();
  }, 15000);
});
