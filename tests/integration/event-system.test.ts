import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { N8nClient } from '../../src/client/n8nClient';
import { EventClient, EventStreamConfig } from '../../src/client/eventClient';

describe('Event System Integration', () => {
  let mockClient: jest.Mocked<N8nClient>;
  let eventClient: EventClient;

  const mockConfig: EventStreamConfig = {
    baseUrl: 'http://localhost:5678',
    apiKey: 'test-api-key',
    reconnectInterval: 1000,
    maxReconnectAttempts: 3,
    enableHeartbeat: false, // Disable for testing
  };

  const mockWorkflowsResponse = {
    data: [
      {
        id: 'wf_1',
        name: 'Test Workflow',
        active: true,
        nodes: [],
        connections: {},
      },
    ],
  };

  const mockExecutionsResponse = {
    data: [
      {
        id: 'exec_1',
        workflowId: 'wf_1',
        finished: true,
        startedAt: '2023-01-01T12:00:00Z',
        stoppedAt: null,
      },
      {
        id: 'exec_2',
        workflowId: 'wf_1',
        finished: true,
        startedAt: '2023-01-01T12:05:00Z',
        stoppedAt: '2023-01-01T12:05:30Z',
      },
    ],
  };

  beforeEach(() => {
    // Mock the N8nClient
    mockClient = {
      getWorkflows: jest.fn(),
      getExecutions: jest.fn(),
      getWorkflow: jest.fn(),
    } as any;

    // Setup default mock responses
    mockClient.getWorkflows.mockResolvedValue(mockWorkflowsResponse);
    mockClient.getExecutions.mockResolvedValue(mockExecutionsResponse);

    // Create EventClient instance
    eventClient = new EventClient(mockClient, mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (eventClient) {
      eventClient.disconnect();
    }
  });

  describe('EventClient Integration', () => {
    it('should initialize and connect successfully', async () => {
      const connectPromise = eventClient.connect();
      
      // Should emit connected event
      const connectedPromise = new Promise<void>((resolve) => {
        eventClient.once('connected', () => resolve());
      });

      await Promise.all([connectPromise, connectedPromise]);
      
      expect(mockClient.getWorkflows).toHaveBeenCalledWith({ limit: 1 });
    });

    it('should create and manage subscriptions', () => {
      const subscriptionId = eventClient.subscribe(
        ['workflow_execution', 'user_action'],
        {
          url: 'https://example.com/webhook',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { workflowId: 'wf_1' }
      );

      expect(subscriptionId).toMatch(/^sub_\d+_[a-z0-9]+$/);

      const subscriptions = eventClient.getSubscriptions();
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].id).toBe(subscriptionId);
      expect(subscriptions[0].eventTypes).toEqual(['workflow_execution', 'user_action']);
      expect(subscriptions[0].active).toBe(true);
    });

    it('should emit and track events', () => {
      // Emit a custom event
      eventClient.emitEvent({
        type: 'test_event',
        workflowId: 'wf_1',
        data: { status: 'success', duration: 2500 },
      });

      // Track an analytics event
      eventClient.trackEvent({
        type: 'workflow_execution',
        category: 'automation',
        action: 'execute',
        label: 'test-workflow',
        value: 1,
      });

      // Check event buffer
      const events = eventClient.getEventBuffer();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('test_event');
      expect(events[0].workflowId).toBe('wf_1');

      // Check analytics buffer
      const analytics = eventClient.getAnalyticsBuffer();
      expect(analytics).toHaveLength(1);
      expect(analytics[0].type).toBe('workflow_execution');
      expect(analytics[0].category).toBe('automation');
    });

    it('should generate real-time statistics', async () => {
      await eventClient.connect();

      const stats = await eventClient.getRealtimeStats();

      expect(stats).toHaveProperty('activeExecutions');
      expect(stats).toHaveProperty('totalExecutionsToday');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('averageExecutionTime');
      expect(stats).toHaveProperty('systemLoad');
      expect(stats).toHaveProperty('topWorkflows');

      expect(Array.isArray(stats.topWorkflows)).toBe(true);
      expect(typeof stats.successRate).toBe('number');
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(100);
    });

    it('should test webhook connectivity', async () => {
      // Mock fetch for webhook testing
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });
      global.fetch = mockFetch;

      const webhookConfig = {
        url: 'https://example.com/webhook',
        method: 'POST' as const,
        headers: { 'Content-Type': 'application/json' },
        authentication: {
          type: 'bearer' as const,
          token: 'test-token',
        },
      };

      const result = await eventClient.testWebhook(webhookConfig);

      expect(result.success).toBe(true);
      expect(typeof result.responseTime).toBe('number');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should handle webhook authentication configurations', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });
      global.fetch = mockFetch;

      // Test basic authentication
      const basicAuth = {
        url: 'https://example.com/webhook',
        method: 'POST' as const,
        authentication: {
          type: 'basic' as const,
          username: 'user',
          password: 'pass',
        },
      };

      await eventClient.testWebhook(basicAuth);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        })
      );

      mockFetch.mockClear();

      // Test API key authentication
      const apiKeyAuth = {
        url: 'https://example.com/webhook',
        method: 'POST' as const,
        authentication: {
          type: 'apikey' as const,
          apiKeyHeader: 'X-API-Key',
          apiKeyValue: 'secret-key',
        },
      };

      await eventClient.testWebhook(apiKeyAuth);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret-key',
          }),
        })
      );
    });

    it('should clear buffers correctly', () => {
      // Add some events
      eventClient.emitEvent({ type: 'test1', data: {} });
      eventClient.emitEvent({ type: 'test2', data: {} });
      eventClient.trackEvent({
        type: 'workflow_execution',
        category: 'test',
        action: 'test',
      });

      // Verify events exist
      expect(eventClient.getEventBuffer()).toHaveLength(2);
      expect(eventClient.getAnalyticsBuffer()).toHaveLength(1);

      // Clear buffers
      eventClient.clearBuffers();

      // Verify buffers are empty
      expect(eventClient.getEventBuffer()).toHaveLength(0);
      expect(eventClient.getAnalyticsBuffer()).toHaveLength(0);
    });

    it('should unsubscribe from events', () => {
      const subscriptionId = eventClient.subscribe(['test_event']);

      expect(eventClient.getSubscriptions()).toHaveLength(1);

      const success = eventClient.unsubscribe(subscriptionId);
      expect(success).toBe(true);
      expect(eventClient.getSubscriptions()).toHaveLength(0);

      // Try to unsubscribe again
      const secondAttempt = eventClient.unsubscribe(subscriptionId);
      expect(secondAttempt).toBe(false);
    });

    it('should handle connection failures gracefully', async () => {
      // Mock client to fail
      mockClient.getWorkflows.mockRejectedValue(new Error('Connection failed'));

      const errorPromise = new Promise<Error>((resolve) => {
        eventClient.once('error', (error) => resolve(error));
      });

      const connectPromise = eventClient.connect();

      // Should not throw, but emit error event
      await connectPromise;
      const error = await errorPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Connection failed');
    });
  });

  describe('Event Processing and Matching', () => {
    it('should process events and trigger subscriptions', () => {
      let triggeredEvent: any = null;
      let triggeredSubscription: any = null;

      // Listen for subscription triggers
      eventClient.on('subscriptionTriggered', ({ subscription, event }) => {
        triggeredSubscription = subscription;
        triggeredEvent = event;
      });

      // Create subscription
      const subscriptionId = eventClient.subscribe(
        ['workflow_execution'],
        undefined,
        { workflowId: 'wf_1' }
      );

      // Emit matching event
      eventClient.emitEvent({
        type: 'workflow_execution',
        workflowId: 'wf_1',
        data: { status: 'success' },
      });

      // Allow event processing
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(triggeredEvent).not.toBeNull();
          expect(triggeredSubscription).not.toBeNull();
          expect(triggeredEvent.type).toBe('workflow_execution');
          expect(triggeredSubscription.id).toBe(subscriptionId);
          resolve();
        }, 100);
      });
    });

    it('should filter events based on subscription criteria', () => {
      let triggerCount = 0;

      eventClient.on('subscriptionTriggered', () => {
        triggerCount++;
      });

      // Create filtered subscription
      eventClient.subscribe(
        ['workflow_execution'],
        undefined,
        { workflowId: 'specific_workflow' }
      );

      // Emit matching event
      eventClient.emitEvent({
        type: 'workflow_execution',
        workflowId: 'specific_workflow',
        data: { status: 'success' },
      });

      // Emit non-matching event
      eventClient.emitEvent({
        type: 'workflow_execution',
        workflowId: 'different_workflow',
        data: { status: 'success' },
      });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(triggerCount).toBe(1); // Only one should match
          resolve();
        }, 100);
      });
    });

    it('should handle wildcard event subscriptions', () => {
      let triggerCount = 0;

      eventClient.on('subscriptionTriggered', () => {
        triggerCount++;
      });

      // Create wildcard subscription
      eventClient.subscribe(['*']);

      // Emit various event types
      eventClient.emitEvent({ type: 'workflow_execution', data: {} });
      eventClient.emitEvent({ type: 'user_action', data: {} });
      eventClient.emitEvent({ type: 'system_event', data: {} });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(triggerCount).toBe(3); // All should match wildcard
          resolve();
        }, 100);
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle webhook failures gracefully', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      global.fetch = mockFetch;

      const webhookConfig = {
        url: 'https://example.com/webhook',
        method: 'POST' as const,
      };

      const result = await eventClient.testWebhook(webhookConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP 500: Internal Server Error');
      expect(typeof result.responseTime).toBe('number');
    });

    it('should handle network errors in webhook testing', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const webhookConfig = {
        url: 'https://example.com/webhook',
        method: 'POST' as const,
      };

      const result = await eventClient.testWebhook(webhookConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle statistics calculation errors', async () => {
      // Mock client to return malformed data
      mockClient.getWorkflows.mockResolvedValue({ data: null as any });
      mockClient.getExecutions.mockResolvedValue({ data: null as any });

      await eventClient.connect();

      await expect(eventClient.getRealtimeStats()).rejects.toThrow();
    });
  });
});