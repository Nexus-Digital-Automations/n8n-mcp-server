/**
 * Unit Tests for Event Streaming Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  EventStreamingManager,
  EventStreamingConfig,
  WorkflowExecutionStatus,
  NodeExecutionUpdate,
  createEventStreamingManager,
  DEFAULT_STREAMING_CONFIG,
} from '../../../src/transport/eventStreamingManager.js';
import { N8nWebSocketClient, WorkflowExecutionEvent } from '../../../src/transport/websocketClient.js';

// Mock WebSocket Client
const mockWebSocketClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  subscribeToWorkflow: vi.fn().mockResolvedValue(undefined),
  unsubscribeFromWorkflow: vi.fn().mockResolvedValue(undefined),
  subscribeToExecutions: vi.fn().mockResolvedValue(undefined),
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
  removeAllListeners: vi.fn(),
};

vi.mock('../../../src/transport/websocketClient.js', () => ({
  N8nWebSocketClient: vi.fn().mockImplementation(() => mockWebSocketClient),
}));

describe('EventStreamingManager', () => {
  let eventStreamingManager: EventStreamingManager;
  let config: EventStreamingConfig;
  let mockEventEmitter: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    
    config = {
      wsConfig: {
        url: 'ws://localhost:5678/rest/push',
        reconnectInterval: 1000,
        maxReconnectAttempts: 3,
        heartbeatInterval: 30000,
        connectionTimeout: 10000,
      },
      bufferSize: 50,
      retryAttempts: 3,
      enableProgressTracking: true,
      enableMetrics: true,
      eventFilters: ['workflowExecutionStarted', 'workflowExecutionCompleted'],
    };

    eventStreamingManager = new EventStreamingManager(config);
    
    // Create a mock event emitter to simulate WebSocket events
    mockEventEmitter = new EventEmitter();
    
    // Setup WebSocket client mock to use our event emitter
    mockWebSocketClient.on.mockImplementation((event: string, handler: Function) => {
      mockEventEmitter.on(event, handler);
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(eventStreamingManager).toBeInstanceOf(EventStreamingManager);
      expect(eventStreamingManager).toBeInstanceOf(EventEmitter);
    });

    it('should create WebSocket client with config', () => {
      expect(N8nWebSocketClient).toHaveBeenCalledWith(config.wsConfig);
    });

    it('should initialize metrics', () => {
      const metrics = eventStreamingManager.getMetrics();
      expect(metrics.totalExecutions).toBe(0);
      expect(metrics.successfulExecutions).toBe(0);
      expect(metrics.failedExecutions).toBe(0);
      expect(metrics.currentActiveExecutions).toBe(0);
    });
  });

  describe('startStreaming', () => {
    it('should connect WebSocket and subscribe to executions', async () => {
      const streamingStartedSpy = vi.fn();
      eventStreamingManager.on('streamingStarted', streamingStartedSpy);

      await eventStreamingManager.startStreaming();

      expect(mockWebSocketClient.connect).toHaveBeenCalled();
      expect(mockWebSocketClient.subscribeToExecutions).toHaveBeenCalled();
      expect(streamingStartedSpy).toHaveBeenCalledWith({
        timestamp: expect.any(String),
        config,
      });
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockWebSocketClient.connect.mockRejectedValueOnce(error);
      
      const errorSpy = vi.fn();
      eventStreamingManager.on('streamingError', errorSpy);

      await expect(eventStreamingManager.startStreaming()).rejects.toThrow('Connection failed');
      expect(errorSpy).toHaveBeenCalledWith({
        error: 'Connection failed',
        timestamp: expect.any(String),
      });
    });
  });

  describe('stopStreaming', () => {
    it('should disconnect WebSocket and emit stop event', async () => {
      const streamingStoppedSpy = vi.fn();
      eventStreamingManager.on('streamingStopped', streamingStoppedSpy);

      await eventStreamingManager.stopStreaming();

      expect(mockWebSocketClient.disconnect).toHaveBeenCalled();
      expect(streamingStoppedSpy).toHaveBeenCalledWith({
        timestamp: expect.any(String),
        metrics: expect.any(Object),
      });
    });
  });

  describe('workflow subscription', () => {
    it('should subscribe to specific workflow', async () => {
      const workflowId = 'workflow-123';
      const subscribedSpy = vi.fn();
      eventStreamingManager.on('workflowSubscribed', subscribedSpy);

      await eventStreamingManager.subscribeToWorkflow(workflowId);

      expect(mockWebSocketClient.subscribeToWorkflow).toHaveBeenCalledWith(workflowId);
      expect(subscribedSpy).toHaveBeenCalledWith({
        workflowId,
        timestamp: expect.any(String),
      });
    });

    it('should unsubscribe from specific workflow', async () => {
      const workflowId = 'workflow-123';
      const unsubscribedSpy = vi.fn();
      eventStreamingManager.on('workflowUnsubscribed', unsubscribedSpy);

      await eventStreamingManager.unsubscribeFromWorkflow(workflowId);

      expect(mockWebSocketClient.unsubscribeFromWorkflow).toHaveBeenCalledWith(workflowId);
      expect(unsubscribedSpy).toHaveBeenCalledWith({
        workflowId,
        timestamp: expect.any(String),
      });
    });
  });

  describe('execution tracking', () => {
    it('should track active executions', () => {
      expect(eventStreamingManager.getActiveExecutions()).toEqual([]);
      
      // Simulate execution started
      const executionEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionStarted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'running',
        },
      };

      mockEventEmitter.emit('workflowEvent', executionEvent);

      const activeExecutions = eventStreamingManager.getActiveExecutions();
      expect(activeExecutions).toHaveLength(1);
      expect(activeExecutions[0].executionId).toBe('exec-123');
      expect(activeExecutions[0].status).toBe('running');
    });

    it('should get specific execution status', () => {
      // Simulate execution started
      const executionEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionStarted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'running',
        },
      };

      mockEventEmitter.emit('workflowEvent', executionEvent);

      const status = eventStreamingManager.getExecutionStatus('exec-123');
      expect(status).toBeDefined();
      expect(status?.executionId).toBe('exec-123');
      expect(status?.status).toBe('running');

      const nonExistent = eventStreamingManager.getExecutionStatus('nonexistent');
      expect(nonExistent).toBeNull();
    });

    it('should track execution history', () => {
      // Start execution
      const startEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionStarted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'running',
        },
      };

      mockEventEmitter.emit('workflowEvent', startEvent);

      // Complete execution
      const completeEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionCompleted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'success',
        },
      };

      mockEventEmitter.emit('workflowEvent', completeEvent);

      const history = eventStreamingManager.getExecutionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].executionId).toBe('exec-123');
      expect(history[0].status).toBe('success');

      // Should no longer be active
      expect(eventStreamingManager.getActiveExecutions()).toHaveLength(0);
    });

    it('should limit execution history', () => {
      const limitedConfig = { ...config, bufferSize: 2 };
      const limitedManager = new EventStreamingManager(limitedConfig);

      // Simulate multiple executions
      for (let i = 0; i < 5; i++) {
        const startEvent: WorkflowExecutionEvent = {
          type: 'workflowExecutionStarted',
          data: {
            executionId: `exec-${i}`,
            workflowId: 'workflow-456',
            timestamp: new Date().toISOString(),
            status: 'running',
          },
        };

        const completeEvent: WorkflowExecutionEvent = {
          type: 'workflowExecutionCompleted',
          data: {
            executionId: `exec-${i}`,
            workflowId: 'workflow-456',
            timestamp: new Date().toISOString(),
            status: 'success',
          },
        };

        // Emit events to the limited manager's WebSocket client mock
        const limitedMockEmitter = new EventEmitter();
        limitedManager['wsClient'].on = vi.fn((event: string, handler: Function) => {
          limitedMockEmitter.on(event, handler);
        });

        limitedMockEmitter.emit('workflowEvent', startEvent);
        limitedMockEmitter.emit('workflowEvent', completeEvent);
      }

      // Should only keep the last 500 (default trim size)
      const history = limitedManager.getExecutionHistory();
      expect(history.length).toBeLessThanOrEqual(500);
    });
  });

  describe('workflow event handling', () => {
    it('should handle workflow execution started event', (done) => {
      const executionStartedSpy = vi.fn((data) => {
        expect(data.execution.executionId).toBe('exec-123');
        expect(data.execution.status).toBe('running');
        expect(data.execution.progress).toBe(0);
        done();
      });

      eventStreamingManager.on('executionStarted', executionStartedSpy);

      const event: WorkflowExecutionEvent = {
        type: 'workflowExecutionStarted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'running',
        },
      };

      mockEventEmitter.emit('workflowEvent', event);
    });

    it('should handle workflow execution completed event', (done) => {
      // First start an execution
      const startEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionStarted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'running',
        },
      };

      mockEventEmitter.emit('workflowEvent', startEvent);

      // Then complete it
      const executionCompletedSpy = vi.fn((data) => {
        expect(data.execution.executionId).toBe('exec-123');
        expect(data.execution.status).toBe('success');
        expect(data.execution.progress).toBe(100);
        done();
      });

      eventStreamingManager.on('executionCompleted', executionCompletedSpy);

      const completeEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionCompleted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'success',
        },
      };

      mockEventEmitter.emit('workflowEvent', completeEvent);
    });

    it('should handle node execution events', (done) => {
      let eventCount = 0;

      const nodeStartedSpy = vi.fn((data) => {
        expect(data.nodeUpdate.executionId).toBe('exec-123');
        expect(data.nodeUpdate.nodeName).toBe('HTTP Request');
        expect(data.nodeUpdate.status).toBe('running');
        eventCount++;
        if (eventCount === 2) done();
      });

      const nodeCompletedSpy = vi.fn((data) => {
        expect(data.nodeUpdate.executionId).toBe('exec-123');
        expect(data.nodeUpdate.nodeName).toBe('HTTP Request');
        expect(data.nodeUpdate.status).toBe('success');
        eventCount++;
        if (eventCount === 2) done();
      });

      eventStreamingManager.on('nodeExecutionStarted', nodeStartedSpy);
      eventStreamingManager.on('nodeExecutionCompleted', nodeCompletedSpy);

      // First start execution
      const startEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionStarted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'running',
        },
      };

      mockEventEmitter.emit('workflowEvent', startEvent);

      // Node started
      const nodeStartEvent: WorkflowExecutionEvent = {
        type: 'nodeExecutionStarted',
        data: {
          executionId: 'exec-123',
          nodeId: 'node-789',
          nodeName: 'HTTP Request',
          timestamp: new Date().toISOString(),
        },
      };

      mockEventEmitter.emit('workflowEvent', nodeStartEvent);

      // Node completed
      const nodeCompleteEvent: WorkflowExecutionEvent = {
        type: 'nodeExecutionCompleted',
        data: {
          executionId: 'exec-123',
          nodeId: 'node-789',
          nodeName: 'HTTP Request',
          timestamp: new Date().toISOString(),
          status: 'success',
        },
      };

      mockEventEmitter.emit('workflowEvent', nodeCompleteEvent);
    });

    it('should handle invalid events gracefully', (done) => {
      const errorSpy = vi.fn((data) => {
        expect(data.event).toBeDefined();
        expect(data.error).toContain('validation');
        done();
      });

      eventStreamingManager.on('eventProcessingError', errorSpy);

      // Send invalid event
      const invalidEvent = {
        type: 'invalidType',
        data: 'invalid data',
      };

      mockEventEmitter.emit('workflowEvent', invalidEvent);
    });
  });

  describe('metrics tracking', () => {
    it('should update metrics on execution events', () => {
      // Start execution
      const startEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionStarted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'running',
        },
      };

      mockEventEmitter.emit('workflowEvent', startEvent);

      let metrics = eventStreamingManager.getMetrics();
      expect(metrics.totalExecutions).toBe(1);
      expect(metrics.currentActiveExecutions).toBe(1);

      // Complete successfully
      const completeEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionCompleted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'success',
        },
      };

      mockEventEmitter.emit('workflowEvent', completeEvent);

      metrics = eventStreamingManager.getMetrics();
      expect(metrics.successfulExecutions).toBe(1);
      expect(metrics.failedExecutions).toBe(0);
      expect(metrics.currentActiveExecutions).toBe(0);
    });

    it('should track node execution counts', () => {
      // Start execution
      const startEvent: WorkflowExecutionEvent = {
        type: 'workflowExecutionStarted',
        data: {
          executionId: 'exec-123',
          workflowId: 'workflow-456',
          timestamp: new Date().toISOString(),
          status: 'running',
        },
      };

      mockEventEmitter.emit('workflowEvent', startEvent);

      // Node execution
      const nodeEvent: WorkflowExecutionEvent = {
        type: 'nodeExecutionStarted',
        data: {
          executionId: 'exec-123',
          nodeId: 'node-789',
          nodeName: 'HTTP Request',
          timestamp: new Date().toISOString(),
        },
      };

      mockEventEmitter.emit('workflowEvent', nodeEvent);

      const metrics = eventStreamingManager.getMetrics();
      expect(metrics.nodeExecutionCounts['HTTP Request']).toBe(1);
    });
  });

  describe('connection status', () => {
    it('should return connection status', () => {
      const status = eventStreamingManager.getConnectionStatus();
      
      expect(status).toHaveProperty('isConnected');
      expect(status).toHaveProperty('isStreaming');
      expect(status).toHaveProperty('connectionState');
      
      expect(status.isConnected).toBe(true);
      expect(status.isStreaming).toBe(false); // Not started yet
    });
  });

  describe('sendCommand', () => {
    it('should send command through WebSocket client', async () => {
      const command = { type: 'test', action: 'pause' };
      
      await eventStreamingManager.sendCommand(command);
      
      expect(mockWebSocketClient.sendMessage).toHaveBeenCalledWith(command);
    });
  });
});

describe('createEventStreamingManager', () => {
  it('should create manager with provided configuration', () => {
    const wsConfig = {
      url: 'ws://test.com/ws',
      reconnectInterval: 1000,
      maxReconnectAttempts: 3,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
    };
    const options = { bufferSize: 200 };
    
    const manager = createEventStreamingManager(wsConfig, options);
    
    expect(manager).toBeInstanceOf(EventStreamingManager);
  });

  it('should merge with default configuration', () => {
    const wsConfig = {
      url: 'ws://test.com/ws',
      reconnectInterval: 1000,
      maxReconnectAttempts: 3,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
    };
    
    const manager = createEventStreamingManager(wsConfig);
    
    expect(manager).toBeInstanceOf(EventStreamingManager);
  });
});

describe('DEFAULT_STREAMING_CONFIG', () => {
  it('should have reasonable default values', () => {
    expect(DEFAULT_STREAMING_CONFIG.bufferSize).toBe(100);
    expect(DEFAULT_STREAMING_CONFIG.retryAttempts).toBe(5);
    expect(DEFAULT_STREAMING_CONFIG.enableProgressTracking).toBe(true);
    expect(DEFAULT_STREAMING_CONFIG.enableMetrics).toBe(true);
  });
});