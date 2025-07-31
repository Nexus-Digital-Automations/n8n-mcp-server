import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  FastMCPAuthMiddleware,
  createAuthMiddleware,
  requireAuth,
  requirePermission,
  parseAuthConfigFromEnv,
  AUTH_ENV_CONFIG,
} from '../../../src/auth/middleware';
import {
  AuthProvider,
  RequestContext,
  AuthResult,
  AuthenticatedUser,
} from '../../../src/auth/authProvider';

// Mock FastMCP
jest.mock('fastmcp');
import { FastMCP } from 'fastmcp';

// Mock AuthProvider for testing
class MockAuthProvider implements AuthProvider {
  private shouldAuthenticate: boolean;
  private mockUser: AuthenticatedUser | null;
  private allowedTools: Set<string>;
  private allowedResources: Set<string>;

  constructor(
    shouldAuthenticate = true,
    mockUser: AuthenticatedUser | null = null,
    allowedTools: string[] = [],
    allowedResources: string[] = []
  ) {
    this.shouldAuthenticate = shouldAuthenticate;
    this.mockUser = mockUser || {
      id: 'test-user',
      name: 'Test User',
      email: 'test@example.com',
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
    };
    this.allowedTools = new Set(allowedTools);
    this.allowedResources = new Set(allowedResources);
  }

  async authenticate(context: RequestContext): Promise<AuthResult> {
    if (!this.shouldAuthenticate) {
      return {
        success: false,
        error: 'Authentication failed',
      };
    }

    return {
      success: true,
      user: this.mockUser || undefined,
      context: {
        authType: 'mock',
      },
    };
  }

  async canAccessTool(toolName: string, context: RequestContext): Promise<boolean> {
    return this.allowedTools.has(toolName) || this.allowedTools.has('*');
  }

  async canAccessResource(resourceUri: string, context: RequestContext): Promise<boolean> {
    return this.allowedResources.has(resourceUri) || this.allowedResources.has('*');
  }

  async refresh(context: RequestContext): Promise<AuthResult> {
    return this.authenticate(context);
  }
}

describe('FastMCPAuthMiddleware', () => {
  let mockAuthProvider: MockAuthProvider;
  let mockServer: jest.Mocked<FastMCP>;
  let middleware: FastMCPAuthMiddleware;

  beforeEach(() => {
    mockAuthProvider = new MockAuthProvider(true, null, ['*'], ['*']);
    mockServer = {
      addTool: jest.fn(),
      // Add other FastMCP methods as needed
    } as any;

    middleware = new FastMCPAuthMiddleware({
      authProvider: mockAuthProvider,
    });
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const middleware = new FastMCPAuthMiddleware({
        authProvider: mockAuthProvider,
      });

      expect(middleware).toBeInstanceOf(FastMCPAuthMiddleware);
    });

    it('should initialize with custom configuration', () => {
      const middleware = new FastMCPAuthMiddleware({
        authProvider: mockAuthProvider,
        requireAuth: true,
        publicTools: ['custom-tool'],
        publicResources: ['custom://resource'],
        authHeader: 'x-custom-auth',
        authErrorMessage: 'Custom auth error',
        authzErrorMessage: 'Custom authz error',
      });

      expect(middleware).toBeInstanceOf(FastMCPAuthMiddleware);
    });
  });

  describe('apply', () => {
    it('should apply middleware to FastMCP server', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      middleware.apply(mockServer);

      expect(consoleSpy).toHaveBeenCalledWith(
        '🔐 Authentication middleware configured (tool-level implementation)'
      );
      expect((mockServer as any)._authMiddleware).toBe(middleware);

      consoleSpy.mockRestore();
    });
  });

  describe('checkToolAccess', () => {
    it('should allow access to public tools without authentication', async () => {
      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
      };

      await expect(middleware.checkToolAccess('init-n8n', context)).resolves.not.toThrow();
      await expect(middleware.checkToolAccess('status', context)).resolves.not.toThrow();
    });

    it('should authenticate and check tool access for non-public tools', async () => {
      const context: RequestContext = {
        clientId: 'test-client',
        headers: {
          authorization: 'Bearer valid-token',
        },
      };

      await expect(middleware.checkToolAccess('list-workflows', context)).resolves.not.toThrow();
    });

    it('should throw error when authentication fails for protected tools', async () => {
      const failingAuthProvider = new MockAuthProvider(false);
      const middleware = new FastMCPAuthMiddleware({
        authProvider: failingAuthProvider,
        requireAuth: true,
      });

      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
      };

      await expect(middleware.checkToolAccess('list-workflows', context)).rejects.toThrow(
        'Authentication required'
      );
    });

    it('should throw error when tool access is denied', async () => {
      const restrictiveAuthProvider = new MockAuthProvider(true, null, []); // No tools allowed
      const middleware = new FastMCPAuthMiddleware({
        authProvider: restrictiveAuthProvider,
      });

      const context: RequestContext = {
        clientId: 'test-client',
        headers: {
          authorization: 'Bearer valid-token',
        },
      };

      await expect(middleware.checkToolAccess('list-workflows', context)).rejects.toThrow(
        'Access denied: list-workflows'
      );
    });

    it('should allow anonymous access when auth not required', async () => {
      const failingAuthProvider = new MockAuthProvider(false);
      const middleware = new FastMCPAuthMiddleware({
        authProvider: failingAuthProvider,
        requireAuth: false,
      });

      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
      };

      await expect(middleware.checkToolAccess('list-workflows', context)).resolves.not.toThrow();
    });

    it('should use existing authenticated user if available', async () => {
      const mockUser: AuthenticatedUser = {
        id: 'existing-user',
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
      };

      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
        user: mockUser,
      };

      await expect(middleware.checkToolAccess('list-workflows', context)).resolves.not.toThrow();
    });
  });

  describe('checkResourceAccess', () => {
    it('should allow access to public resources without authentication', async () => {
      const middleware = new FastMCPAuthMiddleware({
        authProvider: mockAuthProvider,
        publicResources: ['public://resource'],
      });

      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
      };

      await expect(
        middleware.checkResourceAccess('public://resource', context)
      ).resolves.not.toThrow();
    });

    it('should authenticate and check resource access for non-public resources', async () => {
      const context: RequestContext = {
        clientId: 'test-client',
        headers: {
          authorization: 'Bearer valid-token',
        },
      };

      await expect(
        middleware.checkResourceAccess('n8n://workflows/123', context)
      ).resolves.not.toThrow();
    });

    it('should throw error when authentication fails for protected resources', async () => {
      const failingAuthProvider = new MockAuthProvider(false);
      const middleware = new FastMCPAuthMiddleware({
        authProvider: failingAuthProvider,
        requireAuth: true,
      });

      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
      };

      await expect(middleware.checkResourceAccess('n8n://workflows/123', context)).rejects.toThrow(
        'Authentication required'
      );
    });

    it('should throw error when resource access is denied', async () => {
      const restrictiveAuthProvider = new MockAuthProvider(true, null, ['*'], []); // No resources allowed
      const middleware = new FastMCPAuthMiddleware({
        authProvider: restrictiveAuthProvider,
      });

      const context: RequestContext = {
        clientId: 'test-client',
        headers: {
          authorization: 'Bearer valid-token',
        },
      };

      await expect(middleware.checkResourceAccess('n8n://workflows/123', context)).rejects.toThrow(
        'Access denied: n8n://workflows/123'
      );
    });

    it('should handle resource pattern matching', async () => {
      const middleware = new FastMCPAuthMiddleware({
        authProvider: mockAuthProvider,
        publicResources: ['n8n://public'],
      });

      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
      };

      await expect(
        middleware.checkResourceAccess('n8n://public/resource', context)
      ).resolves.not.toThrow();
    });

    it('should use existing authenticated user if available', async () => {
      const mockUser: AuthenticatedUser = {
        id: 'existing-user',
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
      };

      const context: RequestContext = {
        clientId: 'test-client',
        headers: {},
        user: mockUser,
      };

      await expect(
        middleware.checkResourceAccess('n8n://workflows/123', context)
      ).resolves.not.toThrow();
    });
  });

  describe('wrapTool', () => {
    it('should wrap tool function with authentication', async () => {
      const mockToolFunction = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('tool result');
      const wrappedTool = middleware.wrapTool('test-tool', mockToolFunction);

      const args: any[] = [{ data: 'test' }, { session: { id: 'session-123' }, headers: {} }];
      const result = await wrappedTool(...args);

      expect(mockToolFunction).toHaveBeenCalledWith(...args);
      expect(result).toBe('tool result');
    });

    it('should extract context from function arguments', async () => {
      const mockToolFunction = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('tool result');
      const wrappedTool = middleware.wrapTool('test-tool', mockToolFunction);

      const args: any[] = [
        { data: 'test' },
        {
          session: { id: 'session-123' },
          headers: { authorization: 'Bearer token' },
          metadata: { userAgent: 'test' },
        },
      ];

      await wrappedTool(...args);

      expect(mockToolFunction).toHaveBeenCalledWith(...args);
    });

    it('should handle authentication errors in wrapped tool', async () => {
      const failingAuthProvider = new MockAuthProvider(false);
      const middleware = new FastMCPAuthMiddleware({
        authProvider: failingAuthProvider,
        requireAuth: true,
      });

      const mockToolFunction = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('tool result');
      const wrappedTool = middleware.wrapTool('protected-tool', mockToolFunction);

      const args: any[] = [{ data: 'test' }];

      await expect(wrappedTool(...args)).rejects.toThrow('Authentication required');
      expect(mockToolFunction).not.toHaveBeenCalled();
    });
  });

  describe('wrapResource', () => {
    it('should wrap resource function with authentication', async () => {
      const mockResourceFunction = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('resource result');
      const wrappedResource = middleware.wrapResource('n8n://test-resource', mockResourceFunction);

      const args: any[] = [{ data: 'test' }, { session: { id: 'session-123' }, headers: {} }];
      const result = await wrappedResource(...args);

      expect(mockResourceFunction).toHaveBeenCalledWith(...args);
      expect(result).toBe('resource result');
    });

    it('should handle authentication errors in wrapped resource', async () => {
      const failingAuthProvider = new MockAuthProvider(false);
      const middleware = new FastMCPAuthMiddleware({
        authProvider: failingAuthProvider,
        requireAuth: true,
      });

      const mockResourceFunction = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('resource result');
      const wrappedResource = middleware.wrapResource(
        'n8n://protected-resource',
        mockResourceFunction
      );

      const args: any[] = [{ data: 'test' }];

      await expect(wrappedResource(...args)).rejects.toThrow('Authentication required');
      expect(mockResourceFunction).not.toHaveBeenCalled();
    });
  });

  describe('context extraction', () => {
    it('should extract context from arguments with session', () => {
      const mockToolFunction = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('result');
      const wrappedTool = middleware.wrapTool('test-tool', mockToolFunction);

      const args: any[] = [
        { data: 'test' },
        {
          session: { id: 'session-123' },
          headers: { authorization: 'Bearer token' },
          metadata: { userAgent: 'test-client' },
        },
      ];

      // This will internally call extractContextFromArgs
      void wrappedTool(...args).catch(() => {}); // Ignore errors for this test

      expect(mockToolFunction).toHaveBeenCalled();
    });

    it('should handle arguments without session', () => {
      const mockToolFunction = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('result');
      const wrappedTool = middleware.wrapTool('test-tool', mockToolFunction);

      const args: any[] = [{ data: 'test' }, { notASession: true }];

      // This will internally call extractContextFromArgs
      void wrappedTool(...args).catch(() => {}); // Ignore errors for this test

      expect(mockToolFunction).toHaveBeenCalled();
    });

    it('should handle empty arguments', () => {
      const mockToolFunction = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('result');
      const wrappedTool = middleware.wrapTool('test-tool', mockToolFunction);

      // This will internally call extractContextFromArgs
      void wrappedTool().catch(() => {}); // Ignore errors for this test

      expect(mockToolFunction).toHaveBeenCalled();
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle custom error messages', async () => {
      const failingAuthProvider = new MockAuthProvider(false);
      const middleware = new FastMCPAuthMiddleware({
        authProvider: failingAuthProvider,
        requireAuth: true,
        authErrorMessage: 'Custom authentication error',
        authzErrorMessage: 'Custom authorization error',
      });

      const context: RequestContext = { headers: {} };

      await expect(middleware.checkToolAccess('protected-tool', context)).rejects.toThrow(
        'Custom authentication error'
      );
    });

    it('should handle authorization errors with custom messages', async () => {
      const restrictiveAuthProvider = new MockAuthProvider(true, null, []); // No tools allowed
      const middleware = new FastMCPAuthMiddleware({
        authProvider: restrictiveAuthProvider,
        authzErrorMessage: 'Custom authorization error',
      });

      const context: RequestContext = {
        headers: { authorization: 'Bearer token' },
      };

      await expect(middleware.checkToolAccess('restricted-tool', context)).rejects.toThrow(
        'Custom authorization error: restricted-tool'
      );
    });

    it('should handle null/undefined context gracefully', async () => {
      const mockToolFunction = jest.fn<() => Promise<string>>().mockResolvedValue('result');
      const wrappedTool = middleware.wrapTool('test-tool', mockToolFunction);

      // Should not throw an error even with no proper context
      await expect(wrappedTool()).resolves.toBe('result');
    });

    it('should handle complex argument structures', async () => {
      const mockToolFunction = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('result');
      const wrappedTool = middleware.wrapTool('test-tool', mockToolFunction);

      const complexArgs: any[] = [
        { param1: 'value1' },
        { param2: 'value2' },
        {
          session: { id: 'session-123', data: { nested: 'value' } },
          headers: { 'custom-header': 'value' },
          metadata: { timestamp: Date.now() },
        },
      ];

      await wrappedTool(...complexArgs);

      expect(mockToolFunction).toHaveBeenCalledWith(...complexArgs);
    });
  });
});

describe('createAuthMiddleware', () => {
  it('should create FastMCPAuthMiddleware instance', () => {
    const mockAuthProvider = new MockAuthProvider();
    const middleware = createAuthMiddleware({
      authProvider: mockAuthProvider,
    });

    expect(middleware).toBeInstanceOf(FastMCPAuthMiddleware);
  });

  it('should pass configuration to middleware', () => {
    const mockAuthProvider = new MockAuthProvider();
    const config = {
      authProvider: mockAuthProvider,
      requireAuth: true,
      publicTools: ['public-tool'],
    };

    const middleware = createAuthMiddleware(config);

    expect(middleware).toBeInstanceOf(FastMCPAuthMiddleware);
  });
});

describe('decorators', () => {
  describe('requireAuth', () => {
    it('should create authentication decorator', () => {
      const decorator = requireAuth('test-tool');
      expect(typeof decorator).toBe('function');
    });
  });

  describe('requirePermission', () => {
    it('should create permission decorator', () => {
      const decorator = requirePermission('workflows');
      expect(typeof decorator).toBe('function');
    });
  });
});

describe('environment configuration', () => {
  describe('AUTH_ENV_CONFIG', () => {
    it('should define all required environment variable names', () => {
      expect(AUTH_ENV_CONFIG.REQUIRE_AUTH).toBe('N8N_MCP_REQUIRE_AUTH');
      expect(AUTH_ENV_CONFIG.PUBLIC_TOOLS).toBe('N8N_MCP_PUBLIC_TOOLS');
      expect(AUTH_ENV_CONFIG.PUBLIC_RESOURCES).toBe('N8N_MCP_PUBLIC_RESOURCES');
      expect(AUTH_ENV_CONFIG.AUTH_HEADER).toBe('N8N_MCP_AUTH_HEADER');
      expect(AUTH_ENV_CONFIG.AUTH_ERROR_MESSAGE).toBe('N8N_MCP_AUTH_ERROR_MESSAGE');
      expect(AUTH_ENV_CONFIG.AUTHZ_ERROR_MESSAGE).toBe('N8N_MCP_AUTHZ_ERROR_MESSAGE');
    });
  });

  describe('parseAuthConfigFromEnv', () => {
    let originalEnv: typeof process.env;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should parse configuration from environment variables', () => {
      process.env[AUTH_ENV_CONFIG.REQUIRE_AUTH] = 'true';
      process.env[AUTH_ENV_CONFIG.PUBLIC_TOOLS] = 'tool1,tool2,tool3';
      process.env[AUTH_ENV_CONFIG.PUBLIC_RESOURCES] = 'resource1,resource2';
      process.env[AUTH_ENV_CONFIG.AUTH_HEADER] = 'x-custom-auth';
      process.env[AUTH_ENV_CONFIG.AUTH_ERROR_MESSAGE] = 'Custom auth error';
      process.env[AUTH_ENV_CONFIG.AUTHZ_ERROR_MESSAGE] = 'Custom authz error';

      const mockAuthProvider = new MockAuthProvider();
      const config = parseAuthConfigFromEnv(mockAuthProvider);

      expect(config.authProvider).toBe(mockAuthProvider);
      expect(config.requireAuth).toBe(true);
      expect(config.publicTools).toEqual(['tool1', 'tool2', 'tool3']);
      expect(config.publicResources).toEqual(['resource1', 'resource2']);
      expect(config.authHeader).toBe('x-custom-auth');
      expect(config.authErrorMessage).toBe('Custom auth error');
      expect(config.authzErrorMessage).toBe('Custom authz error');
    });

    it('should use defaults when environment variables are not set', () => {
      const mockAuthProvider = new MockAuthProvider();
      const config = parseAuthConfigFromEnv(mockAuthProvider);

      expect(config.authProvider).toBe(mockAuthProvider);
      expect(config.requireAuth).toBe(false);
      expect(config.publicTools).toBeUndefined();
      expect(config.publicResources).toBeUndefined();
      expect(config.authHeader).toBeUndefined();
      expect(config.authErrorMessage).toBeUndefined();
      expect(config.authzErrorMessage).toBeUndefined();
    });

    it('should handle empty string environment variables', () => {
      process.env[AUTH_ENV_CONFIG.REQUIRE_AUTH] = '';
      process.env[AUTH_ENV_CONFIG.PUBLIC_TOOLS] = '';

      const mockAuthProvider = new MockAuthProvider();
      const config = parseAuthConfigFromEnv(mockAuthProvider);

      expect(config.requireAuth).toBe(false);
      expect(config.publicTools).toEqual(['']);
    });

    it('should parse boolean values correctly', () => {
      process.env[AUTH_ENV_CONFIG.REQUIRE_AUTH] = 'false';

      const mockAuthProvider = new MockAuthProvider();
      const config = parseAuthConfigFromEnv(mockAuthProvider);

      expect(config.requireAuth).toBe(false);
    });
  });
});
