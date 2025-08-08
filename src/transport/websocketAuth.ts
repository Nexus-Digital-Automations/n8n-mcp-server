/**
 * WebSocket Authentication and Authorization for n8n Fork Integration
 *
 * Provides secure authentication mechanisms for WebSocket connections
 * including API keys, session tokens, OAuth 2.0, and enterprise SSO.
 */

import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';

// Authentication schemas
export const ApiKeyAuthSchema = z.object({
  type: z.literal('apiKey'),
  apiKey: z.string().min(1),
  keyType: z.enum(['user', 'service', 'admin']).default('user'),
});

export const SessionTokenAuthSchema = z.object({
  type: z.literal('sessionToken'),
  sessionToken: z.string().min(1),
  userId: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const OAuth2AuthSchema = z.object({
  type: z.literal('oauth2'),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  tokenType: z.string().default('Bearer'),
  expiresAt: z.string().optional(),
  scope: z.string().optional(),
});

export const SSOAuthSchema = z.object({
  type: z.literal('sso'),
  provider: z.enum(['saml', 'oidc']),
  token: z.string().min(1),
  userId: z.string(),
  email: z.string().email().optional(),
  roles: z.array(z.string()).default([]),
});

export const AuthConfigSchema = z.union([
  ApiKeyAuthSchema,
  SessionTokenAuthSchema,
  OAuth2AuthSchema,
  SSOAuthSchema,
]);

export type ApiKeyAuth = z.infer<typeof ApiKeyAuthSchema>;
export type SessionTokenAuth = z.infer<typeof SessionTokenAuthSchema>;
export type OAuth2Auth = z.infer<typeof OAuth2AuthSchema>;
export type SSOAuth = z.infer<typeof SSOAuthSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export interface AuthResult {
  success: boolean;
  userId?: string;
  roles?: string[];
  permissions?: string[];
  error?: string;
  metadata?: Record<string, any>;
}

export interface SecurityOptions {
  enableCSRFProtection: boolean;
  enableRateLimiting: boolean;
  maxConnectionsPerUser: number;
  tokenRefreshThreshold: number; // milliseconds before expiry to refresh
  securityHeaders: Record<string, string>;
}

/**
 * WebSocket Authentication Manager
 *
 * Handles authentication and authorization for WebSocket connections
 * with support for multiple authentication methods and security features.
 */
export class WebSocketAuthManager {
  private securityOptions: SecurityOptions;
  private connectionCounts: Map<string, number> = new Map();
  private rateLimitTracker: Map<string, { count: number; resetTime: number }> = new Map();
  private activeTokens: Map<string, { userId: string; expiresAt?: Date; type: string }> = new Map();

  constructor(securityOptions: Partial<SecurityOptions> = {}) {
    this.securityOptions = {
      enableCSRFProtection: true,
      enableRateLimiting: true,
      maxConnectionsPerUser: 10,
      tokenRefreshThreshold: 300000, // 5 minutes
      securityHeaders: {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
      },
      ...securityOptions,
    };
  }

  /**
   * Authenticate WebSocket connection
   */
  public async authenticate(authConfig: AuthConfig, connectionInfo: any): Promise<AuthResult> {
    try {
      // Validate authentication configuration
      const validatedAuth = AuthConfigSchema.parse(authConfig);

      // Check rate limiting
      if (this.securityOptions.enableRateLimiting) {
        const rateLimitResult = this.checkRateLimit(connectionInfo.remoteAddress);
        if (!rateLimitResult.allowed) {
          return {
            success: false,
            error: 'Rate limit exceeded',
            metadata: { retryAfter: rateLimitResult.retryAfter },
          };
        }
      }

      // Perform authentication based on type
      let authResult: AuthResult;
      switch (validatedAuth.type) {
        case 'apiKey':
          authResult = await this.authenticateApiKey(validatedAuth);
          break;
        case 'sessionToken':
          authResult = await this.authenticateSessionToken(validatedAuth);
          break;
        case 'oauth2':
          authResult = await this.authenticateOAuth2(validatedAuth);
          break;
        case 'sso':
          authResult = await this.authenticateSSO(validatedAuth);
          break;
        default:
          return { success: false, error: 'Unsupported authentication type' };
      }

      // Check connection limits
      if (authResult.success && authResult.userId) {
        const connectionResult = this.checkConnectionLimit(authResult.userId);
        if (!connectionResult.allowed) {
          return {
            success: false,
            error: 'Maximum connections exceeded for user',
            metadata: { maxConnections: this.securityOptions.maxConnectionsPerUser },
          };
        }
      }

      // Track successful authentication
      if (authResult.success && authResult.userId) {
        this.trackConnection(authResult.userId, validatedAuth.type);
      }

      return authResult;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication validation failed',
      };
    }
  }

  /**
   * Generate authentication headers for WebSocket connection
   */
  public generateAuthHeaders(authConfig: AuthConfig): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.securityOptions.securityHeaders,
    };

    switch (authConfig.type) {
      case 'apiKey':
        headers['X-N8N-API-KEY'] = authConfig.apiKey;
        break;
      case 'sessionToken':
        headers['Cookie'] = `n8n-auth=${authConfig.sessionToken}`;
        break;
      case 'oauth2':
        headers['Authorization'] = `${authConfig.tokenType} ${authConfig.accessToken}`;
        break;
      case 'sso':
        headers['Authorization'] = `SSO ${authConfig.token}`;
        headers['X-SSO-Provider'] = authConfig.provider;
        break;
    }

    // Add CSRF protection if enabled
    if (this.securityOptions.enableCSRFProtection) {
      headers['X-CSRF-Token'] = this.generateCSRFToken();
    }

    return headers;
  }

  /**
   * Check if token needs refresh
   */
  public needsTokenRefresh(authConfig: AuthConfig): boolean {
    const now = new Date();
    let expiresAt: Date | undefined;

    switch (authConfig.type) {
      case 'sessionToken':
        expiresAt = authConfig.expiresAt ? new Date(authConfig.expiresAt) : undefined;
        break;
      case 'oauth2':
        expiresAt = authConfig.expiresAt ? new Date(authConfig.expiresAt) : undefined;
        break;
      default:
        return false;
    }

    if (expiresAt) {
      const timeToExpiry = expiresAt.getTime() - now.getTime();
      return timeToExpiry <= this.securityOptions.tokenRefreshThreshold;
    }

    return false;
  }

  /**
   * Refresh authentication token
   */
  public async refreshToken(authConfig: AuthConfig): Promise<AuthConfig | null> {
    switch (authConfig.type) {
      case 'oauth2':
        return await this.refreshOAuth2Token(authConfig);
      case 'sessionToken':
        return await this.refreshSessionToken(authConfig);
      default:
        return null;
    }
  }

  /**
   * Track successful connection
   */
  public trackConnection(userId: string, authType: string): void {
    const currentCount = this.connectionCounts.get(userId) || 0;
    this.connectionCounts.set(userId, currentCount + 1);

    // Store token information for tracking
    const tokenKey = this.generateTokenKey(userId, authType);
    this.activeTokens.set(tokenKey, {
      userId,
      type: authType,
      expiresAt: new Date(Date.now() + 3600000), // 1 hour default
    });
  }

  /**
   * Release connection
   */
  public releaseConnection(userId: string): void {
    const currentCount = this.connectionCounts.get(userId) || 0;
    if (currentCount > 0) {
      this.connectionCounts.set(userId, currentCount - 1);
    }
  }

  /**
   * Authenticate using API key
   */
  private async authenticateApiKey(auth: ApiKeyAuth): Promise<AuthResult> {
    try {
      // In a real implementation, this would validate against n8n's API key store
      // For now, we'll simulate the validation
      const isValid = await this.validateApiKeyWithN8n(auth.apiKey);
      
      if (!isValid) {
        return { success: false, error: 'Invalid API key' };
      }

      // Get user information from API key
      const userInfo = await this.getUserInfoFromApiKey(auth.apiKey);
      
      return {
        success: true,
        userId: userInfo.userId,
        roles: userInfo.roles,
        permissions: userInfo.permissions,
        metadata: { keyType: auth.keyType },
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'API key authentication failed',
      };
    }
  }

  /**
   * Authenticate using session token
   */
  private async authenticateSessionToken(auth: SessionTokenAuth): Promise<AuthResult> {
    try {
      // Validate session token with n8n
      const sessionInfo = await this.validateSessionTokenWithN8n(auth.sessionToken);
      
      if (!sessionInfo.valid) {
        return { success: false, error: 'Invalid or expired session token' };
      }

      return {
        success: true,
        userId: sessionInfo.userId,
        roles: sessionInfo.roles,
        permissions: sessionInfo.permissions,
        metadata: { sessionId: sessionInfo.sessionId },
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session token authentication failed',
      };
    }
  }

  /**
   * Authenticate using OAuth 2.0
   */
  private async authenticateOAuth2(auth: OAuth2Auth): Promise<AuthResult> {
    try {
      // Validate OAuth2 token
      const tokenInfo = await this.validateOAuth2TokenWithN8n(auth.accessToken);
      
      if (!tokenInfo.valid) {
        return { success: false, error: 'Invalid or expired OAuth2 token' };
      }

      return {
        success: true,
        userId: tokenInfo.userId,
        roles: tokenInfo.roles,
        permissions: tokenInfo.scope?.split(' ') || [],
        metadata: { 
          tokenType: auth.tokenType,
          scope: auth.scope,
        },
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth2 authentication failed',
      };
    }
  }

  /**
   * Authenticate using SSO
   */
  private async authenticateSSO(auth: SSOAuth): Promise<AuthResult> {
    try {
      // Validate SSO token based on provider
      const ssoInfo = await this.validateSSOTokenWithN8n(auth.token, auth.provider);
      
      if (!ssoInfo.valid) {
        return { success: false, error: 'Invalid SSO token' };
      }

      return {
        success: true,
        userId: ssoInfo.userId,
        roles: ssoInfo.roles || auth.roles,
        permissions: ssoInfo.permissions,
        metadata: {
          provider: auth.provider,
          email: auth.email,
        },
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'SSO authentication failed',
      };
    }
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(remoteAddress: string): { allowed: boolean; retryAfter?: number } {
    const key = `rate_limit_${remoteAddress}`;
    const now = Date.now();
    const windowSize = 60000; // 1 minute window
    const maxRequests = 100; // Max 100 requests per minute

    const tracker = this.rateLimitTracker.get(key);
    
    if (!tracker || now > tracker.resetTime) {
      this.rateLimitTracker.set(key, { count: 1, resetTime: now + windowSize });
      return { allowed: true };
    }

    if (tracker.count >= maxRequests) {
      return { 
        allowed: false, 
        retryAfter: Math.ceil((tracker.resetTime - now) / 1000) 
      };
    }

    tracker.count++;
    return { allowed: true };
  }

  /**
   * Check connection limit
   */
  private checkConnectionLimit(userId: string): { allowed: boolean } {
    const currentCount = this.connectionCounts.get(userId) || 0;
    return { allowed: currentCount < this.securityOptions.maxConnectionsPerUser };
  }

  /**
   * Generate CSRF token
   */
  private generateCSRFToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generate token key for tracking
   */
  private generateTokenKey(userId: string, authType: string): string {
    const data = `${userId}:${authType}:${Date.now()}`;
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Refresh OAuth2 token
   */
  private async refreshOAuth2Token(auth: OAuth2Auth): Promise<OAuth2Auth | null> {
    if (!auth.refreshToken) {
      return null;
    }

    try {
      // In a real implementation, this would call the OAuth2 provider's token endpoint
      const refreshResult = await this.callOAuth2RefreshEndpoint(auth.refreshToken);
      
      return {
        ...auth,
        accessToken: refreshResult.accessToken,
        refreshToken: refreshResult.refreshToken || auth.refreshToken,
        expiresAt: new Date(Date.now() + refreshResult.expiresIn * 1000).toISOString(),
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh session token
   */
  private async refreshSessionToken(auth: SessionTokenAuth): Promise<SessionTokenAuth | null> {
    try {
      // In a real implementation, this would call n8n's session refresh endpoint
      const refreshResult = await this.callSessionRefreshEndpoint(auth.sessionToken);
      
      return {
        ...auth,
        sessionToken: refreshResult.sessionToken,
        expiresAt: refreshResult.expiresAt,
      };

    } catch (error) {
      return null;
    }
  }

  // Placeholder methods for external API calls
  // These would be implemented to call actual n8n fork APIs

  private async validateApiKeyWithN8n(apiKey: string): Promise<boolean> {
    // TODO: Implement actual API key validation with n8n fork
    return apiKey.length > 10; // Placeholder validation
  }

  private async getUserInfoFromApiKey(apiKey: string): Promise<any> {
    // TODO: Implement actual user info retrieval from API key
    return {
      userId: createHash('md5').update(apiKey).digest('hex').slice(0, 8),
      roles: ['user'],
      permissions: ['read', 'execute'],
    };
  }

  private async validateSessionTokenWithN8n(sessionToken: string): Promise<any> {
    // TODO: Implement actual session token validation
    return {
      valid: sessionToken.length > 10,
      userId: createHash('md5').update(sessionToken).digest('hex').slice(0, 8),
      roles: ['user'],
      permissions: ['read', 'execute'],
      sessionId: 'session_' + sessionToken.slice(0, 8),
    };
  }

  private async validateOAuth2TokenWithN8n(accessToken: string): Promise<any> {
    // TODO: Implement actual OAuth2 token validation
    return {
      valid: accessToken.length > 10,
      userId: createHash('md5').update(accessToken).digest('hex').slice(0, 8),
      roles: ['user'],
      scope: 'read execute',
    };
  }

  private async validateSSOTokenWithN8n(token: string, provider: string): Promise<any> {
    // TODO: Implement actual SSO token validation
    return {
      valid: token.length > 10,
      userId: createHash('md5').update(token).digest('hex').slice(0, 8),
      roles: ['user'],
      permissions: ['read', 'execute'],
    };
  }

  private async callOAuth2RefreshEndpoint(refreshToken: string): Promise<any> {
    // TODO: Implement actual OAuth2 refresh call
    return {
      accessToken: 'new_access_token_' + randomBytes(16).toString('hex'),
      refreshToken: refreshToken,
      expiresIn: 3600,
    };
  }

  private async callSessionRefreshEndpoint(sessionToken: string): Promise<any> {
    // TODO: Implement actual session refresh call
    return {
      sessionToken: 'new_session_token_' + randomBytes(16).toString('hex'),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }
}

/**
 * Create WebSocket authentication manager with default security options
 */
export function createWebSocketAuthManager(
  securityOptions: Partial<SecurityOptions> = {}
): WebSocketAuthManager {
  return new WebSocketAuthManager(securityOptions);
}

/**
 * Default security options
 */
export const DEFAULT_SECURITY_OPTIONS: SecurityOptions = {
  enableCSRFProtection: true,
  enableRateLimiting: true,
  maxConnectionsPerUser: 10,
  tokenRefreshThreshold: 300000,
  securityHeaders: {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  },
};