/**
 * OAuth2 Handler for n8n MCP Server
 *
 * Provides OAuth2 authentication flows, token management, and callback handling
 * for enhanced security and integration with OAuth2-enabled services.
 */

declare const fetch: typeof globalThis.fetch;

import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { setInterval } from 'timers';
import { N8nClient } from '../client/n8nClient.js';
import { BaseAuthProvider, RequestContext, AuthResult, AuthenticatedUser } from './authProvider.js';

/**
 * OAuth2 configuration for different providers
 */
export interface OAuth2Config {
  /** OAuth2 provider name (e.g., 'google', 'github', 'microsoft') */
  provider: string;

  /** Client ID from OAuth2 provider */
  clientId: string;

  /** Client secret from OAuth2 provider */
  clientSecret: string;

  /** OAuth2 authorization endpoint URL */
  authUrl: string;

  /** OAuth2 token endpoint URL */
  tokenUrl: string;

  /** OAuth2 user info endpoint URL (optional) */
  userInfoUrl?: string;

  /** Redirect URI for OAuth2 callback */
  redirectUri: string;

  /** OAuth2 scopes to request */
  scopes: string[];

  /** Additional parameters for authorization request */
  extraParams?: Record<string, string>;

  /** Token refresh settings */
  refreshSettings?: {
    /** Whether to automatically refresh tokens */
    autoRefresh: boolean;

    /** Buffer time before expiry to refresh (seconds) */
    refreshBuffer: number;
  };

  /** PKCE settings for enhanced security */
  pkce?: {
    /** Whether to use PKCE (Proof Key for Code Exchange) */
    enabled: boolean;

    /** Code challenge method */
    challengeMethod: 'S256' | 'plain';
  };
}

/**
 * OAuth2 token information
 */
export interface OAuth2Token {
  /** Access token */
  accessToken: string;

  /** Refresh token (if available) */
  refreshToken?: string;

  /** Token type (usually 'Bearer') */
  tokenType: string;

  /** Token expiry timestamp */
  expiresAt?: number;

  /** OAuth2 scopes granted */
  scopes: string[];

  /** Additional token metadata */
  metadata?: Record<string, unknown>;
}

/**
 * OAuth2 authorization session
 */
export interface OAuth2Session {
  /** Session ID */
  sessionId: string;

  /** OAuth2 provider */
  provider: string;

  /** Authorization state parameter */
  state: string;

  /** PKCE code verifier (if using PKCE) */
  codeVerifier?: string;

  /** PKCE code challenge (if using PKCE) */
  codeChallenge?: string;

  /** Session creation timestamp */
  createdAt: number;

  /** Session expiry timestamp */
  expiresAt: number;

  /** Additional session metadata */
  metadata?: Record<string, unknown>;
}

/**
 * OAuth2 callback result
 */
export interface OAuth2CallbackResult {
  /** Whether the callback was successful */
  success: boolean;

  /** OAuth2 tokens (if successful) */
  tokens?: OAuth2Token;

  /** User information from OAuth2 provider */
  userInfo?: OAuth2UserInfo;

  /** Error message (if failed) */
  error?: string;

  /** Error details */
  errorDetails?: {
    code?: string;
    description?: string;
    uri?: string;
  };
}

/**
 * User information from OAuth2 provider
 */
export interface OAuth2UserInfo {
  /** User ID from provider */
  id: string;

  /** User email */
  email?: string;

  /** User display name */
  name?: string;

  /** User avatar URL */
  avatar?: string;

  /** Additional user data from provider */
  raw?: Record<string, unknown>;
}

/**
 * OAuth2 authentication provider events
 */
export interface OAuth2Events {
  /** Token refresh event */
  tokenRefresh: (provider: string, userId: string, tokens: OAuth2Token) => void;

  /** Token expiry warning */
  tokenExpiring: (provider: string, userId: string, expiresIn: number) => void;

  /** Authentication success */
  authSuccess: (provider: string, userInfo: OAuth2UserInfo) => void;

  /** Authentication failure */
  authFailure: (provider: string, error: string) => void;
}

/**
 * OAuth2 Handler class
 *
 * Manages OAuth2 authentication flows, token storage, and callback processing.
 */
export class OAuth2Handler extends EventEmitter {
  private configs = new Map<string, OAuth2Config>();
  private sessions = new Map<string, OAuth2Session>();
  private tokens = new Map<string, OAuth2Token>();
  private n8nClient: N8nClient | null = null;

  constructor() {
    super();
    this.setupTokenRefreshTimer();
  }

  /**
   * Set n8n client for enhanced integration
   */
  setN8nClient(client: N8nClient): void {
    this.n8nClient = client;
  }

  /**
   * Register OAuth2 provider configuration
   */
  registerProvider(config: OAuth2Config): void {
    this.configs.set(config.provider, config);
  }

  /**
   * Generate OAuth2 authorization URL
   */
  generateAuthUrl(
    provider: string,
    options: {
      sessionId?: string;
      extraParams?: Record<string, string>;
      metadata?: Record<string, unknown>;
    } = {}
  ): { url: string; session: OAuth2Session } {
    const config = this.configs.get(provider);
    if (!config) {
      throw new Error(`OAuth2 provider '${provider}' not configured`);
    }

    // Generate session
    const sessionId = options.sessionId || this.generateSessionId();
    const state = this.generateState();
    const session: OAuth2Session = {
      sessionId,
      provider,
      state,
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      metadata: options.metadata,
    };

    // Generate PKCE parameters if enabled
    if (config.pkce?.enabled) {
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = this.generateCodeChallenge(codeVerifier, config.pkce.challengeMethod);
      session.codeVerifier = codeVerifier;
      session.codeChallenge = codeChallenge;
    }

    this.sessions.set(sessionId, session);

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      state,
      ...config.extraParams,
      ...options.extraParams,
    });

    // Add PKCE parameters
    if (session.codeChallenge) {
      params.set('code_challenge', session.codeChallenge);
      params.set('code_challenge_method', config.pkce!.challengeMethod);
    }

    const url = `${config.authUrl}?${params.toString()}`;

    return { url, session };
  }

  /**
   * Handle OAuth2 callback
   */
  async handleCallback(
    provider: string,
    callbackParams: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
      error_uri?: string;
    }
  ): Promise<OAuth2CallbackResult> {
    try {
      const config = this.configs.get(provider);
      if (!config) {
        throw new Error(`OAuth2 provider '${provider}' not configured`);
      }

      // Handle error response
      if (callbackParams.error) {
        const result: OAuth2CallbackResult = {
          success: false,
          error: callbackParams.error_description || callbackParams.error,
          errorDetails: {
            code: callbackParams.error,
            description: callbackParams.error_description,
            uri: callbackParams.error_uri,
          },
        };
        this.emit('authFailure', provider, result.error!);
        return result;
      }

      // Validate required parameters
      if (!callbackParams.code || !callbackParams.state) {
        throw new Error('Missing required callback parameters (code or state)');
      }

      // Find and validate session
      const session = this.findSessionByState(callbackParams.state);
      if (!session) {
        throw new Error('Invalid or expired OAuth2 state parameter');
      }

      if (session.provider !== provider) {
        throw new Error('OAuth2 provider mismatch in callback');
      }

      if (session.expiresAt < Date.now()) {
        throw new Error('OAuth2 session has expired');
      }

      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(config, callbackParams.code, session);

      // Get user information
      const userInfo = await this.getUserInfo(config, tokens);

      // Store tokens
      const tokenKey = this.getTokenKey(provider, userInfo.id);
      this.tokens.set(tokenKey, tokens);

      // Clean up session
      this.sessions.delete(session.sessionId);

      const result: OAuth2CallbackResult = {
        success: true,
        tokens,
        userInfo,
      };

      this.emit('authSuccess', provider, userInfo);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown OAuth2 callback error';
      const result: OAuth2CallbackResult = {
        success: false,
        error: errorMessage,
      };
      this.emit('authFailure', provider, errorMessage);
      return result;
    }
  }

  /**
   * Get stored tokens for user
   */
  getTokens(provider: string, userId: string): OAuth2Token | null {
    const tokenKey = this.getTokenKey(provider, userId);
    return this.tokens.get(tokenKey) || null;
  }

  /**
   * Refresh OAuth2 tokens
   */
  async refreshTokens(provider: string, userId: string): Promise<OAuth2Token | null> {
    try {
      const config = this.configs.get(provider);
      if (!config) {
        throw new Error(`OAuth2 provider '${provider}' not configured`);
      }

      const tokenKey = this.getTokenKey(provider, userId);
      const currentTokens = this.tokens.get(tokenKey);
      if (!currentTokens?.refreshToken) {
        throw new Error('No refresh token available');
      }

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: currentTokens.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json();
      const newTokens: OAuth2Token = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || currentTokens.refreshToken,
        tokenType: tokenData.token_type || 'Bearer',
        expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : currentTokens.scopes,
        metadata: { ...currentTokens.metadata, refreshedAt: Date.now() },
      };

      this.tokens.set(tokenKey, newTokens);
      this.emit('tokenRefresh', provider, userId, newTokens);

      return newTokens;
    } catch (error) {
      console.error(`Failed to refresh tokens for ${provider}:${userId}:`, error);
      return null;
    }
  }

  /**
   * Revoke OAuth2 tokens
   */
  async revokeTokens(provider: string, userId: string): Promise<boolean> {
    try {
      const config = this.configs.get(provider);
      const tokenKey = this.getTokenKey(provider, userId);
      const tokens = this.tokens.get(tokenKey);

      if (tokens) {
        // Attempt to revoke token with provider (if supported)
        // This is provider-specific and may not be supported by all providers
        try {
          if (config && tokens.accessToken) {
            // Basic revocation attempt - providers may have different endpoints
            const revokeUrl = `${config.tokenUrl.replace('/token', '/revoke')}`;
            await fetch(revokeUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Bearer ${tokens.accessToken}`,
              },
              body: `token=${tokens.accessToken}`,
            });
          }
        } catch {
          // Ignore revocation errors - we'll still remove locally
        }

        this.tokens.delete(tokenKey);
      }

      return true;
    } catch (error) {
      console.error(`Failed to revoke tokens for ${provider}:${userId}:`, error);
      return false;
    }
  }

  /**
   * Check if tokens are valid and not expired
   */
  areTokensValid(tokens: OAuth2Token, bufferSeconds: number = 300): boolean {
    if (!tokens.accessToken) {
      return false;
    }

    if (tokens.expiresAt) {
      const now = Date.now();
      const bufferMs = bufferSeconds * 1000;
      return tokens.expiresAt > now + bufferMs;
    }

    // If no expiry time, assume valid
    return true;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): OAuth2Session[] {
    const now = Date.now();
    const activeSessions: OAuth2Session[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt > now) {
        activeSessions.push(session);
      } else {
        // Clean up expired session
        this.sessions.delete(sessionId);
      }
    }

    return activeSessions;
  }

  /**
   * Clean up expired sessions and tokens
   */
  cleanup(): void {
    const now = Date.now();

    // Clean up expired sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
      }
    }

    // Check for expiring tokens
    for (const [tokenKey, tokens] of this.tokens.entries()) {
      if (tokens.expiresAt) {
        const timeToExpiry = tokens.expiresAt - now;
        const [provider, userId] = tokenKey.split(':');

        if (timeToExpiry <= 0) {
          // Token expired, remove it
          this.tokens.delete(tokenKey);
        } else if (timeToExpiry <= 300000) {
          // 5 minutes
          // Token expiring soon, emit warning
          this.emit('tokenExpiring', provider, userId, Math.floor(timeToExpiry / 1000));
        }
      }
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(
    config: OAuth2Config,
    code: string,
    session: OAuth2Session
  ): Promise<OAuth2Token> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    // Add PKCE code verifier if used
    if (session.codeVerifier) {
      params.set('code_verifier', session.codeVerifier);
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const tokenData = await response.json();

    if (tokenData.error) {
      throw new Error(`Token exchange error: ${tokenData.error_description || tokenData.error}`);
    }

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type || 'Bearer',
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : config.scopes,
      metadata: { acquiredAt: Date.now() },
    };
  }

  /**
   * Get user information from OAuth2 provider
   */
  private async getUserInfo(config: OAuth2Config, tokens: OAuth2Token): Promise<OAuth2UserInfo> {
    if (!config.userInfoUrl) {
      // If no user info URL, create basic user info from token
      return {
        id: 'unknown',
        name: 'OAuth2 User',
      };
    }

    const response = await fetch(config.userInfoUrl, {
      headers: {
        Authorization: `${tokens.tokenType} ${tokens.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status} ${response.statusText}`);
    }

    const userData = await response.json();

    return {
      id: userData.id || userData.sub || userData.user_id || 'unknown',
      email: userData.email,
      name: userData.name || userData.display_name || userData.username,
      avatar: userData.avatar_url || userData.picture,
      raw: userData,
    };
  }

  /**
   * Find session by state parameter
   */
  private findSessionByState(state: string): OAuth2Session | null {
    for (const session of this.sessions.values()) {
      if (session.state === state) {
        return session;
      }
    }
    return null;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `oauth2_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate OAuth2 state parameter
   */
  private generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge
   */
  private generateCodeChallenge(verifier: string, method: 'S256' | 'plain'): string {
    if (method === 'plain') {
      return verifier;
    }

    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Get token storage key
   */
  private getTokenKey(provider: string, userId: string): string {
    return `${provider}:${userId}`;
  }

  /**
   * Setup automatic token refresh timer
   */
  private setupTokenRefreshTimer(): void {
    setInterval(() => {
      this.cleanup();
      this.autoRefreshTokens();
    }, 60000); // Check every minute
  }

  /**
   * Automatically refresh tokens that are about to expire
   */
  private async autoRefreshTokens(): Promise<void> {
    for (const [tokenKey, tokens] of this.tokens.entries()) {
      const [provider, userId] = tokenKey.split(':');
      const config = this.configs.get(provider);

      if (config?.refreshSettings?.autoRefresh && tokens.refreshToken) {
        const bufferSeconds = config.refreshSettings.refreshBuffer || 300;

        if (!this.areTokensValid(tokens, bufferSeconds)) {
          try {
            await this.refreshTokens(provider, userId);
          } catch (error) {
            console.error(`Auto-refresh failed for ${provider}:${userId}:`, error);
          }
        }
      }
    }
  }
}

/**
 * OAuth2 Authentication Provider
 *
 * Integrates OAuth2Handler with the authentication provider interface.
 */
export class OAuth2AuthProvider extends BaseAuthProvider {
  private oauth2Handler: OAuth2Handler;

  constructor(oauth2Handler: OAuth2Handler) {
    super();
    this.oauth2Handler = oauth2Handler;
  }

  async authenticate(context: RequestContext): Promise<AuthResult> {
    try {
      // Extract OAuth2 tokens from context
      const tokens = this.extractTokensFromContext(context);
      if (!tokens) {
        return {
          success: false,
          error: 'No OAuth2 tokens found in request context',
        };
      }

      // Validate tokens
      if (!this.oauth2Handler.areTokensValid(tokens)) {
        return {
          success: false,
          error: 'OAuth2 tokens are invalid or expired',
        };
      }

      // Create authenticated user
      const user = this.createUserFromTokens(tokens, context);

      return {
        success: true,
        user,
        context: {
          authType: 'oauth2',
          tokenType: tokens.tokenType,
          scopes: tokens.scopes,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `OAuth2 authentication failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async refresh(context: RequestContext): Promise<AuthResult> {
    // OAuth2 refresh logic would be implemented here
    // For now, re-authenticate
    return this.authenticate(context);
  }

  /**
   * Extract OAuth2 tokens from request context
   */
  private extractTokensFromContext(context: RequestContext): OAuth2Token | null {
    const headers = context.headers || {};

    // Look for Bearer token in Authorization header
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const accessToken = authHeader.substring(7);
      return {
        accessToken,
        tokenType: 'Bearer',
        scopes: [], // Would need to be populated from stored token data
      };
    }

    return null;
  }

  /**
   * Create authenticated user from OAuth2 tokens
   */
  private createUserFromTokens(tokens: OAuth2Token, _context: RequestContext): AuthenticatedUser {
    return {
      id: `oauth2_${crypto.createHash('sha256').update(tokens.accessToken).digest('hex').substring(0, 16)}`,
      name: 'OAuth2 User',
      roles: ['oauth2-user'],
      permissions: this.createPermissions(['oauth2-user']),
    };
  }
}

/**
 * Create default OAuth2 handler with common provider configurations
 */
export function createOAuth2Handler(): OAuth2Handler {
  const handler = new OAuth2Handler();

  // Add common OAuth2 providers (can be configured via environment variables)
  const providers = ['google', 'github', 'microsoft', 'discord'];

  for (const provider of providers) {
    const clientId = process.env[`OAUTH2_${provider.toUpperCase()}_CLIENT_ID`];
    const clientSecret = process.env[`OAUTH2_${provider.toUpperCase()}_CLIENT_SECRET`];

    if (clientId && clientSecret) {
      const config = getProviderConfig(provider, clientId, clientSecret);
      if (config) {
        handler.registerProvider(config);
      }
    }
  }

  return handler;
}

/**
 * Get OAuth2 configuration for common providers
 */
function getProviderConfig(
  provider: string,
  clientId: string,
  clientSecret: string
): OAuth2Config | null {
  const baseUrl = process.env.OAUTH2_REDIRECT_BASE_URL || 'http://localhost:3000';

  const configs: Record<string, Omit<OAuth2Config, 'clientId' | 'clientSecret'>> = {
    google: {
      provider: 'google',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
      redirectUri: `${baseUrl}/auth/oauth2/callback/google`,
      scopes: ['openid', 'email', 'profile'],
      pkce: { enabled: true, challengeMethod: 'S256' },
      refreshSettings: { autoRefresh: true, refreshBuffer: 300 },
    },
    github: {
      provider: 'github',
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      redirectUri: `${baseUrl}/auth/oauth2/callback/github`,
      scopes: ['user:email'],
      refreshSettings: { autoRefresh: false, refreshBuffer: 300 },
    },
    microsoft: {
      provider: 'microsoft',
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      redirectUri: `${baseUrl}/auth/oauth2/callback/microsoft`,
      scopes: ['openid', 'email', 'profile'],
      pkce: { enabled: true, challengeMethod: 'S256' },
      refreshSettings: { autoRefresh: true, refreshBuffer: 300 },
    },
    discord: {
      provider: 'discord',
      authUrl: 'https://discord.com/api/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      userInfoUrl: 'https://discord.com/api/users/@me',
      redirectUri: `${baseUrl}/auth/oauth2/callback/discord`,
      scopes: ['identify', 'email'],
      refreshSettings: { autoRefresh: true, refreshBuffer: 300 },
    },
  };

  const config = configs[provider];
  if (!config) {
    return null;
  }

  return {
    ...config,
    clientId,
    clientSecret,
  };
}

/**
 * Default OAuth2 handler instance
 */
export const defaultOAuth2Handler = createOAuth2Handler();
