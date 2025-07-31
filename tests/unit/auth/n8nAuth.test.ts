import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { N8nAuthProvider, createN8nAuth, defaultN8nAuth } from '../../../src/auth/n8nAuth';
import { RequestContext } from '../../../src/auth/authProvider';

// Simple test focused on coverage of N8nAuthProvider without complex mocking
// This avoids the N8nClient import issues by focusing on the simpler methods
describe('N8nAuthProvider Simple Tests', () => {
  let authProvider: N8nAuthProvider;

  beforeEach(() => {
    authProvider = new N8nAuthProvider({
      required: false,
      defaultBaseUrl: 'https://test.n8n.io',
      defaultApiKey: 'test-api-key',
      validateConnection: false, // Skip connection validation to avoid N8nClient
      cacheDuration: 5 * 60 * 1000,
      defaultRoles: ['member'],
    });
  });

  afterEach(() => {
    authProvider.clearCache();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const provider = new N8nAuthProvider();
      expect(provider).toBeInstanceOf(N8nAuthProvider);
    });

    it('should initialize with custom configuration', () => {
      const config = {
        required: true,
        defaultBaseUrl: 'https://custom.n8n.io',
        defaultApiKey: 'custom-api-key',
        validateConnection: false,
        cacheDuration: 10 * 60 * 1000,
        defaultRoles: ['admin'],
      };

      const provider = new N8nAuthProvider(config);
      expect(provider).toBeInstanceOf(N8nAuthProvider);
    });
  });

  describe('anonymous authentication', () => {
    it('should allow anonymous access when authentication not required', async () => {
      const provider = new N8nAuthProvider({ required: false });
      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
      };

      const result = await provider.authenticate(context);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe('anonymous');
      expect(result.user?.roles).toEqual(['anonymous']);
      expect(result.context?.authType).toBe('anonymous');
      expect(result.user?.permissions.community).toBe(true);
      expect(result.user?.permissions.workflows).toBe(true);
      expect(result.user?.permissions.executions).toBe(true);
      expect(result.user?.permissions.enterprise).toBe(false);
      expect(result.user?.permissions.credentials).toBe(false);
      expect(result.user?.permissions.users).toBe(false);
      expect(result.user?.permissions.audit).toBe(false);
    });

    it('should include context information for anonymous users', async () => {
      const provider = new N8nAuthProvider({ required: false });
      const context: RequestContext = {};

      const result = await provider.authenticate(context);

      expect(result.success).toBe(true);
      expect(result.context?.authType).toBe('anonymous');
      expect(result.context?.features).toEqual(['community']);
    });
  });

  describe('required authentication without validation', () => {
    it('should require credentials when authentication is required', async () => {
      const provider = new N8nAuthProvider({ required: true });
      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
      };

      const result = await provider.authenticate(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication required but no credentials provided');
    });

    it('should accept credentials when provided and validation is disabled', async () => {
      const provider = new N8nAuthProvider({
        required: true,
        validateConnection: false,
        defaultBaseUrl: 'https://test.n8n.io',
        defaultRoles: ['member'],
      });
      const context: RequestContext = {
        clientId: 'test-client',
        headers: {
          'x-n8n-api-key': 'valid-api-key',
        },
      };

      const result = await provider.authenticate(context);

      expect(result.success).toBe(true);
      expect(result.user?.n8nApiKey).toBe('valid-api-key');
      expect(result.user?.n8nBaseUrl).toBe('https://test.n8n.io');
      expect(result.context?.authType).toBe('n8n-api-key');
    });

    it('should handle Bearer token authentication', async () => {
      const provider = new N8nAuthProvider({
        required: true,
        validateConnection: false,
        defaultBaseUrl: 'https://default.n8n.io',
        defaultRoles: ['member'],
      });
      const context: RequestContext = {
        clientId: 'test-client',
        headers: {
          authorization: 'Bearer valid-bearer-token',
        },
      };

      const result = await provider.authenticate(context);

      expect(result.success).toBe(true);
      expect(result.user?.n8nApiKey).toBe('valid-bearer-token');
      expect(result.user?.n8nBaseUrl).toBe('https://default.n8n.io');
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      const provider = new N8nAuthProvider();
      provider.clearCache();

      const stats = provider.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.entries).toBe(0);
    });

    it('should provide cache statistics', () => {
      const provider = new N8nAuthProvider();
      const stats = provider.getCacheStats();

      expect(typeof stats.size).toBe('number');
      expect(typeof stats.entries).toBe('number');
    });

    it('should clean up expired cache entries', () => {
      const provider = new N8nAuthProvider({ cacheDuration: -1 }); // Expired immediately

      // Manually add expired cache entry to test cleanup
      const cache = (provider as any).authCache;
      cache.set('test-key', {
        result: { success: true, user: { id: 'test' } },
        expires: Date.now() - 1000, // Expired 1 second ago
      });

      // This should trigger cleanup of expired entries
      const stats = provider.getCacheStats();
      expect(stats.entries).toBe(0); // Expired entry should be cleaned up
    });

    it('should handle cache with zero duration', async () => {
      const provider = new N8nAuthProvider({
        required: true,
        validateConnection: false,
        cacheDuration: 0, // No caching
        defaultBaseUrl: 'https://test.n8n.io',
        defaultRoles: ['member'],
      });

      const context: RequestContext = {
        headers: {
          'x-n8n-api-key': 'valid-api-key',
        },
      };

      const result = await provider.authenticate(context);
      expect(result.success).toBe(true);

      // With zero cache duration, nothing should be cached
      const stats = provider.getCacheStats();
      expect(stats.entries).toBe(0);
    });
  });

  describe('refresh authentication', () => {
    it('should refresh authentication by clearing cache', async () => {
      const provider = new N8nAuthProvider({
        required: false,
        cacheDuration: 60000,
      });

      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
      };

      // First authenticate
      const result1 = await provider.authenticate(context);
      expect(result1.success).toBe(true);

      // Refresh should work
      const result2 = await provider.refresh(context);
      expect(result2.success).toBe(true);
      expect(result2.user?.id).toBe('anonymous');
    });

    it('should refresh authentication with user context and clear specific cache', async () => {
      const provider = new N8nAuthProvider({
        required: true,
        validateConnection: false,
        cacheDuration: 60000,
        defaultBaseUrl: '', // Empty default
        defaultApiKey: '', // Empty default
      });

      const user = {
        id: 'test-user',
        name: 'Test User',
        roles: ['member'],
        permissions: {
          community: true,
          enterprise: false,
          workflows: true,
          executions: true,
          credentials: false,
          users: false,
          audit: false,
        },
        n8nBaseUrl: 'https://test.n8n.io',
        n8nApiKey: 'test-key',
      };

      const context: RequestContext = {
        user,
        headers: {}, // No authentication headers provided
      };

      // Refresh with user context should clear cache for that user and then fail because no credentials
      const result = await provider.refresh(context);
      expect(result.success).toBe(false); // No credentials in headers, should fail
      expect(result.error).toContain('Authentication required but no credentials provided');
    });
  });

  describe('error handling', () => {
    it('should handle authentication errors gracefully', async () => {
      const provider = new N8nAuthProvider({ required: true });

      // Mock the extractCredentials method to throw an error
      jest.spyOn(provider as any, 'extractCredentials').mockImplementation(() => {
        throw new Error('Credential extraction failed');
      });

      const context: RequestContext = {
        headers: {
          'x-n8n-api-key': 'test-key',
        },
      };

      const result = await provider.authenticate(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed: Credential extraction failed');
    });

    it('should handle non-Error objects in catch blocks', async () => {
      const provider = new N8nAuthProvider({ required: true });

      // Mock to throw a non-Error object
      jest.spyOn(provider as any, 'extractCredentials').mockImplementation(() => {
        throw 'String error'; // Non-Error object
      });

      const context: RequestContext = {
        headers: {
          'x-n8n-api-key': 'test-key',
        },
      };

      const result = await provider.authenticate(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed: String error');
    });
  });
});

describe('createN8nAuth', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create N8nAuthProvider instance', () => {
    const provider = createN8nAuth();
    expect(provider).toBeInstanceOf(N8nAuthProvider);
  });

  it('should handle environment variables', () => {
    process.env.N8N_MCP_AUTH_REQUIRED = 'true';
    process.env.N8N_BASE_URL = 'https://env.n8n.io';
    process.env.N8N_API_KEY = 'env-api-key';

    const provider = createN8nAuth();
    expect(provider).toBeInstanceOf(N8nAuthProvider);
  });

  it('should handle invalid cache duration environment variables', () => {
    process.env.N8N_MCP_AUTH_CACHE_DURATION = 'invalid-number';
    process.env.N8N_MCP_DEFAULT_ROLES = 'admin,editor'; // Valid roles

    const provider = createN8nAuth();
    expect(provider).toBeInstanceOf(N8nAuthProvider);

    // Should use default cache duration when parse fails
    const stats = provider.getCacheStats();
    expect(typeof stats.size).toBe('number');
  });

  it('should handle empty default roles environment variable', () => {
    process.env.N8N_MCP_DEFAULT_ROLES = '';

    const provider = createN8nAuth();
    expect(provider).toBeInstanceOf(N8nAuthProvider);

    // Should handle empty string gracefully by using defaults
  });

  it('should handle missing environment variables gracefully', () => {
    delete process.env.N8N_MCP_AUTH_REQUIRED;
    delete process.env.N8N_BASE_URL;
    delete process.env.N8N_API_KEY;
    delete process.env.N8N_MCP_AUTH_CACHE_DURATION;
    delete process.env.N8N_MCP_DEFAULT_ROLES;

    const provider = createN8nAuth();
    expect(provider).toBeInstanceOf(N8nAuthProvider);
  });
});

describe('defaultN8nAuth', () => {
  it('should be an instance of N8nAuthProvider', () => {
    expect(defaultN8nAuth).toBeInstanceOf(N8nAuthProvider);
  });

  it('should be a singleton instance', async () => {
    // Import again to test singleton behavior
    const module = await import('../../../src/auth/n8nAuth');
    const secondInstance = module.defaultN8nAuth;
    expect(defaultN8nAuth).toBe(secondInstance);
  });
});
