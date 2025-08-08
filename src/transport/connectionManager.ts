/**
 * Connection Manager for n8n Fork Real-time Integration
 *
 * Manages WebSocket connections with automatic reconnection, error handling,
 * authentication refresh, and connection health monitoring.
 */

import { EventEmitter } from 'events';
import { N8nWebSocketClient, WebSocketConfig } from './websocketClient.js';
import { EventStreamingManager, EventStreamingConfig } from './eventStreamingManager.js';
import { ProgressMonitor, ProgressMonitorConfig } from './progressMonitor.js';
import { WebSocketAuthManager, AuthConfig, AuthResult } from './websocketAuth.js';
import { z } from 'zod';

// Connection manager schemas
export const ConnectionConfigSchema = z.object({
  n8nBaseUrl: z.string().url(),
  authConfig: z.any(), // AuthConfig will be validated separately
  websocket: z.object({
    reconnectInterval: z.number().default(1000),
    maxReconnectAttempts: z.number().default(10),
    heartbeatInterval: z.number().default(30000),
    connectionTimeout: z.number().default(10000),
    autoReconnect: z.boolean().default(true),
  }).default({}),
  streaming: z.object({
    bufferSize: z.number().default(100),
    retryAttempts: z.number().default(5),
    enableProgressTracking: z.boolean().default(true),
    enableMetrics: z.boolean().default(true),
  }).default({}),
  monitoring: z.object({
    enablePredictiveAnalytics: z.boolean().default(true),
    enablePerformanceTracking: z.boolean().default(true),
    historicalDataLimit: z.number().default(1000),
    progressUpdateInterval: z.number().default(1000),
  }).default({}),
  healthCheck: z.object({
    enabled: z.boolean().default(true),
    interval: z.number().default(60000), // 1 minute
    timeout: z.number().default(5000),
    maxFailures: z.number().default(3),
  }).default({}),
});

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  authenticated: boolean;
  lastConnected?: Date;
  lastDisconnected?: Date;
  totalReconnects: number;
  consecutiveFailures: number;
  uptime: number;
  authExpiresAt?: Date;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

export interface ConnectionHealth {
  websocketConnected: boolean;
  authenticationValid: boolean;
  streamingActive: boolean;
  progressMonitorActive: boolean;
  lastHeartbeat?: Date;
  roundTripLatency?: number;
  errorRate: number;
  reconnectAttempts: number;
}

/**
 * Connection Manager
 *
 * Orchestrates all WebSocket connection components with comprehensive
 * error handling, reconnection logic, and health monitoring.
 */
export class ConnectionManager extends EventEmitter {
  private config: ConnectionConfig;
  private wsClient: N8nWebSocketClient | null = null;
  private eventStreamingManager: EventStreamingManager | null = null;
  private progressMonitor: ProgressMonitor | null = null;
  private authManager: WebSocketAuthManager;
  
  private state: ConnectionState;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private authRefreshTimer: NodeJS.Timeout | null = null;
  private reconnectAttemptTimer: NodeJS.Timeout | null = null;
  private startTime: Date;

  constructor(config: ConnectionConfig) {
    super();
    this.config = ConnectionConfigSchema.parse(config);
    this.authManager = new WebSocketAuthManager();
    this.startTime = new Date();
    
    this.state = {
      status: 'disconnected',
      authenticated: false,
      totalReconnects: 0,
      consecutiveFailures: 0,
      uptime: 0,
      healthStatus: 'healthy',
    };
  }

  /**
   * Start the connection manager
   */
  public async start(): Promise<void> {
    try {
      this.emit('starting', { timestamp: new Date().toISOString() });
      
      // Initialize components
      await this.initializeComponents();
      
      // Start connection
      await this.connect();
      
      // Start health monitoring
      if (this.config.healthCheck.enabled) {
        this.startHealthMonitoring();
      }
      
      // Start authentication refresh monitoring
      this.startAuthRefreshMonitoring();
      
      this.emit('started', { 
        timestamp: new Date().toISOString(),
        state: this.getConnectionState(),
      });
      
    } catch (error) {
      this.state.status = 'failed';
      this.emit('startupError', {
        error: error instanceof Error ? error.message : 'Unknown startup error',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Stop the connection manager
   */
  public async stop(): Promise<void> {
    try {
      this.emit('stopping', { timestamp: new Date().toISOString() });
      
      // Clear timers
      this.clearTimers();
      
      // Stop monitoring
      if (this.progressMonitor) {
        this.progressMonitor.stop();
      }
      
      // Stop streaming
      if (this.eventStreamingManager) {
        await this.eventStreamingManager.stopStreaming();
      }
      
      // Disconnect WebSocket
      if (this.wsClient) {
        await this.wsClient.disconnect();
      }
      
      this.state.status = 'disconnected';
      this.state.authenticated = false;
      this.state.lastDisconnected = new Date();
      
      this.emit('stopped', { 
        timestamp: new Date().toISOString(),
        totalUptime: this.calculateUptime(),
        totalReconnects: this.state.totalReconnects,
      });
      
    } catch (error) {
      this.emit('stopError', {
        error: error instanceof Error ? error.message : 'Unknown stop error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): ConnectionState {
    return {
      ...this.state,
      uptime: this.calculateUptime(),
    };
  }

  /**
   * Get connection health information
   */
  public getConnectionHealth(): ConnectionHealth {
    return {
      websocketConnected: this.wsClient?.isConnected() || false,
      authenticationValid: this.state.authenticated,
      streamingActive: this.eventStreamingManager?.getConnectionStatus().isStreaming || false,
      progressMonitorActive: this.progressMonitor !== null,
      lastHeartbeat: this.wsClient?.getConnectionState().lastHeartbeat,
      roundTripLatency: this.calculateLatency(),
      errorRate: this.calculateErrorRate(),
      reconnectAttempts: this.state.totalReconnects,
    };
  }

  /**
   * Force reconnection
   */
  public async reconnect(): Promise<void> {
    try {
      this.emit('manualReconnect', { timestamp: new Date().toISOString() });
      
      // Disconnect existing connection
      if (this.wsClient) {
        await this.wsClient.disconnect();
      }
      
      // Attempt new connection
      await this.connect();
      
    } catch (error) {
      this.emit('reconnectError', {
        error: error instanceof Error ? error.message : 'Unknown reconnect error',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Subscribe to workflow updates
   */
  public async subscribeToWorkflow(workflowId: string): Promise<void> {
    if (!this.eventStreamingManager) {
      throw new Error('Event streaming manager not initialized');
    }
    
    await this.eventStreamingManager.subscribeToWorkflow(workflowId);
  }

  /**
   * Unsubscribe from workflow updates
   */
  public async unsubscribeFromWorkflow(workflowId: string): Promise<void> {
    if (!this.eventStreamingManager) {
      throw new Error('Event streaming manager not initialized');
    }
    
    await this.eventStreamingManager.unsubscribeFromWorkflow(workflowId);
  }

  /**
   * Send command to n8n fork
   */
  public async sendCommand(command: any): Promise<void> {
    if (!this.wsClient || !this.wsClient.isConnected()) {
      throw new Error('WebSocket not connected');
    }
    
    await this.wsClient.sendMessage(command);
  }

  /**
   * Initialize all components
   */
  private async initializeComponents(): Promise<void> {
    // Create WebSocket URL
    const wsUrl = this.createWebSocketUrl(this.config.n8nBaseUrl);
    
    // Create WebSocket configuration
    const wsConfig: WebSocketConfig = {
      url: wsUrl,
      ...this.config.websocket,
    };
    
    // Initialize WebSocket client
    this.wsClient = new N8nWebSocketClient(wsConfig);
    
    // Setup WebSocket event handlers
    this.setupWebSocketHandlers();
    
    // Initialize event streaming manager
    const streamingConfig: EventStreamingConfig = {
      wsConfig,
      ...this.config.streaming,
    };
    
    this.eventStreamingManager = new EventStreamingManager(streamingConfig);
    
    // Setup streaming event handlers
    this.setupStreamingHandlers();
    
    // Initialize progress monitor
    const monitorConfig: ProgressMonitorConfig = {
      ...this.config.monitoring,
      enablePredictiveAnalytics: this.config.monitoring.enablePredictiveAnalytics,
      enablePerformanceTracking: this.config.monitoring.enablePerformanceTracking,
      historicalDataLimit: this.config.monitoring.historicalDataLimit,
      progressUpdateInterval: this.config.monitoring.progressUpdateInterval,
      benchmarkingEnabled: true,
      alertThresholds: {
        slowExecutionMultiplier: 2.0,
        highFailureRate: 0.3,
        maxExecutionTime: 300000,
      },
    };
    
    this.progressMonitor = new ProgressMonitor(this.eventStreamingManager, monitorConfig);
    
    // Setup progress monitor event handlers
    this.setupProgressMonitorHandlers();
  }

  /**
   * Connect to n8n fork
   */
  private async connect(): Promise<void> {
    if (!this.wsClient) {
      throw new Error('WebSocket client not initialized');
    }
    
    try {
      this.state.status = 'connecting';
      this.emit('connecting', { timestamp: new Date().toISOString() });
      
      // Authenticate
      const authResult = await this.authenticate();
      if (!authResult.success) {
        throw new Error(`Authentication failed: ${authResult.error}`);
      }
      
      // Apply authentication headers
      const authHeaders = this.authManager.generateAuthHeaders(this.config.authConfig);
      const wsConfig: WebSocketConfig = {
        url: this.createWebSocketUrl(this.config.n8nBaseUrl),
        ...this.config.websocket,
        headers: authHeaders,
      };
      this.wsClient = new N8nWebSocketClient(wsConfig);
      
      // Connect WebSocket
      await this.wsClient.connect();
      
      // Start streaming
      if (this.eventStreamingManager) {
        await this.eventStreamingManager.startStreaming();
      }
      
      // Update state
      this.state.status = 'connected';
      this.state.authenticated = true;
      this.state.lastConnected = new Date();
      this.state.consecutiveFailures = 0;
      this.state.healthStatus = 'healthy';
      
      this.emit('connected', {
        timestamp: new Date().toISOString(),
        authResult,
        reconnectAttempt: this.state.totalReconnects > 0,
      });
      
    } catch (error) {
      this.state.status = 'failed';
      this.state.consecutiveFailures++;
      
      this.emit('connectionError', {
        error: error instanceof Error ? error.message : 'Unknown connection error',
        timestamp: new Date().toISOString(),
        consecutiveFailures: this.state.consecutiveFailures,
      });
      
      // Attempt automatic reconnection if enabled
      if (this.config.websocket.autoReconnect && 
          this.state.totalReconnects < this.config.websocket.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
      
      throw error;
    }
  }

  /**
   * Authenticate with n8n fork
   */
  private async authenticate(): Promise<AuthResult> {
    const authResult = await this.authManager.authenticate(
      this.config.authConfig,
      { remoteAddress: '127.0.0.1' } // TODO: Get actual remote address
    );
    
    if (authResult.success && authResult.userId) {
      this.authManager.trackConnection(authResult.userId, this.config.authConfig.type);
      
      // Set auth expiration if applicable
      if (this.config.authConfig.type === 'oauth2' && this.config.authConfig.expiresAt) {
        this.state.authExpiresAt = new Date(this.config.authConfig.expiresAt);
      }
    }
    
    return authResult;
  }

  /**
   * Schedule automatic reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttemptTimer) {
      return;
    }
    
    this.state.status = 'reconnecting';
    this.state.totalReconnects++;
    
    const delay = Math.min(
      this.config.websocket.reconnectInterval * Math.pow(2, this.state.totalReconnects - 1),
      30000 // Max 30 seconds
    );
    
    this.emit('reconnectScheduled', {
      attempt: this.state.totalReconnects,
      delay,
      timestamp: new Date().toISOString(),
    });
    
    this.reconnectAttemptTimer = setTimeout(async () => {
      this.reconnectAttemptTimer = null;
      
      try {
        await this.connect();
      } catch (error) {
        // Error handling is done in connect() method
      }
    }, delay);
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.wsClient) return;
    
    this.wsClient.on('disconnected', (data) => {
      this.state.status = 'disconnected';
      this.state.authenticated = false;
      this.state.lastDisconnected = new Date();
      
      this.emit('disconnected', {
        ...data,
        timestamp: new Date().toISOString(),
      });
      
      // Attempt reconnection if not a clean disconnect
      if (this.config.websocket.autoReconnect && data.code !== 1000) {
        this.scheduleReconnect();
      }
    });
    
    this.wsClient.on('error', (error) => {
      this.state.healthStatus = 'unhealthy';
      
      this.emit('websocketError', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    });
    
    this.wsClient.on('maxReconnectAttemptsReached', () => {
      this.state.status = 'failed';
      this.state.healthStatus = 'unhealthy';
      
      this.emit('maxReconnectAttemptsReached', {
        totalAttempts: this.state.totalReconnects,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Setup streaming event handlers
   */
  private setupStreamingHandlers(): void {
    if (!this.eventStreamingManager) return;
    
    this.eventStreamingManager.on('streamingStarted', (data) => {
      this.emit('streamingStarted', data);
    });
    
    this.eventStreamingManager.on('streamingStopped', (data) => {
      this.emit('streamingStopped', data);
    });
    
    this.eventStreamingManager.on('streamingError', (data) => {
      this.state.healthStatus = 'degraded';
      this.emit('streamingError', data);
    });
    
    // Forward workflow events
    this.eventStreamingManager.on('workflowEvent', (event) => {
      this.emit('workflowEvent', event);
    });
    
    this.eventStreamingManager.on('executionStarted', (data) => {
      this.emit('executionStarted', data);
    });
    
    this.eventStreamingManager.on('executionCompleted', (data) => {
      this.emit('executionCompleted', data);
    });
  }

  /**
   * Setup progress monitor event handlers
   */
  private setupProgressMonitorHandlers(): void {
    if (!this.progressMonitor) return;
    
    this.progressMonitor.on('progressStarted', (data) => {
      this.emit('progressStarted', data);
    });
    
    this.progressMonitor.on('progressCompleted', (data) => {
      this.emit('progressCompleted', data);
    });
    
    this.progressMonitor.on('progressUpdated', (data) => {
      this.emit('progressUpdated', data);
    });
    
    this.progressMonitor.on('alert', (alert) => {
      if (alert.severity === 'critical') {
        this.state.healthStatus = 'unhealthy';
      } else if (alert.severity === 'high') {
        this.state.healthStatus = 'degraded';
      }
      
      this.emit('alert', alert);
    });
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheck.interval);
  }

  /**
   * Start authentication refresh monitoring
   */
  private startAuthRefreshMonitoring(): void {
    this.authRefreshTimer = setInterval(() => {
      this.checkAuthRefresh();
    }, 60000); // Check every minute
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    const health = this.getConnectionHealth();
    
    let healthScore = 0;
    if (health.websocketConnected) healthScore += 25;
    if (health.authenticationValid) healthScore += 25;
    if (health.streamingActive) healthScore += 25;
    if (health.progressMonitorActive) healthScore += 25;
    
    // Update health status
    if (healthScore >= 75) {
      this.state.healthStatus = 'healthy';
    } else if (healthScore >= 50) {
      this.state.healthStatus = 'degraded';
    } else {
      this.state.healthStatus = 'unhealthy';
    }
    
    this.emit('healthCheck', {
      health,
      healthScore,
      status: this.state.healthStatus,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if authentication needs refresh
   */
  private async checkAuthRefresh(): Promise<void> {
    if (this.authManager.needsTokenRefresh(this.config.authConfig)) {
      try {
        const refreshedAuth = await this.authManager.refreshToken(this.config.authConfig);
        if (refreshedAuth) {
          this.config.authConfig = refreshedAuth;
          this.emit('authRefreshed', {
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        this.emit('authRefreshError', {
          error: error instanceof Error ? error.message : 'Auth refresh failed',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Create WebSocket URL from base URL
   */
  private createWebSocketUrl(baseUrl: string): string {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/rest/push';
    return url.toString();
  }

  /**
   * Calculate uptime in milliseconds
   */
  private calculateUptime(): number {
    if (this.state.lastConnected) {
      return Date.now() - this.state.lastConnected.getTime();
    }
    return 0;
  }

  /**
   * Calculate round-trip latency
   */
  private calculateLatency(): number | undefined {
    // TODO: Implement actual latency calculation
    return undefined;
  }

  /**
   * Calculate error rate
   */
  private calculateErrorRate(): number {
    // TODO: Implement actual error rate calculation
    return this.state.consecutiveFailures / Math.max(this.state.totalReconnects + 1, 1);
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    if (this.authRefreshTimer) {
      clearInterval(this.authRefreshTimer);
      this.authRefreshTimer = null;
    }
    
    if (this.reconnectAttemptTimer) {
      clearTimeout(this.reconnectAttemptTimer);
      this.reconnectAttemptTimer = null;
    }
  }
}

/**
 * Create connection manager with default configuration
 */
export function createConnectionManager(
  n8nBaseUrl: string,
  authConfig: AuthConfig,
  options: Partial<ConnectionConfig> = {}
): ConnectionManager {
  const config: ConnectionConfig = {
    n8nBaseUrl,
    authConfig,
    websocket: {
      reconnectInterval: 1000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      autoReconnect: true,
      ...options.websocket,
    },
    streaming: {
      bufferSize: 100,
      retryAttempts: 5,
      enableProgressTracking: true,
      enableMetrics: true,
      ...options.streaming,
    },
    monitoring: {
      enablePredictiveAnalytics: true,
      enablePerformanceTracking: true,
      historicalDataLimit: 1000,
      progressUpdateInterval: 1000,
      ...options.monitoring,
    },
    healthCheck: {
      enabled: true,
      interval: 60000,
      timeout: 5000,
      maxFailures: 3,
      ...options.healthCheck,
    },
  };

  return new ConnectionManager(config);
}

/**
 * Default connection configuration
 */
export const DEFAULT_CONNECTION_CONFIG: Partial<ConnectionConfig> = {
  websocket: {
    reconnectInterval: 1000,
    maxReconnectAttempts: 10,
    heartbeatInterval: 30000,
    connectionTimeout: 10000,
    autoReconnect: true,
  },
  streaming: {
    bufferSize: 100,
    retryAttempts: 5,
    enableProgressTracking: true,
    enableMetrics: true,
  },
  monitoring: {
    enablePredictiveAnalytics: true,
    enablePerformanceTracking: true,
    historicalDataLimit: 1000,
    progressUpdateInterval: 1000,
  },
  healthCheck: {
    enabled: true,
    interval: 60000,
    timeout: 5000,
    maxFailures: 3,
  },
};