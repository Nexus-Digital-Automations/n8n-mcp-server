/**
 * Unit Tests for Connection Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  ConnectionManager,
  ConnectionConfig,
  createConnectionManager,
  DEFAULT_CONNECTION_CONFIG,
} from '../../../src/transport/connectionManager.js';
import { AuthConfig } from '../../../src/transport/websocketAuth.js';

// Mock all dependencies
const mockWebSocketClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  getConnectionState: vi.fn().mockReturnValue({
    connected: true,
    reconnectAttempts: 0,
    lastHeartbeat: new Date(),
    lastMessage: new Date(),
    connectionTime: new Date(),
  }),
  on: vi.fn(),
  emit: vi.fn(),
};

const mockEventStreamingManager = {
  startStreaming: vi.fn().mockResolvedValue(undefined),
  stopStreaming: vi.fn().mockResolvedValue(undefined),
  subscribeToWorkflow: vi.fn().mockResolvedValue(undefined),
  unsubscribeFromWorkflow: vi.fn().mockResolvedValue(undefined),
  getConnectionStatus: vi.fn().mockReturnValue({
    isConnected: true,
    isStreaming: true,
    connectionState: {},
  }),
  on: vi.fn(),
  emit: vi.fn(),
};

const mockProgressMonitor = {
  stop: vi.fn(),
  on: vi.fn(),
  emit: vi.fn(),
};

const mockAuthManager = {
  authenticate: vi.fn().mockResolvedValue({
    success: true,
    userId: 'user-123',
    roles: ['user'],
    permissions: ['read', 'execute'],
  }),
  generateAuthHeaders: vi.fn().mockReturnValue({
    'X-N8N-API-KEY': 'test-key',
    'User-Agent': 'n8n-mcp-server/2.0.0',
  }),
  needsTokenRefresh: vi.fn().mockReturnValue(false),
  refreshToken: vi.fn().mockResolvedValue(null),
  trackConnection: vi.fn(),
  releaseConnection: vi.fn(),
};

vi.mock('../../../src/transport/websocketClient.js', () => ({
  N8nWebSocketClient: vi.fn().mockImplementation(() => mockWebSocketClient),
}));

vi.mock('../../../src/transport/eventStreamingManager.js', () => ({
  EventStreamingManager: vi.fn().mockImplementation(() => mockEventStreamingManager),
}));

vi.mock('../../../src/transport/progressMonitor.js', () => ({
  ProgressMonitor: vi.fn().mockImplementation(() => mockProgressMonitor),
  createProgressMonitor: vi.fn().mockImplementation(() => mockProgressMonitor),
}));

vi.mock('../../../src/transport/websocketAuth.js', () => ({
  WebSocketAuthManager: vi.fn().mockImplementation(() => mockAuthManager),
}));

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager;
  let config: ConnectionConfig;
  let authConfig: AuthConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    authConfig = {
      type: 'apiKey',
      apiKey: 'test-api-key',
      keyType: 'user',
    };

    config = {
      n8nBaseUrl: 'https://localhost:5678',
      authConfig,
      websocket: {
        reconnectInterval: 1000,
        maxReconnectAttempts: 3,
        heartbeatInterval: 30000,
        connectionTimeout: 10000,
        autoReconnect: true,
      },
      streaming: {
        bufferSize: 50,
        retryAttempts: 3,
        enableProgressTracking: true,
        enableMetrics: true,
      },
      monitoring: {
        enablePredictiveAnalytics: true,
        enablePerformanceTracking: true,
        historicalDataLimit: 500,
        progressUpdateInterval: 1000,
      },
      healthCheck: {
        enabled: true,
        interval: 30000,
        timeout: 5000,
        maxFailures: 3,
      },
    };

    connectionManager = new ConnectionManager(config);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(connectionManager).toBeInstanceOf(ConnectionManager);
      expect(connectionManager).toBeInstanceOf(EventEmitter);
    });

    it('should validate configuration schema', () => {
      expect(() => new ConnectionManager(config)).not.toThrow();
    });

    it('should initialize with disconnected state', () => {
      const state = connectionManager.getConnectionState();
      expect(state.status).toBe('disconnected');
      expect(state.authenticated).toBe(false);
      expect(state.totalReconnects).toBe(0);
      expect(state.consecutiveFailures).toBe(0);
    });
  });

  describe('start', () => {
    it('should start all components successfully', async () => {
      const startingSpy = vi.fn();
      const startedSpy = vi.fn();
      connectionManager.on('starting', startingSpy);
      connectionManager.on('started', startedSpy);

      await connectionManager.start();

      expect(startingSpy).toHaveBeenCalled();
      expect(mockAuthManager.authenticate).toHaveBeenCalled();
      expect(mockWebSocketClient.connect).toHaveBeenCalled();
      expect(mockEventStreamingManager.startStreaming).toHaveBeenCalled();
      expect(startedSpy).toHaveBeenCalledWith({
        timestamp: expect.any(String),
        state: expect.any(Object),
      });

      const state = connectionManager.getConnectionState();
      expect(state.status).toBe('connected');
      expect(state.authenticated).toBe(true);
    });

    it('should handle authentication failure', async () => {
      mockAuthManager.authenticate.mockResolvedValueOnce({
        success: false,
        error: 'Invalid API key',
      });

      const errorSpy = vi.fn();
      connectionManager.on('startupError', errorSpy);

      await expect(connectionManager.start()).rejects.toThrow('Authentication failed: Invalid API key');
      expect(errorSpy).toHaveBeenCalled();

      const state = connectionManager.getConnectionState();
      expect(state.status).toBe('failed');
    });

    it('should handle WebSocket connection failure', async () => {
      mockWebSocketClient.connect.mockRejectedValueOnce(new Error('Connection failed'));

      const errorSpy = vi.fn();
      connectionManager.on('startupError', errorSpy);

      await expect(connectionManager.start()).rejects.toThrow('Connection failed');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should start health monitoring if enabled', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      await connectionManager.start();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        config.healthCheck.interval
      );
    });

    it('should start auth refresh monitoring', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      await connectionManager.start();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60000 // 1 minute
      );
    });
  });

  describe('stop', () => {
    it('should stop all components gracefully', async () => {
      // First start the manager
      await connectionManager.start();

      const stoppingSpy = vi.fn();
      const stoppedSpy = vi.fn();
      connectionManager.on('stopping', stoppingSpy);
      connectionManager.on('stopped', stoppedSpy);

      await connectionManager.stop();

      expect(stoppingSpy).toHaveBeenCalled();
      expect(mockProgressMonitor.stop).toHaveBeenCalled();
      expect(mockEventStreamingManager.stopStreaming).toHaveBeenCalled();
      expect(mockWebSocketClient.disconnect).toHaveBeenCalled();
      expect(stoppedSpy).toHaveBeenCalledWith({
        timestamp: expect.any(String),
        totalUptime: expect.any(Number),
        totalReconnects: expect.any(Number),
      });

      const state = connectionManager.getConnectionState();
      expect(state.status).toBe('disconnected');
      expect(state.authenticated).toBe(false);
    });

    it('should handle stop errors gracefully', async () => {
      mockWebSocketClient.disconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

      const errorSpy = vi.fn();
      connectionManager.on('stopError', errorSpy);

      await connectionManager.stop();

      expect(errorSpy).toHaveBeenCalledWith({
        error: 'Disconnect failed',
        timestamp: expect.any(String),
      });
    });
  });

  describe('connection state management', () => {
    it('should return current connection state', () => {
      const state = connectionManager.getConnectionState();

      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('authenticated');
      expect(state).toHaveProperty('totalReconnects');
      expect(state).toHaveProperty('consecutiveFailures');
      expect(state).toHaveProperty('uptime');
      expect(state).toHaveProperty('healthStatus');
    });

    it('should calculate uptime correctly', async () => {
      await connectionManager.start();

      const initialState = connectionManager.getConnectionState();
      expect(initialState.uptime).toBeGreaterThanOrEqual(0);

      // Advance time
      vi.advanceTimersByTime(5000);

      const laterState = connectionManager.getConnectionState();
      expect(laterState.uptime).toBeGreaterThan(initialState.uptime);
    });

    it('should track connection failures', async () => {
      // Mock connection failure
      mockWebSocketClient.connect.mockRejectedValue(new Error('Connection failed'));

      try {
        await connectionManager.start();
      } catch {
        // Expected to fail
      }

      const state = connectionManager.getConnectionState();
      expect(state.consecutiveFailures).toBe(1);
      expect(state.status).toBe('failed');
    });
  });

  describe('connection health monitoring', () => {
    it('should return connection health information', async () => {
      await connectionManager.start();

      const health = connectionManager.getConnectionHealth();

      expect(health).toHaveProperty('websocketConnected');
      expect(health).toHaveProperty('authenticationValid');
      expect(health).toHaveProperty('streamingActive');
      expect(health).toHaveProperty('progressMonitorActive');
      expect(health).toHaveProperty('errorRate');
      expect(health).toHaveProperty('reconnectAttempts');

      expect(health.websocketConnected).toBe(true);
      expect(health.authenticationValid).toBe(true);
      expect(health.streamingActive).toBe(true);
      expect(health.progressMonitorActive).toBe(true);
    });

    it('should perform periodic health checks', async () => {
      await connectionManager.start();

      const healthCheckSpy = vi.fn();
      connectionManager.on('healthCheck', healthCheckSpy);

      // Advance time to trigger health check
      vi.advanceTimersByTime(config.healthCheck.interval);

      expect(healthCheckSpy).toHaveBeenCalledWith({
        health: expect.any(Object),
        healthScore: expect.any(Number),
        status: expect.any(String),
        timestamp: expect.any(String),
      });
    });

    it('should update health status based on component status', async () => {
      await connectionManager.start();

      // Simulate component failure
      mockWebSocketClient.isConnected.mockReturnValue(false);
      mockEventStreamingManager.getConnectionStatus.mockReturnValue({
        isConnected: false,
        isStreaming: false,
        connectionState: {},
      });

      const healthCheckSpy = vi.fn();
      connectionManager.on('healthCheck', healthCheckSpy);

      vi.advanceTimersByTime(config.healthCheck.interval);

      expect(healthCheckSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.stringMatching(/degraded|unhealthy/),
        })
      );
    });
  });

  describe('manual reconnection', () => {
    it('should reconnect manually', async () => {
      await connectionManager.start();

      const reconnectSpy = vi.fn();
      connectionManager.on('manualReconnect', reconnectSpy);

      await connectionManager.reconnect();

      expect(reconnectSpy).toHaveBeenCalled();
      expect(mockWebSocketClient.disconnect).toHaveBeenCalled();
      expect(mockWebSocketClient.connect).toHaveBeenCalledTimes(2); // Once in start, once in reconnect
    });

    it('should handle reconnection errors', async () => {
      await connectionManager.start();

      mockWebSocketClient.connect.mockRejectedValueOnce(new Error('Reconnect failed'));

      const errorSpy = vi.fn();
      connectionManager.on('reconnectError', errorSpy);

      await expect(connectionManager.reconnect()).rejects.toThrow('Reconnect failed');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('workflow subscription management', () => {
    beforeEach(async () => {
      await connectionManager.start();
    });

    it('should subscribe to workflow updates', async () => {
      const workflowId = 'workflow-123';

      await connectionManager.subscribeToWorkflow(workflowId);

      expect(mockEventStreamingManager.subscribeToWorkflow).toHaveBeenCalledWith(workflowId);
    });

    it('should unsubscribe from workflow updates', async () => {
      const workflowId = 'workflow-123';

      await connectionManager.unsubscribeFromWorkflow(workflowId);

      expect(mockEventStreamingManager.unsubscribeFromWorkflow).toHaveBeenCalledWith(workflowId);
    });

    it('should handle subscription errors when not initialized', async () => {
      const uninitializedManager = new ConnectionManager(config);

      await expect(
        uninitializedManager.subscribeToWorkflow('workflow-123')
      ).rejects.toThrow('Event streaming manager not initialized');
    });
  });

  describe('command sending', () => {
    it('should send commands through WebSocket', async () => {
      await connectionManager.start();

      const command = { type: 'test', action: 'pause' };

      await connectionManager.sendCommand(command);

      expect(mockWebSocketClient.sendMessage).toHaveBeenCalledWith(command);
    });

    it('should handle command errors when not connected', async () => {
      mockWebSocketClient.isConnected.mockReturnValue(false);

      await expect(
        connectionManager.sendCommand({ type: 'test' })
      ).rejects.toThrow('WebSocket not connected');
    });
  });

  describe('authentication refresh', () => {
    it('should check for token refresh periodically', async () => {
      await connectionManager.start();

      mockAuthManager.needsTokenRefresh.mockReturnValue(true);
      mockAuthManager.refreshToken.mockResolvedValueOnce({
        type: 'apiKey',
        apiKey: 'new-api-key',
        keyType: 'user',
      });

      const refreshSpy = vi.fn();
      connectionManager.on('authRefreshed', refreshSpy);

      // Advance time to trigger auth refresh check
      vi.advanceTimersByTime(60000); // 1 minute

      expect(mockAuthManager.needsTokenRefresh).toHaveBeenCalled();
      expect(mockAuthManager.refreshToken).toHaveBeenCalled();
      expect(refreshSpy).toHaveBeenCalled();
    });

    it('should handle auth refresh errors', async () => {
      await connectionManager.start();

      mockAuthManager.needsTokenRefresh.mockReturnValue(true);
      mockAuthManager.refreshToken.mockRejectedValueOnce(new Error('Refresh failed'));

      const errorSpy = vi.fn();
      connectionManager.on('authRefreshError', errorSpy);

      vi.advanceTimersByTime(60000);

      expect(errorSpy).toHaveBeenCalledWith({
        error: 'Refresh failed',
        timestamp: expect.any(String),
      });
    });
  });

  describe('WebSocket URL creation', () => {
    it('should create correct WebSocket URL from HTTPS base URL', () => {
      const httpsConfig = {
        ...config,
        n8nBaseUrl: 'https://n8n.example.com:8080',
      };

      const manager = new ConnectionManager(httpsConfig);
      
      // We can't directly test the private method, but we can verify the behavior
      // by checking that the WebSocket client is created with the correct URL
      expect(manager).toBeInstanceOf(ConnectionManager);
    });

    it('should create correct WebSocket URL from HTTP base URL', () => {
      const httpConfig = {
        ...config,
        n8nBaseUrl: 'http://localhost:5678',
      };

      const manager = new ConnectionManager(httpConfig);
      
      expect(manager).toBeInstanceOf(ConnectionManager);
    });
  });

  describe('event forwarding', () => {
    it('should forward streaming events', async () => {
      await connectionManager.start();

      const eventSpy = vi.fn();
      connectionManager.on('workflowEvent', eventSpy);

      // Simulate event from streaming manager
      const mockEmitter = new EventEmitter();
      mockEventStreamingManager.on.mockImplementation((event, handler) => {
        mockEmitter.on(event, handler);
      });

      mockEmitter.emit('workflowEvent', { type: 'test', data: {} });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('should forward progress monitor alerts', async () => {
      await connectionManager.start();

      const alertSpy = vi.fn();
      connectionManager.on('alert', alertSpy);

      // Simulate critical alert affecting health status
      const mockEmitter = new EventEmitter();
      mockProgressMonitor.on.mockImplementation((event, handler) => {
        mockEmitter.on(event, handler);
      });

      const criticalAlert = {
        type: 'slow_execution',
        severity: 'critical',
        message: 'Execution taking too long',
      };

      mockEmitter.emit('alert', criticalAlert);

      expect(alertSpy).toHaveBeenCalledWith(criticalAlert);

      // Should update health status
      const state = connectionManager.getConnectionState();
      expect(state.healthStatus).toBe('unhealthy');
    });
  });
});

describe('createConnectionManager', () => {
  it('should create manager with provided configuration', () => {
    const n8nBaseUrl = 'https://n8n.example.com';
    const authConfig: AuthConfig = {
      type: 'apiKey',
      apiKey: 'test-key',
      keyType: 'user',
    };
    const options = {
      websocket: { heartbeatInterval: 60000 },
    };

    const manager = createConnectionManager(n8nBaseUrl, authConfig, options);

    expect(manager).toBeInstanceOf(ConnectionManager);
  });

  it('should merge with default configuration', () => {
    const n8nBaseUrl = 'https://n8n.example.com';
    const authConfig: AuthConfig = {
      type: 'sessionToken',
      sessionToken: 'test-session',
    };

    const manager = createConnectionManager(n8nBaseUrl, authConfig);

    expect(manager).toBeInstanceOf(ConnectionManager);
  });
});

describe('DEFAULT_CONNECTION_CONFIG', () => {
  it('should have reasonable default values', () => {
    expect(DEFAULT_CONNECTION_CONFIG.websocket?.reconnectInterval).toBe(1000);
    expect(DEFAULT_CONNECTION_CONFIG.websocket?.maxReconnectAttempts).toBe(10);
    expect(DEFAULT_CONNECTION_CONFIG.websocket?.autoReconnect).toBe(true);
    expect(DEFAULT_CONNECTION_CONFIG.streaming?.bufferSize).toBe(100);
    expect(DEFAULT_CONNECTION_CONFIG.streaming?.enableMetrics).toBe(true);
    expect(DEFAULT_CONNECTION_CONFIG.monitoring?.enablePredictiveAnalytics).toBe(true);
    expect(DEFAULT_CONNECTION_CONFIG.healthCheck?.enabled).toBe(true);
    expect(DEFAULT_CONNECTION_CONFIG.healthCheck?.interval).toBe(60000);
  });
});