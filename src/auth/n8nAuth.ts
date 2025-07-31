/**
 * n8n-specific Authentication Provider
 *
 * Implements authentication for n8n MCP server using n8n API keys and role-based access control.
 * Supports both Community and Enterprise n8n instances with appropriate feature detection.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */

import { N8nClient } from '../client/n8nClient.js';
import {
  AuthProvider,
  BaseAuthProvider,
  RequestContext,
  AuthResult,
  AuthenticatedUser,
} from './authProvider.js';

/**
 * n8n authentication configuration
 */
export interface N8nAuthConfig {
  /** Whether authentication is required (default: false for backward compatibility) */
  required?: boolean;

  /** Default n8n instance URL (can be overridden per request) */
  defaultBaseUrl?: string;

  /** Default n8n API key (can be overridden per request) */
  defaultApiKey?: string;

  /** Whether to validate n8n connection during authentication */
  validateConnection?: boolean;

  /** Cache authentication results for this duration (ms) */
  cacheDuration?: number;

  /** Default user roles for authenticated users */
  defaultRoles?: string[];
}

/**
 * Authentication cache entry
 */
interface AuthCacheEntry {
  result: AuthResult;
  expires: number;
}

/**
 * n8n authentication provider
 *
 * Provides authentication using n8n API keys with role-based access control.
 * Supports both authenticated and anonymous access based on configuration.
 */
export class N8nAuthProvider extends BaseAuthProvider {
  private config: Required<N8nAuthConfig>;
  private authCache = new Map<string, AuthCacheEntry>();

  constructor(config: N8nAuthConfig = {}) {
    super();

    // Set defaults
    this.config = {
      required: false,
      defaultBaseUrl: process.env.N8N_BASE_URL || '',
      defaultApiKey: process.env.N8N_API_KEY || '',
      validateConnection: true,
      cacheDuration: 5 * 60 * 1000, // 5 minutes
      defaultRoles: ['member'],
      ...config,
    };
  }

  /**
   * Authenticate client request
   */
  async authenticate(context: RequestContext): Promise<AuthResult> {
    try {
      // If authentication is not required, allow anonymous access
      if (!this.config.required) {
        return this.createAnonymousAuth(context);
      }

      // Extract credentials from context
      const credentials = this.extractCredentials(context);
      if (!credentials) {
        return {
          success: false,
          error: 'Authentication required but no credentials provided',
        };
      }

      // Check cache first
      const cacheKey = this.getCacheKey(credentials);
      const cached = this.authCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.result;
      }

      // Validate credentials
      const authResult = await this.validateCredentials(credentials);

      // Cache successful results
      if (authResult.success && this.config.cacheDuration > 0) {
        this.authCache.set(cacheKey, {
          result: authResult,
          expires: Date.now() + this.config.cacheDuration,
        });
      }

      return authResult;
    } catch (error) {
      return {
        success: false,
        error: `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Refresh authentication
   */
  async refresh(context: RequestContext): Promise<AuthResult> {
    // Clear cache and re-authenticate
    if (context.user) {
      const cacheKey = this.getCacheKey({
        baseUrl: context.user.n8nBaseUrl || this.config.defaultBaseUrl,
        apiKey: context.user.n8nApiKey || this.config.defaultApiKey,
      });
      this.authCache.delete(cacheKey);
    }

    return this.authenticate(context);
  }

  /**
   * Create anonymous authentication result
   */
  private createAnonymousAuth(context: RequestContext): AuthResult {
    const user: AuthenticatedUser = {
      id: 'anonymous',
      name: 'Anonymous User',
      roles: ['anonymous'],
      permissions: {
        community: true,
        enterprise: false,
        workflows: true,
        executions: true,
        credentials: false,
        users: false,
        audit: false,
      },
      n8nBaseUrl: this.config.defaultBaseUrl,
      n8nApiKey: this.config.defaultApiKey,
    };

    return {
      success: true,
      user,
      context: {
        authType: 'anonymous',
        features: ['community'],
      },
    };
  }

  /**
   * Extract credentials from request context
   */
  private extractCredentials(context: RequestContext): { baseUrl: string; apiKey: string } | null {
    const headers = context.headers || {};

    // Try different credential sources
    const apiKey =
      headers['x-n8n-api-key'] ||
      headers['authorization']?.replace(/^Bearer\s+/, '') ||
      this.config.defaultApiKey;

    const baseUrl = headers['x-n8n-base-url'] || this.config.defaultBaseUrl;

    if (!apiKey || !baseUrl) {
      return null;
    }

    return { baseUrl, apiKey };
  }

  /**
   * Validate credentials against n8n instance
   */
  private async validateCredentials(credentials: {
    baseUrl: string;
    apiKey: string;
  }): Promise<AuthResult> {
    try {
      // Create n8n client to test connection
      const client = new N8nClient(credentials.baseUrl, credentials.apiKey);

      if (this.config.validateConnection) {
        // Test connection by fetching user info or workflows
        try {
          await client.getWorkflows({ limit: 1 });
        } catch (error) {
          return {
            success: false,
            error: `Invalid n8n credentials or connection failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }

      // Create authenticated user
      const user = await this.createAuthenticatedUser(credentials, client);

      return {
        success: true,
        user,
        context: {
          authType: 'n8n-api-key',
          features: this.detectFeatures(user),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Authentication validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Create authenticated user from credentials
   */
  private async createAuthenticatedUser(
    credentials: { baseUrl: string; apiKey: string },
    client: N8nClient
  ): Promise<AuthenticatedUser> {
    // Detect user roles and permissions
    const roles = await this.detectUserRoles(client);
    const permissions = this.createPermissions(roles);

    return {
      id: `n8n-${credentials.baseUrl}-${credentials.apiKey.slice(-8)}`,
      name: 'n8n API User',
      roles,
      permissions,
      n8nBaseUrl: credentials.baseUrl,
      n8nApiKey: credentials.apiKey,
    };
  }

  /**
   * Detect user roles based on n8n API capabilities
   */
  private async detectUserRoles(client: N8nClient): Promise<string[]> {
    const roles: string[] = [...this.config.defaultRoles];

    try {
      // Test Enterprise features to determine if user has elevated permissions
      try {
        await client.getUsers({ limit: 1 });
        roles.push('admin'); // Can access user management
      } catch {
        // User management not accessible, likely not an admin
      }

      try {
        await client.getProjects({ limit: 1 });
        roles.push('enterprise'); // Can access Enterprise features
      } catch {
        // Enterprise features not accessible
      }
    } catch {
      // Default to basic roles
    }

    return [...new Set(roles)]; // Remove duplicates
  }

  /**
   * Detect available features
   */
  private detectFeatures(user: AuthenticatedUser): string[] {
    const features: string[] = ['community'];

    if (user.permissions.enterprise) {
      features.push('enterprise');
    }

    if (user.permissions.users) {
      features.push('user-management');
    }

    if (user.permissions.audit) {
      features.push('audit');
    }

    return features;
  }

  /**
   * Generate cache key for credentials
   */
  private getCacheKey(credentials: { baseUrl: string; apiKey: string }): string {
    return `${credentials.baseUrl}:${credentials.apiKey}`;
  }

  /**
   * Clear authentication cache
   */
  public clearCache(): void {
    this.authCache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; entries: number } {
    const now = Date.now();
    let validEntries = 0;

    for (const [key, entry] of this.authCache.entries()) {
      if (entry.expires > now) {
        validEntries++;
      } else {
        this.authCache.delete(key); // Clean up expired entries
      }
    }

    return {
      size: this.authCache.size,
      entries: validEntries,
    };
  }
}

/**
 * Create n8n authentication provider from environment variables
 */
export function createN8nAuth(): N8nAuthProvider {
  const config: N8nAuthConfig = {
    required: process.env.N8N_MCP_AUTH_REQUIRED === 'true',
    defaultBaseUrl: process.env.N8N_BASE_URL,
    defaultApiKey: process.env.N8N_API_KEY,
    validateConnection: process.env.N8N_MCP_VALIDATE_CONNECTION !== 'false',
    cacheDuration: process.env.N8N_MCP_AUTH_CACHE_DURATION
      ? parseInt(process.env.N8N_MCP_AUTH_CACHE_DURATION)
      : undefined,
    defaultRoles: process.env.N8N_MCP_DEFAULT_ROLES?.split(',') || undefined,
  };

  return new N8nAuthProvider(config);
}

/**
 * Default n8n authentication provider instance
 */
export const defaultN8nAuth = createN8nAuth();
