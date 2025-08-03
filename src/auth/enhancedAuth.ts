/**
 * Enhanced Authentication Flows for n8n MCP Server
 *
 * Provides advanced authentication capabilities including multi-factor authentication,
 * session management, token rotation, and security monitoring.
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { N8nClient } from '../client/n8nClient.js';
import {
  AuthProvider,
  BaseAuthProvider,
  RequestContext,
  AuthResult,
  AuthenticatedUser,
} from './authProvider.js';
import { OAuth2Handler, OAuth2Token } from './oauth2Handler.js';

/**
 * Enhanced authentication configuration
 */
export interface EnhancedAuthConfig {
  /** Enable multi-factor authentication */
  mfaEnabled?: boolean;

  /** Session configuration */
  session?: {
    /** Session timeout in milliseconds */
    timeout: number;

    /** Enable session sliding (extend on activity) */
    sliding: boolean;

    /** Maximum concurrent sessions per user */
    maxConcurrent: number;

    /** Session storage type */
    storage: 'memory' | 'redis' | 'database';
  };

  /** Token rotation configuration */
  tokenRotation?: {
    /** Enable automatic token rotation */
    enabled: boolean;

    /** Rotation interval in milliseconds */
    interval: number;

    /** Grace period for old tokens */
    gracePeriod: number;
  };

  /** Security monitoring */
  security?: {
    /** Enable failed login attempt tracking */
    trackFailedAttempts: boolean;

    /** Maximum failed attempts before lockout */
    maxFailedAttempts: number;

    /** Lockout duration in milliseconds */
    lockoutDuration: number;

    /** Enable IP-based rate limiting */
    rateLimiting: boolean;

    /** Rate limit window in milliseconds */
    rateLimitWindow: number;

    /** Maximum requests per window */
    maxRequestsPerWindow: number;
  };

  /** Audit configuration */
  audit?: {
    /** Enable authentication event logging */
    enabled: boolean;

    /** Log successful authentications */
    logSuccess: boolean;

    /** Log failed authentications */
    logFailures: boolean;

    /** Log session events */
    logSessions: boolean;

    /** Log security events */
    logSecurity: boolean;
  };
}

/**
 * Authentication session information
 */
export interface AuthSession {
  /** Session ID */
  sessionId: string;

  /** User ID */
  userId: string;

  /** Session creation timestamp */
  createdAt: number;

  /** Last activity timestamp */
  lastActivity: number;

  /** Session expiry timestamp */
  expiresAt: number;

  /** Client information */
  client: {
    /** IP address */
    ip?: string;

    /** User agent */
    userAgent?: string;

    /** Device fingerprint */
    fingerprint?: string;
  };

  /** Session metadata */
  metadata?: Record<string, unknown>;

  /** Security flags */
  security: {
    /** Requires MFA */
    requiresMfa: boolean;

    /** MFA completed */
    mfaCompleted: boolean;

    /** Is elevated session */
    elevated: boolean;

    /** Last security check */
    lastSecurityCheck: number;
  };
}

/**
 * MFA challenge information
 */
export interface MfaChallenge {
  /** Challenge ID */
  challengeId: string;

  /** User ID */
  userId: string;

  /** Challenge type */
  type: 'totp' | 'sms' | 'email' | 'backup-code';

  /** Challenge creation timestamp */
  createdAt: number;

  /** Challenge expiry timestamp */
  expiresAt: number;

  /** Challenge-specific data */
  data?: Record<string, unknown>;

  /** Number of attempts */
  attempts: number;

  /** Maximum allowed attempts */
  maxAttempts: number;
}

/**
 * Security event information
 */
export interface SecurityEvent {
  /** Event ID */
  id: string;

  /** Event type */
  type: 'login' | 'logout' | 'mfa' | 'token-rotation' | 'suspicious-activity' | 'lockout';

  /** User ID (if applicable) */
  userId?: string;

  /** Session ID (if applicable) */
  sessionId?: string;

  /** Event timestamp */
  timestamp: number;

  /** Client information */
  client?: {
    ip?: string;
    userAgent?: string;
    fingerprint?: string;
  };

  /** Event details */
  details: Record<string, unknown>;

  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Whether event was suspicious */
  suspicious: boolean;
}

/**
 * Rate limiting information
 */
export interface RateLimit {
  /** Client identifier (IP, user ID, etc.) */
  identifier: string;

  /** Request count in current window */
  requests: number;

  /** Window start timestamp */
  windowStart: number;

  /** Window end timestamp */
  windowEnd: number;

  /** Whether rate limit is exceeded */
  exceeded: boolean;
}

/**
 * Enhanced Authentication Provider
 *
 * Provides advanced authentication features with security monitoring,
 * session management, and multi-factor authentication.
 */
export class EnhancedAuthProvider extends EventEmitter implements AuthProvider {
  private config: Required<EnhancedAuthConfig>;
  private sessions = new Map<string, AuthSession>();
  private mfaChallenges = new Map<string, MfaChallenge>();
  private securityEvents: SecurityEvent[] = [];
  private failedAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();
  private rateLimits = new Map<string, RateLimit>();
  private baseAuthProvider: AuthProvider;
  private oauth2Handler?: OAuth2Handler;

  constructor(baseAuthProvider: AuthProvider, config: Partial<EnhancedAuthConfig> = {}) {
    super();
    this.baseAuthProvider = baseAuthProvider;

    // Set defaults
    this.config = {
      mfaEnabled: false,
      session: {
        timeout: 24 * 60 * 60 * 1000, // 24 hours
        sliding: true,
        maxConcurrent: 5,
        storage: 'memory',
      },
      tokenRotation: {
        enabled: false,
        interval: 60 * 60 * 1000, // 1 hour
        gracePeriod: 5 * 60 * 1000, // 5 minutes
      },
      security: {
        trackFailedAttempts: true,
        maxFailedAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        rateLimiting: true,
        rateLimitWindow: 60 * 1000, // 1 minute
        maxRequestsPerWindow: 60,
      },
      audit: {
        enabled: true,
        logSuccess: true,
        logFailures: true,
        logSessions: true,
        logSecurity: true,
      },
      ...config,
    } as Required<EnhancedAuthConfig>;

    this.setupCleanupTimer();
  }

  /**
   * Set OAuth2 handler for enhanced OAuth2 support
   */
  setOAuth2Handler(handler: OAuth2Handler): void {
    this.oauth2Handler = handler;
  }

  /**
   * Authenticate client request with enhanced security
   */
  async authenticate(context: RequestContext): Promise<AuthResult> {
    const clientId = this.getClientIdentifier(context);

    try {
      // Check rate limiting
      if (this.config.security.rateLimiting) {
        const rateLimit = this.checkRateLimit(clientId);
        if (rateLimit.exceeded) {
          this.logSecurityEvent({
            type: 'suspicious-activity',
            details: { reason: 'rate-limit-exceeded', identifier: clientId },
            severity: 'medium',
            suspicious: true,
          });
          return {
            success: false,
            error: 'Rate limit exceeded. Please try again later.',
          };
        }
      }

      // Check for account lockout
      if (this.config.security.trackFailedAttempts) {
        const lockout = this.checkLockout(clientId);
        if (lockout) {
          this.logSecurityEvent({
            type: 'lockout',
            details: { reason: 'account-locked', identifier: clientId, lockedUntil: lockout },
            severity: 'high',
            suspicious: true,
          });
          return {
            success: false,
            error: `Account locked due to too many failed attempts. Try again after ${new Date(lockout).toLocaleString()}.`,
          };
        }
      }

      // Check for existing session
      const existingSessionId = this.extractSessionId(context);
      if (existingSessionId) {
        const session = this.sessions.get(existingSessionId);
        if (session && this.isSessionValid(session)) {
          // Update session activity
          if (this.config.session.sliding) {
            session.lastActivity = Date.now();
            session.expiresAt = Date.now() + this.config.session.timeout;
          }

          const user = await this.getUserFromSession(session);
          if (user) {
            return {
              success: true,
              user,
              context: {
                sessionId: session.sessionId,
                authType: 'session',
                requiresMfa: session.security.requiresMfa && !session.security.mfaCompleted,
              },
            };
          }
        } else if (session) {
          // Remove invalid session
          this.sessions.delete(existingSessionId);
        }
      }

      // Perform base authentication
      const baseResult = await this.baseAuthProvider.authenticate(context);
      if (!baseResult.success) {
        // Track failed attempt
        if (this.config.security.trackFailedAttempts) {
          this.trackFailedAttempt(clientId);
        }

        this.logSecurityEvent({
          type: 'login',
          details: { success: false, error: baseResult.error, identifier: clientId },
          severity: 'low',
          suspicious: false,
        });

        return baseResult;
      }

      // Create new session
      const session = await this.createSession(baseResult.user!, context);

      // Check if MFA is required
      if (this.config.mfaEnabled && this.requiresMfa(baseResult.user!)) {
        session.security.requiresMfa = true;
        session.security.mfaCompleted = false;

        this.logSecurityEvent({
          type: 'login',
          userId: baseResult.user!.id,
          sessionId: session.sessionId,
          details: { success: true, requiresMfa: true },
          severity: 'low',
          suspicious: false,
        });

        return {
          success: true,
          user: baseResult.user,
          context: {
            sessionId: session.sessionId,
            authType: 'partial',
            requiresMfa: true,
            mfaChallengeRequired: true,
          },
        };
      }

      // Clear failed attempts on successful login
      if (this.config.security.trackFailedAttempts) {
        this.failedAttempts.delete(clientId);
      }

      this.logSecurityEvent({
        type: 'login',
        userId: baseResult.user!.id,
        sessionId: session.sessionId,
        details: { success: true, requiresMfa: false },
        severity: 'low',
        suspicious: false,
      });

      return {
        success: true,
        user: baseResult.user,
        context: {
          sessionId: session.sessionId,
          authType: 'enhanced',
          requiresMfa: false,
        },
      };
    } catch (error) {
      // Track failed attempt
      if (this.config.security.trackFailedAttempts) {
        this.trackFailedAttempt(clientId);
      }

      this.logSecurityEvent({
        type: 'login',
        details: { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
        severity: 'medium',
        suspicious: true,
      });

      return {
        success: false,
        error: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Refresh authentication
   */
  async refresh(context: RequestContext): Promise<AuthResult> {
    const sessionId = this.extractSessionId(context);
    if (!sessionId) {
      return {
        success: false,
        error: 'No session found for refresh',
      };
    }

    const session = this.sessions.get(sessionId);
    if (!session || !this.isSessionValid(session)) {
      return {
        success: false,
        error: 'Invalid or expired session',
      };
    }

    // Update session activity
    session.lastActivity = Date.now();
    if (this.config.session.sliding) {
      session.expiresAt = Date.now() + this.config.session.timeout;
    }

    const user = await this.getUserFromSession(session);
    if (!user) {
      return {
        success: false,
        error: 'Unable to refresh user information',
      };
    }

    return {
      success: true,
      user,
      context: {
        sessionId: session.sessionId,
        authType: 'session-refresh',
        requiresMfa: session.security.requiresMfa && !session.security.mfaCompleted,
      },
    };
  }

  /**
   * Check tool access permissions
   */
  async canAccessTool(toolName: string, context: RequestContext): Promise<boolean> {
    return this.baseAuthProvider.canAccessTool(toolName, context);
  }

  /**
   * Check resource access permissions
   */
  async canAccessResource(resourceUri: string, context: RequestContext): Promise<boolean> {
    return this.baseAuthProvider.canAccessResource(resourceUri, context);
  }

  /**
   * Create MFA challenge
   */
  async createMfaChallenge(
    userId: string,
    type: MfaChallenge['type'],
    sessionId?: string
  ): Promise<MfaChallenge> {
    const challengeId = this.generateChallengeId();
    const challenge: MfaChallenge = {
      challengeId,
      userId,
      type,
      createdAt: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000), // 5 minutes
      attempts: 0,
      maxAttempts: 3,
    };

    // Generate challenge-specific data
    switch (type) {
      case 'totp':
        // TOTP challenges don't need additional data
        break;
      case 'sms':
      case 'email':
        challenge.data = {
          code: this.generateMfaCode(),
        };
        break;
      case 'backup-code':
        // Backup codes are pre-generated
        break;
    }

    this.mfaChallenges.set(challengeId, challenge);

    this.logSecurityEvent({
      type: 'mfa',
      userId,
      sessionId,
      details: { action: 'challenge-created', type, challengeId },
      severity: 'low',
      suspicious: false,
    });

    return challenge;
  }

  /**
   * Verify MFA challenge
   */
  async verifyMfaChallenge(
    challengeId: string,
    response: string,
    sessionId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const challenge = this.mfaChallenges.get(challengeId);
    if (!challenge) {
      return {
        success: false,
        error: 'Invalid or expired MFA challenge',
      };
    }

    if (challenge.expiresAt < Date.now()) {
      this.mfaChallenges.delete(challengeId);
      return {
        success: false,
        error: 'MFA challenge has expired',
      };
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      this.mfaChallenges.delete(challengeId);
      this.logSecurityEvent({
        type: 'mfa',
        userId: challenge.userId,
        sessionId,
        details: { action: 'max-attempts-exceeded', challengeId },
        severity: 'medium',
        suspicious: true,
      });
      return {
        success: false,
        error: 'Maximum MFA attempts exceeded',
      };
    }

    challenge.attempts++;

    // Verify response based on challenge type
    let isValid = false;
    switch (challenge.type) {
      case 'totp':
        isValid = await this.verifyTotpCode(challenge.userId, response);
        break;
      case 'sms':
      case 'email':
        isValid = challenge.data?.code === response;
        break;
      case 'backup-code':
        isValid = await this.verifyBackupCode(challenge.userId, response);
        break;
    }

    if (isValid) {
      this.mfaChallenges.delete(challengeId);

      // Update session if provided
      if (sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
          session.security.mfaCompleted = true;
        }
      }

      this.logSecurityEvent({
        type: 'mfa',
        userId: challenge.userId,
        sessionId,
        details: { action: 'challenge-verified', type: challenge.type, challengeId },
        severity: 'low',
        suspicious: false,
      });

      return { success: true };
    }

    this.logSecurityEvent({
      type: 'mfa',
      userId: challenge.userId,
      sessionId,
      details: { action: 'challenge-failed', type: challenge.type, challengeId, attempts: challenge.attempts },
      severity: 'low',
      suspicious: challenge.attempts > 1,
    });

    return {
      success: false,
      error: 'Invalid MFA code',
    };
  }

  /**
   * Logout user and invalidate session
   */
  async logout(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.sessions.delete(sessionId);

    this.logSecurityEvent({
      type: 'logout',
      userId: session.userId,
      sessionId,
      details: { action: 'explicit-logout' },
      severity: 'low',
      suspicious: false,
    });

    return true;
  }

  /**
   * Get active sessions for user
   */
  getActiveSessions(userId: string): AuthSession[] {
    const sessions: AuthSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId && this.isSessionValid(session)) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  /**
   * Terminate all sessions for user
   */
  terminateAllSessions(userId: string): number {
    let terminated = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
        terminated++;
      }
    }

    if (terminated > 0) {
      this.logSecurityEvent({
        type: 'logout',
        userId,
        details: { action: 'terminate-all-sessions', count: terminated },
        severity: 'medium',
        suspicious: false,
      });
    }

    return terminated;
  }

  /**
   * Get security events
   */
  getSecurityEvents(
    options: {
      userId?: string;
      type?: SecurityEvent['type'];
      severity?: SecurityEvent['severity'];
      limit?: number;
      since?: number;
    } = {}
  ): SecurityEvent[] {
    let events = [...this.securityEvents];

    if (options.userId) {
      events = events.filter(e => e.userId === options.userId);
    }

    if (options.type) {
      events = events.filter(e => e.type === options.type);
    }

    if (options.severity) {
      events = events.filter(e => e.severity === options.severity);
    }

    if (options.since) {
      events = events.filter(e => e.timestamp >= options.since!);
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  /**
   * Get account lockout status
   */
  getLockoutStatus(identifier: string): { locked: boolean; lockedUntil?: number; attempts: number } {
    const failedAttempt = this.failedAttempts.get(identifier);
    if (!failedAttempt) {
      return { locked: false, attempts: 0 };
    }

    const now = Date.now();
    const locked = failedAttempt.lockedUntil ? failedAttempt.lockedUntil > now : false;

    return {
      locked,
      lockedUntil: failedAttempt.lockedUntil,
      attempts: failedAttempt.count,
    };
  }

  /**
   * Clear account lockout
   */
  clearLockout(identifier: string): boolean {
    return this.failedAttempts.delete(identifier);
  }

  /**
   * Create authentication session
   */
  private async createSession(user: AuthenticatedUser, context: RequestContext): Promise<AuthSession> {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    // Check concurrent session limit
    const activeSessions = this.getActiveSessions(user.id);
    if (activeSessions.length >= this.config.session.maxConcurrent) {
      // Remove oldest session
      const oldestSession = activeSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
      this.sessions.delete(oldestSession.sessionId);
    }

    const session: AuthSession = {
      sessionId,
      userId: user.id,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + this.config.session.timeout,
      client: {
        ip: context.headers?.['x-forwarded-for'] || context.headers?.['x-real-ip'],
        userAgent: context.headers?.['user-agent'],
        fingerprint: this.generateClientFingerprint(context),
      },
      metadata: context.metadata,
      security: {
        requiresMfa: false,
        mfaCompleted: false,
        elevated: false,
        lastSecurityCheck: now,
      },
    };

    this.sessions.set(sessionId, session);

    if (this.config.audit.logSessions) {
      this.logSecurityEvent({
        type: 'login',
        userId: user.id,
        sessionId,
        details: { action: 'session-created' },
        severity: 'low',
        suspicious: false,
      });
    }

    return session;
  }

  /**
   * Check if session is valid
   */
  private isSessionValid(session: AuthSession): boolean {
    const now = Date.now();
    return session.expiresAt > now;
  }

  /**
   * Get user from session
   */
  private async getUserFromSession(session: AuthSession): Promise<AuthenticatedUser | null> {
    // This would typically fetch user data from the base auth provider
    // For now, we'll create a basic user object
    return {
      id: session.userId,
      name: 'Session User',
      roles: ['user'],
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
  }

  /**
   * Check if user requires MFA
   */
  private requiresMfa(user: AuthenticatedUser): boolean {
    // Check if user has elevated permissions that require MFA
    return user.permissions.users || user.permissions.audit || user.roles.includes('admin');
  }

  /**
   * Track failed authentication attempt
   */
  private trackFailedAttempt(identifier: string): void {
    const now = Date.now();
    const attempt = this.failedAttempts.get(identifier) || { count: 0, lastAttempt: 0 };

    attempt.count++;
    attempt.lastAttempt = now;

    if (attempt.count >= this.config.security.maxFailedAttempts) {
      attempt.lockedUntil = now + this.config.security.lockoutDuration;
    }

    this.failedAttempts.set(identifier, attempt);
  }

  /**
   * Check for account lockout
   */
  private checkLockout(identifier: string): number | null {
    const attempt = this.failedAttempts.get(identifier);
    if (!attempt || !attempt.lockedUntil) {
      return null;
    }

    const now = Date.now();
    if (attempt.lockedUntil > now) {
      return attempt.lockedUntil;
    }

    // Lockout period has expired, clear it
    this.failedAttempts.delete(identifier);
    return null;
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(identifier: string): RateLimit {
    const now = Date.now();
    const existing = this.rateLimits.get(identifier);

    if (!existing || existing.windowEnd <= now) {
      // Create new rate limit window
      const rateLimit: RateLimit = {
        identifier,
        requests: 1,
        windowStart: now,
        windowEnd: now + this.config.security.rateLimitWindow,
        exceeded: false,
      };
      this.rateLimits.set(identifier, rateLimit);
      return rateLimit;
    }

    // Increment request count
    existing.requests++;
    existing.exceeded = existing.requests > this.config.security.maxRequestsPerWindow;

    return existing;
  }

  /**
   * Log security event
   */
  private logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'client'>): void {
    if (!this.config.audit.enabled) {
      return;
    }

    const shouldLog = 
      (event.type === 'login' && (this.config.audit.logSuccess || this.config.audit.logFailures)) ||
      (event.type === 'logout' && this.config.audit.logSessions) ||
      (event.type === 'mfa' && this.config.audit.logSecurity) ||
      (event.severity === 'high' || event.severity === 'critical');

    if (!shouldLog) {
      return;
    }

    const securityEvent: SecurityEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: Date.now(),
      client: event.details?.client as SecurityEvent['client'],
    };

    this.securityEvents.push(securityEvent);

    // Emit event for external listeners
    this.emit('securityEvent', securityEvent);

    // Keep only last 1000 events in memory
    if (this.securityEvents.length > 1000) {
      this.securityEvents = this.securityEvents.slice(-1000);
    }
  }

  /**
   * Extract session ID from context
   */
  private extractSessionId(context: RequestContext): string | null {
    return context.headers?.['x-session-id'] || 
           context.headers?.['authorization']?.replace(/^Session\s+/, '') ||
           null;
  }

  /**
   * Get client identifier for rate limiting
   */
  private getClientIdentifier(context: RequestContext): string {
    return context.headers?.['x-forwarded-for'] || 
           context.headers?.['x-real-ip'] || 
           context.clientId || 
           'unknown';
  }

  /**
   * Generate client fingerprint
   */
  private generateClientFingerprint(context: RequestContext): string {
    const components = [
      context.headers?.['user-agent'],
      context.headers?.['accept-language'],
      context.headers?.['accept-encoding'],
    ].filter(Boolean);

    return crypto.createHash('sha256').update(components.join('|')).digest('hex');
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Generate MFA challenge ID
   */
  private generateChallengeId(): string {
    return `mfa_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate security event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate MFA code
   */
  private generateMfaCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Verify TOTP code (placeholder implementation)
   */
  private async verifyTotpCode(userId: string, code: string): Promise<boolean> {
    // This would integrate with a TOTP library like speakeasy
    // For now, return false as we don't have TOTP secrets stored
    return false;
  }

  /**
   * Verify backup code (placeholder implementation)
   */
  private async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    // This would check against stored backup codes
    // For now, return false as we don't have backup codes stored
    return false;
  }

  /**
   * Setup cleanup timer for expired sessions and challenges
   */
  private setupCleanupTimer(): void {
    setInterval(() => {
      this.cleanup();
    }, 60000); // Run every minute
  }

  /**
   * Clean up expired sessions, challenges, and rate limits
   */
  private cleanup(): void {
    const now = Date.now();

    // Clean up expired sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      if (!this.isSessionValid(session)) {
        this.sessions.delete(sessionId);
      }
    }

    // Clean up expired MFA challenges
    for (const [challengeId, challenge] of this.mfaChallenges.entries()) {
      if (challenge.expiresAt <= now) {
        this.mfaChallenges.delete(challengeId);
      }
    }

    // Clean up expired rate limits
    for (const [identifier, rateLimit] of this.rateLimits.entries()) {
      if (rateLimit.windowEnd <= now) {
        this.rateLimits.delete(identifier);
      }
    }

    // Clean up old failed attempts
    for (const [identifier, attempt] of this.failedAttempts.entries()) {
      if (attempt.lockedUntil && attempt.lockedUntil <= now) {
        this.failedAttempts.delete(identifier);
      }
    }
  }
}

/**
 * Create enhanced authentication provider
 */
export function createEnhancedAuth(
  baseAuthProvider: AuthProvider,
  config?: Partial<EnhancedAuthConfig>
): EnhancedAuthProvider {
  return new EnhancedAuthProvider(baseAuthProvider, config);
}

/**
 * Environment variable configuration for enhanced authentication
 */
export const ENHANCED_AUTH_ENV_CONFIG = {
  /** Enable MFA */
  MFA_ENABLED: 'N8N_MCP_MFA_ENABLED',

  /** Session timeout in seconds */
  SESSION_TIMEOUT: 'N8N_MCP_SESSION_TIMEOUT',

  /** Enable session sliding */
  SESSION_SLIDING: 'N8N_MCP_SESSION_SLIDING',

  /** Maximum concurrent sessions */
  MAX_CONCURRENT_SESSIONS: 'N8N_MCP_MAX_CONCURRENT_SESSIONS',

  /** Enable token rotation */
  TOKEN_ROTATION_ENABLED: 'N8N_MCP_TOKEN_ROTATION_ENABLED',

  /** Token rotation interval in seconds */
  TOKEN_ROTATION_INTERVAL: 'N8N_MCP_TOKEN_ROTATION_INTERVAL',

  /** Maximum failed attempts */
  MAX_FAILED_ATTEMPTS: 'N8N_MCP_MAX_FAILED_ATTEMPTS',

  /** Lockout duration in seconds */
  LOCKOUT_DURATION: 'N8N_MCP_LOCKOUT_DURATION',

  /** Enable rate limiting */
  RATE_LIMITING_ENABLED: 'N8N_MCP_RATE_LIMITING_ENABLED',

  /** Rate limit window in seconds */
  RATE_LIMIT_WINDOW: 'N8N_MCP_RATE_LIMIT_WINDOW',

  /** Max requests per window */
  MAX_REQUESTS_PER_WINDOW: 'N8N_MCP_MAX_REQUESTS_PER_WINDOW',
} as const;

/**
 * Parse enhanced authentication configuration from environment
 */
export function parseEnhancedAuthConfigFromEnv(): Partial<EnhancedAuthConfig> {
  return {
    mfaEnabled: process.env[ENHANCED_AUTH_ENV_CONFIG.MFA_ENABLED] === 'true',
    session: {
      timeout: process.env[ENHANCED_AUTH_ENV_CONFIG.SESSION_TIMEOUT] 
        ? parseInt(process.env[ENHANCED_AUTH_ENV_CONFIG.SESSION_TIMEOUT]!) * 1000 
        : 24 * 60 * 60 * 1000,
      sliding: process.env[ENHANCED_AUTH_ENV_CONFIG.SESSION_SLIDING] !== 'false',
      maxConcurrent: process.env[ENHANCED_AUTH_ENV_CONFIG.MAX_CONCURRENT_SESSIONS]
        ? parseInt(process.env[ENHANCED_AUTH_ENV_CONFIG.MAX_CONCURRENT_SESSIONS]!)
        : 5,
      storage: 'memory' as const,
    },
    tokenRotation: {
      enabled: process.env[ENHANCED_AUTH_ENV_CONFIG.TOKEN_ROTATION_ENABLED] === 'true',
      interval: process.env[ENHANCED_AUTH_ENV_CONFIG.TOKEN_ROTATION_INTERVAL]
        ? parseInt(process.env[ENHANCED_AUTH_ENV_CONFIG.TOKEN_ROTATION_INTERVAL]!) * 1000
        : 60 * 60 * 1000,
      gracePeriod: 5 * 60 * 1000,
    },
    security: {
      trackFailedAttempts: true,
      maxFailedAttempts: process.env[ENHANCED_AUTH_ENV_CONFIG.MAX_FAILED_ATTEMPTS]
        ? parseInt(process.env[ENHANCED_AUTH_ENV_CONFIG.MAX_FAILED_ATTEMPTS]!)
        : 5,
      lockoutDuration: process.env[ENHANCED_AUTH_ENV_CONFIG.LOCKOUT_DURATION]
        ? parseInt(process.env[ENHANCED_AUTH_ENV_CONFIG.LOCKOUT_DURATION]!) * 1000
        : 15 * 60 * 1000,
      rateLimiting: process.env[ENHANCED_AUTH_ENV_CONFIG.RATE_LIMITING_ENABLED] !== 'false',
      rateLimitWindow: process.env[ENHANCED_AUTH_ENV_CONFIG.RATE_LIMIT_WINDOW]
        ? parseInt(process.env[ENHANCED_AUTH_ENV_CONFIG.RATE_LIMIT_WINDOW]!) * 1000
        : 60 * 1000,
      maxRequestsPerWindow: process.env[ENHANCED_AUTH_ENV_CONFIG.MAX_REQUESTS_PER_WINDOW]
        ? parseInt(process.env[ENHANCED_AUTH_ENV_CONFIG.MAX_REQUESTS_PER_WINDOW]!)
        : 60,
    },
    audit: {
      enabled: true,
      logSuccess: true,
      logFailures: true,
      logSessions: true,
      logSecurity: true,
    },
  };
}