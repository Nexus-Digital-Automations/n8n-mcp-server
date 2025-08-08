import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { EventClient, EventStreamConfig, WebhookConfig } from '../client/eventClient.js';

// Zod schemas for validation
const EventSubscriptionSchema = z.object({
  eventTypes: z.array(z.string()).min(1, 'At least one event type is required'),
  filters: z.record(z.unknown()).optional(),
  webhookUrl: z.string().url().optional(),
  webhookMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  webhookHeaders: z.record(z.string()).optional(),
  authType: z.enum(['bearer', 'basic', 'apikey']).optional(),
  authToken: z.string().optional(),
  authUsername: z.string().optional(),
  authPassword: z.string().optional(),
  apiKeyHeader: z.string().optional(),
  apiKeyValue: z.string().optional(),
});

const UnsubscribeSchema = z.object({
  subscriptionId: z.string().min(1, 'Subscription ID is required'),
});

const EmitEventSchema = z.object({
  eventType: z.string().min(1, 'Event type is required'),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
  nodeId: z.string().optional(),
  data: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).optional(),
});

const TrackAnalyticsSchema = z.object({
  type: z.enum(['workflow_execution', 'user_action', 'system_event', 'performance_metric']),
  category: z.string().min(1, 'Category is required'),
  action: z.string().min(1, 'Action is required'),
  label: z.string().optional(),
  value: z.number().optional(),
  dimensions: z.record(z.string()).optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
});

const WebhookTestSchema = z.object({
  url: z.string().url('Valid URL is required'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  headers: z.record(z.string()).optional(),
  body: z.record(z.unknown()).optional(),
  authType: z.enum(['bearer', 'basic', 'apikey']).optional(),
  authToken: z.string().optional(),
  authUsername: z.string().optional(),
  authPassword: z.string().optional(),
  apiKeyHeader: z.string().optional(),
  apiKeyValue: z.string().optional(),
});

const EventBufferSchema = z.object({
  limit: z.number().min(1).max(1000).default(100),
  eventType: z.string().optional(),
  since: z.string().optional(), // ISO timestamp
});

// Global event client instance
let eventClient: EventClient | null = null;

// Initialize event client
const getEventClient = (getClient: () => N8nClient | null): EventClient => {
  if (!eventClient) {
    const client = getClient();
    if (!client) {
      throw new UserError('N8n client not available');
    }

    // Extract configuration from client
    const baseUrl = (client as any).baseUrl || process.env.N8N_BASE_URL || 'http://localhost:5678';
    const apiKey = (client as any).apiKey || process.env.N8N_API_KEY || '';

    const config: EventStreamConfig = {
      baseUrl,
      apiKey,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      enableHeartbeat: true,
      heartbeatInterval: 30000,
    };

    eventClient = new EventClient(client, config);

    // Set up event listeners for debugging
    eventClient.on('connected', () => console.log('Event client connected'));
    eventClient.on('disconnected', () => console.log('Event client disconnected'));
    eventClient.on('error', error => console.error('Event client error:', error));

    // Auto-connect
    eventClient.connect().catch(error => {
      console.error('Failed to connect event client:', error);
    });
  }
  return eventClient;
};

// Helper functions
const buildWebhookConfig = (args: any): WebhookConfig | undefined => {
  if (!args.webhookUrl) return undefined;

  const webhook: WebhookConfig = {
    url: args.webhookUrl,
    method: args.webhookMethod || 'POST',
    headers: args.webhookHeaders || {},
    body: {},
  };

  // Add authentication if provided
  if (args.authType) {
    webhook.authentication = {
      type: args.authType,
      token: args.authToken,
      username: args.authUsername,
      password: args.authPassword,
      apiKeyHeader: args.apiKeyHeader,
      apiKeyValue: args.apiKeyValue,
    };
  }

  return webhook;
};

const formatSubscription = (sub: any): string => {
  let result = `**${sub.id}**\n`;
  result += `• Event Types: ${sub.eventTypes.join(', ')}\n`;
  result += `• Status: ${sub.active ? '✅ Active' : '❌ Inactive'}\n`;
  result += `• Created: ${new Date(sub.createdAt).toLocaleString()}\n`;
  result += `• Success Count: ${sub.successCount}\n`;
  result += `• Error Count: ${sub.errorCount}\n`;

  if (sub.lastTriggered) {
    result += `• Last Triggered: ${new Date(sub.lastTriggered).toLocaleString()}\n`;
  }

  if (sub.webhook) {
    result += `• Webhook: ${sub.webhook.method} ${sub.webhook.url}\n`;
  }

  if (sub.filters && Object.keys(sub.filters).length > 0) {
    result += `• Filters: ${JSON.stringify(sub.filters, null, 2)}\n`;
  }

  return result;
};

// Tool registration function
export function createEventStreamingTools(getClient: () => N8nClient | null, server: any) {
  // Subscribe to events tool
  server.addTool({
    name: 'subscribe-to-events',
    description: 'Subscribe to specific event types with optional webhook notifications',
    parameters: EventSubscriptionSchema,
    handler: async (args: z.infer<typeof EventSubscriptionSchema>) => {
      try {
        const client = getEventClient(getClient);

        // Build webhook configuration if provided
        const webhook = buildWebhookConfig(args);

        // Create subscription
        const subscriptionId = client.subscribe(args.eventTypes, webhook, args.filters);

        let response = `✅ **Event subscription created successfully!**\n\n`;
        response += `**Subscription ID:** ${subscriptionId}\n`;
        response += `**Event Types:** ${args.eventTypes.join(', ')}\n`;

        if (webhook) {
          response += `**Webhook:** ${webhook.method} ${webhook.url}\n`;
        }

        if (args.filters) {
          response += `**Filters:** ${JSON.stringify(args.filters, null, 2)}\n`;
        }

        response += `\nYou can now receive real-time events matching your subscription criteria.`;

        if (webhook) {
          response += ` Events will be sent to your webhook URL when they occur.`;
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to subscribe to events: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Unsubscribe from events tool
  server.addTool({
    name: 'unsubscribe-from-events',
    description: 'Unsubscribe from event notifications',
    parameters: UnsubscribeSchema,
    handler: async (args: z.infer<typeof UnsubscribeSchema>) => {
      try {
        const client = getEventClient(getClient);

        const success = client.unsubscribe(args.subscriptionId);

        if (success) {
          return `✅ **Successfully unsubscribed from events**\n\nSubscription ID \`${args.subscriptionId}\` has been removed.`;
        } else {
          return `❌ **Subscription not found**\n\nNo active subscription found with ID \`${args.subscriptionId}\`.`;
        }
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to unsubscribe: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // List active subscriptions tool
  server.addTool({
    name: 'list-event-subscriptions',
    description: 'List all active event subscriptions',
    parameters: z.object({}),
    handler: async () => {
      try {
        const client = getEventClient(getClient);
        const subscriptions = client.getSubscriptions();

        if (subscriptions.length === 0) {
          return `📭 **No active subscriptions**\n\nUse the \`subscribe-to-events\` tool to create event subscriptions.`;
        }

        let response = `📊 **Active Event Subscriptions (${subscriptions.length})**\n\n`;

        subscriptions.forEach((sub, index) => {
          response += `${index + 1}. ${formatSubscription(sub)}\n`;
        });

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to list subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Emit custom event tool
  server.addTool({
    name: 'emit-custom-event',
    description: 'Emit a custom event into the event stream',
    parameters: EmitEventSchema,
    handler: async (args: z.infer<typeof EmitEventSchema>) => {
      try {
        const client = getEventClient(getClient);

        client.emitEvent({
          type: args.eventType,
          workflowId: args.workflowId,
          executionId: args.executionId,
          nodeId: args.nodeId,
          data: args.data,
          metadata: args.metadata,
        });

        let response = `🚀 **Custom event emitted successfully!**\n\n`;
        response += `**Event Type:** ${args.eventType}\n`;

        if (args.workflowId) response += `**Workflow ID:** ${args.workflowId}\n`;
        if (args.executionId) response += `**Execution ID:** ${args.executionId}\n`;
        if (args.nodeId) response += `**Node ID:** ${args.nodeId}\n`;

        response += `**Data:** ${JSON.stringify(args.data, null, 2)}\n`;

        if (args.metadata) {
          response += `**Metadata:** ${JSON.stringify(args.metadata, null, 2)}\n`;
        }

        response += `\nThe event has been added to the stream and will trigger any matching subscriptions.`;

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to emit event: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Track analytics event tool
  server.addTool({
    name: 'track-analytics-event',
    description: 'Track an analytics event for usage insights and reporting',
    parameters: TrackAnalyticsSchema,
    handler: async (args: z.infer<typeof TrackAnalyticsSchema>) => {
      try {
        const client = getEventClient(getClient);

        client.trackEvent({
          type: args.type,
          category: args.category,
          action: args.action,
          label: args.label,
          value: args.value,
          dimensions: args.dimensions,
          sessionId: args.sessionId,
          userId: args.userId,
        });

        let response = `📈 **Analytics event tracked successfully!**\n\n`;
        response += `**Type:** ${args.type}\n`;
        response += `**Category:** ${args.category}\n`;
        response += `**Action:** ${args.action}\n`;

        if (args.label) response += `**Label:** ${args.label}\n`;
        if (args.value !== undefined) response += `**Value:** ${args.value}\n`;
        if (args.sessionId) response += `**Session ID:** ${args.sessionId}\n`;
        if (args.userId) response += `**User ID:** ${args.userId}\n`;

        if (args.dimensions) {
          response += `**Dimensions:** ${JSON.stringify(args.dimensions, null, 2)}\n`;
        }

        response += `\nThe analytics event has been recorded and will be available in reporting dashboards.`;

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to track analytics event: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Get real-time stats tool
  server.addTool({
    name: 'get-realtime-stats',
    description: 'Get current real-time system statistics and metrics',
    parameters: z.object({}),
    handler: async () => {
      try {
        const client = getEventClient(getClient);
        const stats = await client.getRealtimeStats();

        let response = `📊 **Real-time System Statistics**\n\n`;
        response += `**Active Executions:** ${stats.activeExecutions}\n`;
        response += `**Total Executions Today:** ${stats.totalExecutionsToday}\n`;
        response += `**Success Rate:** ${stats.successRate.toFixed(1)}%\n`;
        response += `**Error Rate:** ${stats.errorRate.toFixed(1)}%\n`;
        response += `**Average Execution Time:** ${(stats.averageExecutionTime / 1000).toFixed(2)}s\n`;
        response += `**Active Users:** ${stats.activeUsers}\n`;

        response += `\n**💻 System Load:**\n`;
        response += `• CPU: ${stats.systemLoad.cpu.toFixed(1)}%\n`;
        response += `• Memory: ${stats.systemLoad.memory.toFixed(1)}%\n`;
        response += `• Disk: ${stats.systemLoad.disk.toFixed(1)}%\n`;

        if (stats.topWorkflows.length > 0) {
          response += `\n**🔥 Top Workflows:**\n`;
          stats.topWorkflows.slice(0, 5).forEach((workflow, index) => {
            const avgTime =
              workflow.avgTime > 0 ? ` (${(workflow.avgTime / 1000).toFixed(2)}s avg)` : '';
            response += `${index + 1}. **${workflow.name}**: ${workflow.executions} executions${avgTime}\n`;
          });
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to get real-time stats: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Test webhook tool
  server.addTool({
    name: 'test-webhook',
    description: 'Test webhook configuration by sending a test payload',
    parameters: WebhookTestSchema,
    handler: async (args: z.infer<typeof WebhookTestSchema>) => {
      try {
        const client = getEventClient(getClient);

        const webhook: WebhookConfig = {
          url: args.url,
          method: args.method,
          headers: args.headers || {},
          body: args.body || {},
        };

        // Add authentication if provided
        if (args.authType) {
          webhook.authentication = {
            type: args.authType,
            token: args.authToken,
            username: args.authUsername,
            password: args.authPassword,
            apiKeyHeader: args.apiKeyHeader,
            apiKeyValue: args.apiKeyValue,
          };
        }

        const result = await client.testWebhook(webhook);

        let response = `🔗 **Webhook Test Results**\n\n`;
        response += `**URL:** ${args.url}\n`;
        response += `**Method:** ${args.method}\n`;
        response += `**Success:** ${result.success ? '✅ Yes' : '❌ No'}\n`;
        response += `**Response Time:** ${result.responseTime}ms\n`;

        if (result.error) {
          response += `**Error:** ${result.error}\n`;
          response += `\n💡 **Troubleshooting Tips:**\n`;
          response += `• Verify the webhook URL is accessible\n`;
          response += `• Check authentication credentials if required\n`;
          response += `• Ensure the endpoint accepts the HTTP method used\n`;
          response += `• Verify any required headers are included\n`;
        } else {
          response += `\n✅ **Webhook is working correctly!**\n`;
          response += `The endpoint responded successfully and can receive event notifications.`;
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to test webhook: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Get event buffer tool
  server.addTool({
    name: 'get-event-buffer',
    description: 'Get recent events from the event buffer with optional filtering',
    parameters: EventBufferSchema,
    handler: async (args: z.infer<typeof EventBufferSchema>) => {
      try {
        const client = getEventClient(getClient);
        let events = client.getEventBuffer();

        // Apply filters
        if (args.eventType) {
          events = events.filter(e => e.type === args.eventType);
        }

        if (args.since) {
          const sinceDate = new Date(args.since);
          events = events.filter(e => new Date(e.timestamp) >= sinceDate);
        }

        // Limit results
        events = events.slice(-args.limit);

        if (events.length === 0) {
          return `📭 **No events found**\n\nNo events match your criteria in the current buffer.`;
        }

        let response = `📋 **Event Buffer (${events.length} events)**\n\n`;

        events.forEach((event, index) => {
          response += `${index + 1}. **${event.type}** (${event.id})\n`;
          response += `   • Timestamp: ${new Date(event.timestamp).toLocaleString()}\n`;

          if (event.workflowId) response += `   • Workflow: ${event.workflowId}\n`;
          if (event.executionId) response += `   • Execution: ${event.executionId}\n`;
          if (event.nodeId) response += `   • Node: ${event.nodeId}\n`;

          if (Object.keys(event.data).length > 0) {
            response += `   • Data: ${JSON.stringify(event.data)}\n`;
          }

          response += `\n`;
        });

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to get event buffer: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Clear event buffers tool
  server.addTool({
    name: 'clear-event-buffers',
    description: 'Clear all buffered events and analytics data',
    parameters: z.object({}),
    handler: async () => {
      try {
        const client = getEventClient(getClient);

        const eventCount = client.getEventBuffer().length;
        const analyticsCount = client.getAnalyticsBuffer().length;

        client.clearBuffers();

        let response = `🧹 **Event buffers cleared successfully!**\n\n`;
        response += `**Events cleared:** ${eventCount}\n`;
        response += `**Analytics events cleared:** ${analyticsCount}\n`;
        response += `\nAll buffered data has been removed. New events will start accumulating from now.`;

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to clear event buffers: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });
}
