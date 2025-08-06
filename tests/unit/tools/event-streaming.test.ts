import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { FastMCP } from 'fastmcp';
import { N8nClient } from '../../../src/client/n8nClient';
import { createEventStreamingTools } from '../../../src/tools/event-streaming';
import { EventClient } from '../../../src/client/eventClient';

// Mock the EventClient
jest.mock('../../../src/client/eventClient');
const MockedEventClient = EventClient as jest.MockedClass<typeof EventClient>;

describe('Event Streaming Tools', () => {
  let server: FastMCP;
  let mockClient: jest.Mocked<N8nClient>;
  let mockEventClient: jest.Mocked<EventClient>;
  let getClient: () => N8nClient | null;

  const mockSubscription = {
    id: 'sub_123',
    eventTypes: ['workflow_execution', 'user_action'],
    active: true,
    createdAt: new Date('2023-01-01T00:00:00Z'),
    successCount: 5,
    errorCount: 1,
    lastTriggered: new Date('2023-01-01T12:00:00Z'),
    webhook: {
      url: 'https://example.com/webhook',
      method: 'POST' as const,
    },
    filters: { workflowId: 'workflow_123' },
  };

  const mockRealtimeStats = {
    activeExecutions: 3,
    totalExecutionsToday: 45,
    successRate: 92.5,
    averageExecutionTime: 2500,
    errorRate: 7.5,
    activeUsers: 2,
    systemLoad: {
      cpu: 45.2,
      memory: 68.1,
      disk: 32.8,
    },
    topWorkflows: [
      {
        id: 'wf_1',
        name: 'Data Processing',
        executions: 25,
        avgTime: 1800,
      },
      {
        id: 'wf_2',
        name: 'Email Automation',
        executions: 15,
        avgTime: 800,
      },
    ],
  };

  beforeEach(() => {
    // Create server instance
    server = new FastMCP({ name: 'test-server', version: '1.0.0' });

    // Create mock client
    mockClient = {
      getWorkflows: jest.fn(),
      getExecutions: jest.fn(),
    } as any;

    // Create mock event client
    mockEventClient = {
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getSubscriptions: jest.fn(),
      emitEvent: jest.fn(),
      trackEvent: jest.fn(),
      getRealtimeStats: jest.fn(),
      testWebhook: jest.fn(),
      getEventBuffer: jest.fn(),
      getAnalyticsBuffer: jest.fn(),
      clearBuffers: jest.fn(),
      connect: jest.fn(),
      on: jest.fn(),
    } as any;

    // Mock EventClient constructor
    MockedEventClient.mockImplementation(() => mockEventClient);

    // Setup getClient function
    getClient = jest.fn().mockReturnValue(mockClient);

    // Register tools
    createEventStreamingTools(getClient, server);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('subscribe-to-events', () => {
    it('should create event subscription successfully', async () => {
      mockEventClient.subscribe.mockReturnValue('sub_123');

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'subscribe-to-events',
          arguments: {
            eventTypes: ['workflow_execution', 'user_action'],
            webhookUrl: 'https://example.com/webhook',
            webhookMethod: 'POST',
            filters: { workflowId: 'workflow_123' },
          },
        },
      });

      expect(result.content[0].text).toContain('Event subscription created successfully');
      expect(result.content[0].text).toContain('sub_123');
      expect(result.content[0].text).toContain('workflow_execution, user_action');
      expect(mockEventClient.subscribe).toHaveBeenCalledWith(
        ['workflow_execution', 'user_action'],
        expect.objectContaining({
          url: 'https://example.com/webhook',
          method: 'POST',
        }),
        { workflowId: 'workflow_123' }
      );
    });

    it('should create subscription without webhook', async () => {
      mockEventClient.subscribe.mockReturnValue('sub_456');

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'subscribe-to-events',
          arguments: {
            eventTypes: ['system_event'],
          },
        },
      });

      expect(result.content[0].text).toContain('Event subscription created successfully');
      expect(mockEventClient.subscribe).toHaveBeenCalledWith(
        ['system_event'],
        undefined,
        undefined
      );
    });

    it('should handle authentication configuration', async () => {
      mockEventClient.subscribe.mockReturnValue('sub_789');

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'subscribe-to-events',
          arguments: {
            eventTypes: ['workflow_execution'],
            webhookUrl: 'https://example.com/webhook',
            authType: 'bearer',
            authToken: 'secret-token',
          },
        },
      });

      expect(result.content[0].text).toContain('Event subscription created successfully');
      expect(mockEventClient.subscribe).toHaveBeenCalledWith(
        ['workflow_execution'],
        expect.objectContaining({
          authentication: {
            type: 'bearer',
            token: 'secret-token',
          },
        }),
        undefined
      );
    });
  });

  describe('unsubscribe-from-events', () => {
    it('should unsubscribe successfully', async () => {
      mockEventClient.unsubscribe.mockReturnValue(true);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'unsubscribe-from-events',
          arguments: {
            subscriptionId: 'sub_123',
          },
        },
      });

      expect(result.content[0].text).toContain('Successfully unsubscribed from events');
      expect(mockEventClient.unsubscribe).toHaveBeenCalledWith('sub_123');
    });

    it('should handle subscription not found', async () => {
      mockEventClient.unsubscribe.mockReturnValue(false);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'unsubscribe-from-events',
          arguments: {
            subscriptionId: 'non-existent',
          },
        },
      });

      expect(result.content[0].text).toContain('Subscription not found');
    });
  });

  describe('list-event-subscriptions', () => {
    it('should list active subscriptions', async () => {
      mockEventClient.getSubscriptions.mockReturnValue([mockSubscription]);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'list-event-subscriptions',
          arguments: {},
        },
      });

      expect(result.content[0].text).toContain('Active Event Subscriptions (1)');
      expect(result.content[0].text).toContain('sub_123');
      expect(result.content[0].text).toContain('workflow_execution, user_action');
      expect(result.content[0].text).toContain('Success Count: 5');
    });

    it('should handle no subscriptions', async () => {
      mockEventClient.getSubscriptions.mockReturnValue([]);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'list-event-subscriptions',
          arguments: {},
        },
      });

      expect(result.content[0].text).toContain('No active subscriptions');
    });
  });

  describe('emit-custom-event', () => {
    it('should emit custom event successfully', async () => {
      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'emit-custom-event',
          arguments: {
            eventType: 'custom_event',
            workflowId: 'workflow_123',
            data: { key: 'value' },
            metadata: { source: 'test' },
          },
        },
      });

      expect(result.content[0].text).toContain('Custom event emitted successfully');
      expect(result.content[0].text).toContain('custom_event');
      expect(result.content[0].text).toContain('workflow_123');
      expect(mockEventClient.emitEvent).toHaveBeenCalledWith({
        type: 'custom_event',
        workflowId: 'workflow_123',
        executionId: undefined,
        nodeId: undefined,
        data: { key: 'value' },
        metadata: { source: 'test' },
      });
    });
  });

  describe('track-analytics-event', () => {
    it('should track analytics event successfully', async () => {
      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'track-analytics-event',
          arguments: {
            type: 'workflow_execution',
            category: 'automation',
            action: 'execute',
            label: 'test-workflow',
            value: 100,
            userId: 'user_123',
          },
        },
      });

      expect(result.content[0].text).toContain('Analytics event tracked successfully');
      expect(result.content[0].text).toContain('workflow_execution');
      expect(result.content[0].text).toContain('automation');
      expect(mockEventClient.trackEvent).toHaveBeenCalledWith({
        type: 'workflow_execution',
        category: 'automation',
        action: 'execute',
        label: 'test-workflow',
        value: 100,
        dimensions: undefined,
        sessionId: undefined,
        userId: 'user_123',
      });
    });
  });

  describe('get-realtime-stats', () => {
    it('should return real-time statistics', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'get-realtime-stats',
          arguments: {},
        },
      });

      expect(result.content[0].text).toContain('Real-time System Statistics');
      expect(result.content[0].text).toContain('Active Executions: 3');
      expect(result.content[0].text).toContain('Success Rate: 92.5%');
      expect(result.content[0].text).toContain('CPU: 45.2%');
      expect(result.content[0].text).toContain('Data Processing: 25 executions');
    });
  });

  describe('test-webhook', () => {
    it('should test webhook successfully', async () => {
      mockEventClient.testWebhook.mockResolvedValue({
        success: true,
        responseTime: 150,
      });

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'test-webhook',
          arguments: {
            url: 'https://example.com/webhook',
            method: 'POST',
          },
        },
      });

      expect(result.content[0].text).toContain('Webhook Test Results');
      expect(result.content[0].text).toContain('Success: ✅ Yes');
      expect(result.content[0].text).toContain('Response Time: 150ms');
      expect(result.content[0].text).toContain('Webhook is working correctly');
    });

    it('should handle webhook failure', async () => {
      mockEventClient.testWebhook.mockResolvedValue({
        success: false,
        responseTime: 5000,
        error: 'Connection timeout',
      });

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'test-webhook',
          arguments: {
            url: 'https://example.com/webhook',
            method: 'POST',
          },
        },
      });

      expect(result.content[0].text).toContain('Success: ❌ No');
      expect(result.content[0].text).toContain('Error: Connection timeout');
      expect(result.content[0].text).toContain('Troubleshooting Tips');
    });
  });

  describe('get-event-buffer', () => {
    it('should return buffered events', async () => {
      const mockEvents = [
        {
          id: 'evt_1',
          type: 'workflow_execution',
          timestamp: new Date('2023-01-01T12:00:00Z'),
          workflowId: 'workflow_123',
          data: { status: 'success' },
        },
        {
          id: 'evt_2',
          type: 'user_action',
          timestamp: new Date('2023-01-01T12:05:00Z'),
          data: { action: 'login' },
        },
      ];

      mockEventClient.getEventBuffer.mockReturnValue(mockEvents);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'get-event-buffer',
          arguments: {
            limit: 10,
          },
        },
      });

      expect(result.content[0].text).toContain('Event Buffer (2 events)');
      expect(result.content[0].text).toContain('workflow_execution');
      expect(result.content[0].text).toContain('user_action');
      expect(result.content[0].text).toContain('workflow_123');
    });

    it('should handle empty event buffer', async () => {
      mockEventClient.getEventBuffer.mockReturnValue([]);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'get-event-buffer',
          arguments: {},
        },
      });

      expect(result.content[0].text).toContain('No events found');
    });
  });

  describe('clear-event-buffers', () => {
    it('should clear event buffers', async () => {
      mockEventClient.getEventBuffer.mockReturnValue([{ id: '1' }, { id: '2' }] as any);
      mockEventClient.getAnalyticsBuffer.mockReturnValue([{ type: 'test' }] as any);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'clear-event-buffers',
          arguments: {},
        },
      });

      expect(result.content[0].text).toContain('Event buffers cleared successfully');
      expect(result.content[0].text).toContain('Events cleared: 2');
      expect(result.content[0].text).toContain('Analytics events cleared: 1');
      expect(mockEventClient.clearBuffers).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle client not available error', async () => {
      const getClientError = jest.fn().mockReturnValue(null);
      
      // Create new server with error-prone client
      const errorServer = new FastMCP({ name: 'error-server', version: '1.0.0' });
      createEventStreamingTools(getClientError, errorServer);

      await expect(
        errorServer.request({
          method: 'tools/call',
          params: {
            name: 'get-realtime-stats',
            arguments: {},
          },
        })
      ).rejects.toThrow('N8n client not available');
    });

    it('should handle event client errors', async () => {
      mockEventClient.getRealtimeStats.mockRejectedValue(new Error('Connection failed'));

      await expect(
        server.request({
          method: 'tools/call',
          params: {
            name: 'get-realtime-stats',
            arguments: {},
          },
        })
      ).rejects.toThrow('Failed to get real-time stats');
    });
  });
});