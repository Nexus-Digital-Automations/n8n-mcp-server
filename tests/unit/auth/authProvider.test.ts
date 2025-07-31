import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  AuthProvider,
  BaseAuthProvider,
  RequestContext,
  AuthResult,
  AuthenticatedUser,
} from '../../../src/auth/authProvider';

// Test implementation of BaseAuthProvider for testing abstract methods
class TestAuthProvider extends BaseAuthProvider {
  private shouldAuthenticate: boolean;
  private mockUser: AuthenticatedUser | null;

  constructor(shouldAuthenticate = true, mockUser: AuthenticatedUser | null = null) {
    super();
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
      n8nApiKey: 'test-api-key',
      n8nBaseUrl: 'https://test.n8n.io',
    };
  }

  async authenticate(context: RequestContext): Promise<AuthResult> {
    if (!this.shouldAuthenticate) {
      return {
        success: false,
        error: 'Authentication failed',
      };
    }

    if (!this.mockUser) {
      return {
        success: false,
        error: 'No mock user configured',
      };
    }

    return {
      success: true,
      user: this.mockUser,
      context: {
        authType: 'test',
      },
    };
  }

  async refresh(context: RequestContext): Promise<AuthResult> {
    return this.authenticate(context);
  }

  // Expose protected method for testing
  public testCreatePermissions(roles: string[]) {
    return this.createPermissions(roles);
  }
}

describe('AuthProvider Interface and Base Implementation', () => {
  let authProvider: TestAuthProvider;
  let mockUser: AuthenticatedUser;
  let mockContext: RequestContext;

  beforeEach(() => {
    mockUser = {
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
      n8nApiKey: 'test-api-key',
      n8nBaseUrl: 'https://test.n8n.io',
    };

    mockContext = {
      clientId: 'test-client',
      headers: {
        authorization: 'Bearer test-token',
      },
      metadata: {},
      user: mockUser,
    };

    authProvider = new TestAuthProvider(true, mockUser);
  });

  describe('Authentication Flow', () => {
    it('should authenticate successfully', async () => {
      const result = await authProvider.authenticate(mockContext);

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(result.context).toEqual({ authType: 'test' });
      expect(result.error).toBeUndefined();
    });

    it('should handle authentication failure', async () => {
      const failingProvider = new TestAuthProvider(false);
      const result = await failingProvider.authenticate(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
      expect(result.user).toBeUndefined();
    });

    it('should refresh authentication', async () => {
      const result = await authProvider.refresh(mockContext);

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUser);
    });
  });

  describe('Tool Access Control', () => {
    it('should deny access when user is not authenticated', async () => {
      const unauthenticatedContext = { ...mockContext, user: undefined };
      const hasAccess = await authProvider.canAccessTool('list-workflows', unauthenticatedContext);

      expect(hasAccess).toBe(false);
    });

    it('should allow access to community tools for authenticated users', async () => {
      const hasAccess = await authProvider.canAccessTool('init-n8n', mockContext);
      expect(hasAccess).toBe(true);
    });

    it('should allow access to workflow tools for users with workflow permissions', async () => {
      const hasAccess = await authProvider.canAccessTool('list-workflows', mockContext);
      expect(hasAccess).toBe(true);
    });

    it('should deny access to enterprise tools for non-enterprise users', async () => {
      const hasAccess = await authProvider.canAccessTool('list-projects', mockContext);
      expect(hasAccess).toBe(false);
    });

    it('should allow access to enterprise tools for enterprise users', async () => {
      const enterpriseUser = {
        ...mockUser,
        roles: ['admin'],
        permissions: {
          ...mockUser.permissions,
          enterprise: true,
        },
      };
      const enterpriseContext = { ...mockContext, user: enterpriseUser };

      const hasAccess = await authProvider.canAccessTool('list-projects', enterpriseContext);
      expect(hasAccess).toBe(true);
    });

    it('should deny access to user management tools for non-admin users', async () => {
      const hasAccess = await authProvider.canAccessTool('list-users', mockContext);
      expect(hasAccess).toBe(false);
    });

    it('should allow access to user management tools for admin users', async () => {
      const adminUser = {
        ...mockUser,
        roles: ['admin'],
        permissions: {
          ...mockUser.permissions,
          users: true,
        },
      };
      const adminContext = { ...mockContext, user: adminUser };

      const hasAccess = await authProvider.canAccessTool('list-users', adminContext);
      expect(hasAccess).toBe(true);
    });

    it('should default to community access for unknown tools', async () => {
      const hasAccess = await authProvider.canAccessTool('unknown-tool', mockContext);
      expect(hasAccess).toBe(true); // Community access
    });

    it('should handle credential tools based on permissions', async () => {
      // Member user without credential permissions
      let hasAccess = await authProvider.canAccessTool('list-credentials', mockContext);
      expect(hasAccess).toBe(false);

      // Editor user with credential permissions
      const editorUser = {
        ...mockUser,
        roles: ['editor'],
        permissions: {
          ...mockUser.permissions,
          credentials: true,
        },
      };
      const editorContext = { ...mockContext, user: editorUser };

      hasAccess = await authProvider.canAccessTool('list-credentials', editorContext);
      expect(hasAccess).toBe(true);
    });

    it('should handle audit tools based on permissions', async () => {
      // Regular user without audit permissions
      let hasAccess = await authProvider.canAccessTool('get-audit-logs', mockContext);
      expect(hasAccess).toBe(false);

      // Admin user with audit permissions
      const adminUser = {
        ...mockUser,
        roles: ['admin'],
        permissions: {
          ...mockUser.permissions,
          audit: true,
        },
      };
      const adminContext = { ...mockContext, user: adminUser };

      hasAccess = await authProvider.canAccessTool('get-audit-logs', adminContext);
      expect(hasAccess).toBe(true);
    });

    it('should handle tag tools with appropriate permissions', async () => {
      // List tags (community feature)
      let hasAccess = await authProvider.canAccessTool('list-tags', mockContext);
      expect(hasAccess).toBe(true);

      // Create/update/delete tags (workflow permission required)
      hasAccess = await authProvider.canAccessTool('create-tag', mockContext);
      expect(hasAccess).toBe(true); // User has workflow permissions

      // Test user without workflow permissions
      const limitedUser = {
        ...mockUser,
        permissions: {
          ...mockUser.permissions,
          workflows: false,
        },
      };
      const limitedContext = { ...mockContext, user: limitedUser };

      hasAccess = await authProvider.canAccessTool('create-tag', limitedContext);
      expect(hasAccess).toBe(false);
    });
  });

  describe('Resource Access Control', () => {
    it('should deny access when user is not authenticated', async () => {
      const unauthenticatedContext = { ...mockContext, user: undefined };
      const hasAccess = await authProvider.canAccessResource(
        'n8n://workflows/123',
        unauthenticatedContext
      );

      expect(hasAccess).toBe(false);
    });

    it('should allow access to workflow resources for users with workflow permissions', async () => {
      const hasAccess = await authProvider.canAccessResource('n8n://workflows/123', mockContext);
      expect(hasAccess).toBe(true);
    });

    it('should allow access to execution resources for users with execution permissions', async () => {
      const hasAccess = await authProvider.canAccessResource('n8n://executions/456', mockContext);
      expect(hasAccess).toBe(true);
    });

    it('should deny access to credential resources for users without credential permissions', async () => {
      const hasAccess = await authProvider.canAccessResource('n8n://credentials/789', mockContext);
      expect(hasAccess).toBe(false);
    });

    it('should allow access to credential resources for users with credential permissions', async () => {
      const editorUser = {
        ...mockUser,
        permissions: {
          ...mockUser.permissions,
          credentials: true,
        },
      };
      const editorContext = { ...mockContext, user: editorUser };

      const hasAccess = await authProvider.canAccessResource(
        'n8n://credentials/789',
        editorContext
      );
      expect(hasAccess).toBe(true);
    });

    it('should deny access to user resources for non-admin users', async () => {
      const hasAccess = await authProvider.canAccessResource('n8n://users/123', mockContext);
      expect(hasAccess).toBe(false);
    });

    it('should allow access to user resources for admin users', async () => {
      const adminUser = {
        ...mockUser,
        permissions: {
          ...mockUser.permissions,
          users: true,
        },
      };
      const adminContext = { ...mockContext, user: adminUser };

      const hasAccess = await authProvider.canAccessResource('n8n://users/123', adminContext);
      expect(hasAccess).toBe(true);
    });

    it('should deny access to project resources for non-enterprise users', async () => {
      const hasAccess = await authProvider.canAccessResource('n8n://projects/456', mockContext);
      expect(hasAccess).toBe(false);
    });

    it('should allow access to project resources for enterprise users', async () => {
      const enterpriseUser = {
        ...mockUser,
        permissions: {
          ...mockUser.permissions,
          enterprise: true,
        },
      };
      const enterpriseContext = { ...mockContext, user: enterpriseUser };

      const hasAccess = await authProvider.canAccessResource(
        'n8n://projects/456',
        enterpriseContext
      );
      expect(hasAccess).toBe(true);
    });

    it('should default to community access for unknown resource types', async () => {
      const hasAccess = await authProvider.canAccessResource('n8n://unknown/123', mockContext);
      expect(hasAccess).toBe(true);
    });

    it('should handle non-n8n resource URIs with community access', async () => {
      const hasAccess = await authProvider.canAccessResource(
        'https://example.com/api',
        mockContext
      );
      expect(hasAccess).toBe(true);
    });
  });

  describe('Permission System', () => {
    it('should create correct permissions for anonymous users', () => {
      const permissions = authProvider.testCreatePermissions(['anonymous']);

      expect(permissions).toEqual({
        community: true,
        enterprise: false,
        workflows: false,
        executions: false,
        credentials: false,
        users: false,
        audit: false,
      });
    });

    it('should create correct permissions for member users', () => {
      const permissions = authProvider.testCreatePermissions(['member']);

      expect(permissions).toEqual({
        community: true,
        enterprise: false,
        workflows: true,
        executions: true,
        credentials: false,
        users: false,
        audit: false,
      });
    });

    it('should create correct permissions for editor users', () => {
      const permissions = authProvider.testCreatePermissions(['editor']);

      expect(permissions).toEqual({
        community: true,
        enterprise: false,
        workflows: true,
        executions: true,
        credentials: true,
        users: false,
        audit: false,
      });
    });

    it('should create correct permissions for admin users', () => {
      const permissions = authProvider.testCreatePermissions(['admin']);

      expect(permissions).toEqual({
        community: true,
        enterprise: true,
        workflows: true,
        executions: true,
        credentials: true,
        users: true,
        audit: true,
      });
    });

    it('should create correct permissions for owner users', () => {
      const permissions = authProvider.testCreatePermissions(['owner']);

      expect(permissions).toEqual({
        community: true,
        enterprise: true,
        workflows: true,
        executions: true,
        credentials: true,
        users: true,
        audit: true,
      });
    });

    it('should handle multiple roles correctly (highest permission wins)', () => {
      const permissions = authProvider.testCreatePermissions(['member', 'admin']);

      expect(permissions).toEqual({
        community: true,
        enterprise: true,
        workflows: true,
        executions: true,
        credentials: true,
        users: true,
        audit: true,
      });
    });

    it('should handle empty roles array', () => {
      const permissions = authProvider.testCreatePermissions([]);

      expect(permissions).toEqual({
        community: true,
        enterprise: false,
        workflows: false,
        executions: false,
        credentials: false,
        users: false,
        audit: false,
      });
    });

    it('should handle unknown roles as basic community access', () => {
      const permissions = authProvider.testCreatePermissions(['unknown-role']);

      expect(permissions).toEqual({
        community: true,
        enterprise: false,
        workflows: false,
        executions: false,
        credentials: false,
        users: false,
        audit: false,
      });
    });
  });

  describe('Context and Data Types', () => {
    it('should handle RequestContext with minimal data', () => {
      const minimalContext: RequestContext = {};
      expect(minimalContext).toBeDefined();
    });

    it('should handle RequestContext with full data', () => {
      const fullContext: RequestContext = {
        clientId: 'client-123',
        headers: {
          authorization: 'Bearer token',
          'x-custom-header': 'value',
        },
        metadata: {
          userAgent: 'test-client/1.0',
          timestamp: Date.now(),
        },
        user: mockUser,
      };

      expect(fullContext.clientId).toBe('client-123');
      expect(fullContext.headers?.['authorization']).toBe('Bearer token');
      expect(fullContext.metadata?.userAgent).toBe('test-client/1.0');
      expect(fullContext.user).toEqual(mockUser);
    });

    it('should validate AuthResult structure for success', () => {
      const successResult: AuthResult = {
        success: true,
        user: mockUser,
        context: {
          authType: 'test',
          sessionId: 'session-123',
        },
      };

      expect(successResult.success).toBe(true);
      expect(successResult.user).toEqual(mockUser);
      expect(successResult.error).toBeUndefined();
    });

    it('should validate AuthResult structure for failure', () => {
      const failureResult: AuthResult = {
        success: false,
        error: 'Authentication failed',
      };

      expect(failureResult.success).toBe(false);
      expect(failureResult.error).toBe('Authentication failed');
      expect(failureResult.user).toBeUndefined();
    });

    it('should validate AuthenticatedUser structure', () => {
      expect(mockUser.id).toBe('test-user');
      expect(mockUser.roles).toContain('member');
      expect(mockUser.permissions.community).toBe(true);
      expect(typeof mockUser.permissions).toBe('object');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null/undefined user gracefully in tool access', async () => {
      const contextWithNullUser = { ...mockContext, user: null as any };
      const hasAccess = await authProvider.canAccessTool('list-workflows', contextWithNullUser);
      expect(hasAccess).toBe(false);
    });

    it('should handle null/undefined user gracefully in resource access', async () => {
      const contextWithNullUser = { ...mockContext, user: null as any };
      const hasAccess = await authProvider.canAccessResource(
        'n8n://workflows/123',
        contextWithNullUser
      );
      expect(hasAccess).toBe(false);
    });

    it('should handle malformed permissions object', async () => {
      const userWithMalformedPermissions = {
        ...mockUser,
        permissions: null as any,
      };
      const contextWithMalformedPermissions = {
        ...mockContext,
        user: userWithMalformedPermissions,
      };

      // Should not throw an error, but deny access
      await expect(
        authProvider.canAccessTool('list-workflows', contextWithMalformedPermissions)
      ).rejects.toThrow();
    });

    it('should handle empty string tool names', async () => {
      const hasAccess = await authProvider.canAccessTool('', mockContext);
      expect(hasAccess).toBe(true); // Default to community access
    });

    it('should handle empty string resource URIs', async () => {
      const hasAccess = await authProvider.canAccessResource('', mockContext);
      expect(hasAccess).toBe(true); // Default to community access
    });

    it('should handle special characters in tool names', async () => {
      const hasAccess = await authProvider.canAccessTool(
        'tool-with-special-chars!@#$%',
        mockContext
      );
      expect(hasAccess).toBe(true); // Default to community access
    });

    it('should handle special characters in resource URIs', async () => {
      const hasAccess = await authProvider.canAccessResource(
        'n8n://resources/with-special@chars!',
        mockContext
      );
      expect(hasAccess).toBe(true); // Default to community access
    });
  });
});
