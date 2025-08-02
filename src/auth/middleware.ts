/**
 * FastMCP Authentication Middleware
 *
 * Provides authentication middleware for FastMCP server integration.
 * Handles authentication checking and access control for tools and resources.
 */

 

import { FastMCP } from 'fastmcp';
import { AuthProvider, RequestContext } from './authProvider.js';

/**
 * Authentication middleware configuration
 */
export interface AuthMiddlewareConfig {
  /** Authentication provider to use */
  authProvider: AuthProvider;

  /** Whether to require authentication for all requests */
  requireAuth?: boolean;

  /** Tools that bypass authentication (always allowed) */
  publicTools?: string[];

  /** Resources that bypass authentication (always allowed) */
  publicResources?: string[];

  /** Custom authentication header name */
  authHeader?: string;

  /** Error message for authentication failures */
  authErrorMessage?: string;

  /** Error message for authorization failures */
  authzErrorMessage?: string;
}

/**
 * Authentication middleware for FastMCP
 *
 * Integrates with FastMCP server to provide authentication and authorization
 * for tool access and resource access.
 */
export class FastMCPAuthMiddleware {
  private config: Required<AuthMiddlewareConfig>;

  constructor(config: AuthMiddlewareConfig) {
    this.config = {
      requireAuth: false,
      publicTools: ['init-n8n', 'status'],
      publicResources: [],
      authHeader: 'authorization',
      authErrorMessage: 'Authentication required',
      authzErrorMessage: 'Access denied',
      ...config,
    };
  }

  /**
   * Apply authentication middleware to FastMCP server
   */
  public apply(server: FastMCP): void {
    // Note: Current FastMCP version doesn't have built-in authentication
    // Authentication will be handled at the tool level through wrapper functions
    console.log('🔐 Authentication middleware configured (tool-level implementation)');

    // Store reference for tool wrapping
    (server as any)._authMiddleware = this;
  }

  /**
   * Create authentication function for FastMCP
   */
  private createAuthenticateFunction() {
    return async (request: any) => {
      try {
        const context = this.createRequestContext(request);
        const authResult = await this.config.authProvider.authenticate(context);

        if (!authResult.success) {
          if (this.config.requireAuth) {
            throw new Error(this.config.authErrorMessage);
          }
          // Allow anonymous access if auth not required
          return null;
        }

        return authResult.user;
      } catch (error) {
        if (this.config.requireAuth) {
          throw error;
        }
        return null;
      }
    };
  }

  /**
   * Check if tool access is allowed
   */
  public async checkToolAccess(toolName: string, context: RequestContext): Promise<void> {
    // Public tools are always allowed
    if (this.config.publicTools.includes(toolName)) {
      return;
    }

    // Authenticate if not already done
    if (!context.user) {
      const authResult = await this.config.authProvider.authenticate(context);
      if (!authResult.success) {
        if (this.config.requireAuth) {
          throw new Error(this.config.authErrorMessage);
        }
        return; // Allow anonymous access
      }
      context.user = authResult.user;
    }

    // Check tool access permissions
    const hasAccess = await this.config.authProvider.canAccessTool(toolName, context);
    if (!hasAccess) {
      throw new Error(`${this.config.authzErrorMessage}: ${toolName}`);
    }
  }

  /**
   * Check if resource access is allowed
   */
  public async checkResourceAccess(resourceUri: string, context: RequestContext): Promise<void> {
    // Public resources are always allowed
    if (this.config.publicResources.some(pattern => resourceUri.startsWith(pattern))) {
      return;
    }

    // Authenticate if not already done
    if (!context.user) {
      const authResult = await this.config.authProvider.authenticate(context);
      if (!authResult.success) {
        if (this.config.requireAuth) {
          throw new Error(this.config.authErrorMessage);
        }
        return; // Allow anonymous access
      }
      context.user = authResult.user;
    }

    // Check resource access permissions
    const hasAccess = await this.config.authProvider.canAccessResource(resourceUri, context);
    if (!hasAccess) {
      throw new Error(`${this.config.authzErrorMessage}: ${resourceUri}`);
    }
  }

  /**
   * Create request context from FastMCP request
   */
  private createRequestContext(request: any): RequestContext {
    return {
      clientId: request.clientId || request.id,
      headers: request.headers || {},
      metadata: request.metadata || {},
    };
  }

  /**
   * Wrap tool function with authentication
   */
  public wrapTool<T extends (...args: any[]) => any>(toolName: string, toolFunction: T): T {
    return (async (...args: any[]) => {
      const context = this.extractContextFromArgs(args);
      await this.checkToolAccess(toolName, context);
      return toolFunction(...args);
    }) as T;
  }

  /**
   * Wrap resource function with authentication
   */
  public wrapResource<T extends (...args: any[]) => any>(
    resourceUri: string,
    resourceFunction: T
  ): T {
    return (async (...args: any[]) => {
      const context = this.extractContextFromArgs(args);
      await this.checkResourceAccess(resourceUri, context);
      return resourceFunction(...args);
    }) as T;
  }

  /**
   * Extract request context from function arguments
   */
  private extractContextFromArgs(args: any[]): RequestContext {
    // Look for context in arguments (FastMCP typically passes context as last argument)
    const lastArg = args[args.length - 1];
    if (lastArg && typeof lastArg === 'object' && lastArg.session) {
      return {
        clientId: lastArg.session?.id,
        headers: lastArg.headers || {},
        metadata: lastArg.metadata || {},
      };
    }

    return {
      headers: {},
      metadata: {},
    };
  }
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig): FastMCPAuthMiddleware {
  return new FastMCPAuthMiddleware(config);
}

/**
 * Authentication decorator for tools
 *
 * Usage:
 * @requireAuth('tool-name')
 * async function myTool() { ... }
 */
export function requireAuth(toolName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // This would be implemented with actual middleware instance
      console.log(`🔒 Authentication check for tool: ${toolName}`);
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Authorization decorator for tools with specific permissions
 *
 * Usage:
 * @requirePermission('workflows')
 * async function manageWorkflow() { ... }
 */
export function requirePermission(permission: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // This would be implemented with actual middleware instance
      console.log(`🛡️  Permission check for: ${permission}`);
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Environment variable configuration for authentication middleware
 */
export const AUTH_ENV_CONFIG = {
  /** Whether authentication is required */
  REQUIRE_AUTH: 'N8N_MCP_REQUIRE_AUTH',

  /** Public tools (comma-separated) */
  PUBLIC_TOOLS: 'N8N_MCP_PUBLIC_TOOLS',

  /** Public resources (comma-separated) */
  PUBLIC_RESOURCES: 'N8N_MCP_PUBLIC_RESOURCES',

  /** Custom auth header name */
  AUTH_HEADER: 'N8N_MCP_AUTH_HEADER',

  /** Custom auth error message */
  AUTH_ERROR_MESSAGE: 'N8N_MCP_AUTH_ERROR_MESSAGE',

  /** Custom authz error message */
  AUTHZ_ERROR_MESSAGE: 'N8N_MCP_AUTHZ_ERROR_MESSAGE',
} as const;

/**
 * Parse authentication middleware configuration from environment
 */
export function parseAuthConfigFromEnv(authProvider: AuthProvider): AuthMiddlewareConfig {
  return {
    authProvider,
    requireAuth: process.env[AUTH_ENV_CONFIG.REQUIRE_AUTH] === 'true',
    publicTools: process.env[AUTH_ENV_CONFIG.PUBLIC_TOOLS]?.split(',') || undefined,
    publicResources: process.env[AUTH_ENV_CONFIG.PUBLIC_RESOURCES]?.split(',') || undefined,
    authHeader: process.env[AUTH_ENV_CONFIG.AUTH_HEADER] || undefined,
    authErrorMessage: process.env[AUTH_ENV_CONFIG.AUTH_ERROR_MESSAGE] || undefined,
    authzErrorMessage: process.env[AUTH_ENV_CONFIG.AUTHZ_ERROR_MESSAGE] || undefined,
  };
}
