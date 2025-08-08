/**
 * Unit Tests for WebSocket Client
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { EventEmitter } from 'events';
import { 
  N8nWebSocketClient, 
  WebSocketConfig, 
  WorkflowExecutionEvent, 
  createWebSocketClient,
  DEFAULT_WEBSOCKET_CONFIG,
} from '../../../src/transport/websocketClient.js';

// Mock WebSocket
const mockWebSocket = vi.hoisted(() => ({
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
  prototype: {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    ping: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

vi.mock('ws', () => ({
  default: vi.fn().mockImplementation(() => {
    const instance = Object.create(mockWebSocket.prototype);
    Object.assign(instance, mockWebSocket.prototype);
    instance.readyState = mockWebSocket.CONNECTING;
    return instance;
  }),
  ...mockWebSocket,
}));

describe('N8nWebSocketClient', () => {
  let client: N8nWebSocketClient;
  let config: WebSocketConfig;
  let mockWs: any;

  beforeEach(() => {
    config = {
      url: 'ws://localhost:5678/rest/push',
      reconnectInterval: 1000,
      maxReconnectAttempts: 3,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
    };

    client = new N8nWebSocketClient(config);
    
    // Get the mocked WebSocket instance
    const WebSocket = vi.mocked(await import('ws')).default;
    mockWs = new WebSocket();
    
    // Setup default mock behaviors
    mockWs.readyState = mockWebSocket.OPEN;
    mockWs.send = vi.fn((data, callback) => callback && callback());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(client).toBeInstanceOf(N8nWebSocketClient);
      expect(client).toBeInstanceOf(EventEmitter);
    });

    it('should set initial connection state', () => {
      const state = client.getConnectionState();
      expect(state.connected).toBe(false);
      expect(state.reconnectAttempts).toBe(0);
    });
  });

  describe('connect', () => {
    it('should establish WebSocket connection successfully', async () => {
      const connectPromise = client.connect();
      
      // Simulate successful connection
      const onHandlers: Record<string, Function> = {};
      mockWs.on = vi.fn((event: string, handler: Function) => {
        onHandlers[event] = handler;
      });
      
      // Trigger open event
      setTimeout(() => {
        onHandlers['open']?.();
      }, 10);
      
      await connectPromise;
      
      expect(client.isConnected()).toBe(true);
      const state = client.getConnectionState();
      expect(state.connected).toBe(true);
      expect(state.connectionTime).toBeInstanceOf(Date);
    });

    it('should handle connection timeout', async () => {
      const shortTimeoutConfig = { ...config, connectionTimeout: 100 };
      const timeoutClient = new N8nWebSocketClient(shortTimeoutConfig);
      
      await expect(timeoutClient.connect()).rejects.toThrow('WebSocket connection timeout');
    });

    it('should set authentication headers', async () => {
      const authConfig = {
        ...config,
        apiKey: 'test-api-key',
        sessionToken: 'test-session-token',
      };
      
      const authClient = new N8nWebSocketClient(authConfig);
      
      const connectPromise = authClient.connect();
      
      // Check WebSocket constructor was called with proper headers
      const WebSocket = vi.mocked(await import('ws')).default;
      expect(WebSocket).toHaveBeenCalledWith(
        config.url,
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'n8n-mcp-server/2.0.0',
            'X-N8N-API-KEY': 'test-api-key',
            'Cookie': 'n8n-auth=test-session-token',
          }),
        })
      );
      
      // Simulate successful connection to resolve promise
      const onHandlers: Record<string, Function> = {};
      mockWs.on = vi.fn((event: string, handler: Function) => {
        onHandlers[event] = handler;
      });
      
      setTimeout(() => onHandlers['open']?.(), 10);
      
      await connectPromise;
    });

    it('should not connect if already connected', async () => {
      // Mock already connected state
      mockWs.readyState = mockWebSocket.OPEN;
      
      // Simulate connected state
      const state = client.getConnectionState();
      (state as any).connected = true;
      
      await client.connect();
      
      // Should not create a new WebSocket instance
      const WebSocket = vi.mocked(await import('ws')).default;
      expect(WebSocket).toHaveBeenCalledTimes(1); // Only from beforeEach
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket connection cleanly', async () => {
      // First connect
      await client.connect();
      
      // Then disconnect
      await client.disconnect();
      
      expect(mockWs.close).toHaveBeenCalledWith(1000, 'Client disconnect');
      expect(client.isConnected()).toBe(false);
    });

    it('should terminate connection if not open', async () => {
      mockWs.readyState = mockWebSocket.CONNECTING;
      
      await client.disconnect();
      
      expect(mockWs.terminate).toHaveBeenCalled();
    });

    it('should clear all timers on disconnect', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      await client.disconnect();
      
      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      await client.connect();
      mockWs.readyState = mockWebSocket.OPEN;
    });

    it('should send JSON message successfully', async () => {
      const message = { type: 'test', data: { value: 123 } };
      
      await client.sendMessage(message);
      
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify(message),
        expect.any(Function)
      );
    });

    it('should reject if WebSocket not connected', async () => {
      mockWs.readyState = mockWebSocket.CLOSED;
      
      await expect(client.sendMessage({ type: 'test' }))
        .rejects.toThrow('WebSocket not connected');
    });

    it('should handle send errors', async () => {
      mockWs.send = vi.fn((data, callback) => {
        callback(new Error('Send failed'));
      });
      
      await expect(client.sendMessage({ type: 'test' }))
        .rejects.toThrow('Send failed');
    });
  });

  describe('subscription methods', () => {
    beforeEach(async () => {
      await client.connect();
      mockWs.readyState = mockWebSocket.OPEN;
    });

    it('should subscribe to workflow', async () => {
      await client.subscribeToWorkflow('workflow-123');
      
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscribe',
          resource: 'workflow',
          id: 'workflow-123',
        }),
        expect.any(Function)
      );
    });

    it('should unsubscribe from workflow', async () => {
      await client.unsubscribeFromWorkflow('workflow-123');
      
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'unsubscribe',
          resource: 'workflow',
          id: 'workflow-123',
        }),
        expect.any(Function)
      );
    });

    it('should subscribe to all executions', async () => {
      await client.subscribeToExecutions();
      
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscribe',
          resource: 'executions',
        }),
        expect.any(Function)
      );
    });
  });

  describe('message handling', () => {
    let messageHandler: Function;

    beforeEach(async () => {
      const onHandlers: Record<string, Function> = {};
      mockWs.on = vi.fn((event: string, handler: Function) => {
        onHandlers[event] = handler;
      });
      
      await client.connect();
      messageHandler = onHandlers['message'];
    });

    it('should handle valid workflow execution event', (done) => {
      const workflowEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionStarted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'running',
        },
      };

      client.on('workflowEvent', (event) => {
        expect(event).toEqual(workflowEvent);
        done();
      });

      messageHandler(Buffer.from(JSON.stringify(workflowEvent)));
    });

    it('should handle heartbeat message', (done) => {
      const heartbeatMessage = {
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
      };

      client.on('heartbeat', (heartbeat) => {
        expect(heartbeat).toEqual(heartbeatMessage);
        done();
      });

      messageHandler(Buffer.from(JSON.stringify(heartbeatMessage)));
    });

    it('should handle invalid JSON gracefully', (done) => {
      client.on('messageError', (error) => {
        expect(error).toBeInstanceOf(Error);
        done();
      });

      messageHandler(Buffer.from('invalid json'));
    });

    it('should handle unknown message types', (done) => {
      const unknownMessage = {
        type: 'unknown',
        data: { test: true },
      };

      client.on('unknownMessage', (message) => {
        expect(message).toEqual(unknownMessage);
        done();
      });

      messageHandler(Buffer.from(JSON.stringify(unknownMessage)));
    });
  });

  describe('reconnection logic', () => {
    it('should attempt reconnection on unexpected disconnect', (done) => {
      const onHandlers: Record<string, Function> = {};
      mockWs.on = vi.fn((event: string, handler: Function) => {
        onHandlers[event] = handler;
      });

      client.on('reconnecting', (data) => {
        expect(data.attempt).toBe(1);
        expect(data.delay).toBeGreaterThan(0);
        done();
      });

      // Simulate unexpected disconnect (code !== 1000)
      onHandlers['close']?.(1006, Buffer.from('Connection lost'));
    });

    it('should not reconnect on clean disconnect', () => {
      const reconnectSpy = vi.fn();
      client.on('reconnecting', reconnectSpy);

      const onHandlers: Record<string, Function> = {};
      mockWs.on = vi.fn((event: string, handler: Function) => {
        onHandlers[event] = handler;
      });

      // Simulate clean disconnect (code === 1000)
      onHandlers['close']?.(1000, Buffer.from('Normal closure'));

      setTimeout(() => {
        expect(reconnectSpy).not.toHaveBeenCalled();
      }, 100);
    });

    it('should stop reconnecting after max attempts', (done) => {
      client.on('maxReconnectAttemptsReached', () => {
        done();
      });

      // Simulate max attempts reached
      const state = client.getConnectionState();
      (state as any).reconnectAttempts = config.maxReconnectAttempts;

      const onHandlers: Record<string, Function> = {};
      mockWs.on = vi.fn((event: string, handler: Function) => {
        onHandlers[event] = handler;
      });

      onHandlers['close']?.(1006, Buffer.from('Connection lost'));
    });
  });

  describe('heartbeat mechanism', () => {
    it('should send ping on heartbeat interval', (done) => {
      vi.useFakeTimers();
      
      client.on('heartbeat', (heartbeat) => {
        if (heartbeat.type === 'ping') {
          expect(mockWs.ping).toHaveBeenCalled();
          done();
        }
      });

      // Connect to start heartbeat
      client.connect();

      // Fast forward time to trigger heartbeat
      vi.advanceTimersByTime(config.heartbeatInterval);
      
      vi.useRealTimers();
    });

    it('should handle pong response', (done) => {
      const onHandlers: Record<string, Function> = {};
      mockWs.on = vi.fn((event: string, handler: Function) => {
        onHandlers[event] = handler;
      });

      client.on('heartbeat', (heartbeat) => {
        if (heartbeat.type === 'pong') {
          expect(heartbeat.timestamp).toBeDefined();
          done();
        }
      });

      // Simulate pong event
      onHandlers['pong']?.();
    });
  });

  describe('connection state', () => {
    it('should return correct connection state', () => {
      const state = client.getConnectionState();
      
      expect(state).toHaveProperty('connected');
      expect(state).toHaveProperty('reconnectAttempts');
      expect(state).toHaveProperty('lastHeartbeat');
      expect(state).toHaveProperty('lastMessage');
      expect(state).toHaveProperty('connectionTime');
    });

    it('should update connection state on connect', async () => {
      await client.connect();
      
      const state = client.getConnectionState();
      expect(state.connected).toBe(true);
      expect(state.connectionTime).toBeInstanceOf(Date);
      expect(state.reconnectAttempts).toBe(0);
    });
  });
});

describe('createWebSocketClient', () => {
  it('should create client with provided configuration', () => {
    const url = 'ws://test.com/ws';
    const options = { heartbeatInterval: 60000 };
    
    const client = createWebSocketClient(url, options);
    
    expect(client).toBeInstanceOf(N8nWebSocketClient);
  });

  it('should merge with default configuration', () => {
    const url = 'ws://test.com/ws';
    
    const client = createWebSocketClient(url);
    
    expect(client).toBeInstanceOf(N8nWebSocketClient);
  });
});

describe('DEFAULT_WEBSOCKET_CONFIG', () => {
  it('should have reasonable default values', () => {
    expect(DEFAULT_WEBSOCKET_CONFIG.reconnectInterval).toBe(1000);
    expect(DEFAULT_WEBSOCKET_CONFIG.maxReconnectAttempts).toBe(10);
    expect(DEFAULT_WEBSOCKET_CONFIG.heartbeatInterval).toBe(30000);
    expect(DEFAULT_WEBSOCKET_CONFIG.connectionTimeout).toBe(10000);
  });
});