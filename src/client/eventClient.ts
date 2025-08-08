import { EventEmitter } from 'events';
import { setTimeout, setInterval, clearInterval } from 'timers';
import fetch from 'node-fetch';
import { N8nClient } from './n8nClient.js';

export interface EventStreamConfig {
  baseUrl: string;
  apiKey: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  enableHeartbeat?: boolean;
  heartbeatInterval?: number;
}

export interface WebhookConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  authentication?: {
    type: 'bearer' | 'basic' | 'apikey';
    token?: string;
    username?: string;
    password?: string;
    apiKeyHeader?: string;
    apiKeyValue?: string;
  };
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
    retryOnStatusCodes?: number[];
  };
}

export interface EventSubscription {
  id: string;
  eventTypes: string[];
  webhook?: WebhookConfig;
  filters?: Record<string, unknown>;
  active: boolean;
  createdAt: Date;
  lastTriggered?: Date;
  successCount: number;
  errorCount: number;
}

export interface EventData {
  id: string;
  type: string;
  timestamp: Date;
  workflowId?: string;
  executionId?: string;
  nodeId?: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsEvent {
  type: 'workflow_execution' | 'user_action' | 'system_event' | 'performance_metric';
  category: string;
  action: string;
  label?: string;
  value?: number;
  dimensions?: Record<string, string>;
  timestamp: Date;
  sessionId?: string;
  userId?: string;
}

export interface DashboardMetric {
  id: string;
  name: string;
  value: number | string;
  type: 'counter' | 'gauge' | 'histogram' | 'percentage';
  unit?: string;
  description?: string;
  timestamp: Date;
  tags?: Record<string, string>;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
    period: string;
  };
}

export interface RealtimeStats {
  activeExecutions: number;
  totalExecutionsToday: number;
  successRate: number;
  averageExecutionTime: number;
  errorRate: number;
  activeUsers: number;
  systemLoad: {
    cpu: number;
    memory: number;
    disk: number;
  };
  topWorkflows: Array<{
    id: string;
    name: string;
    executions: number;
    avgTime: number;
  }>;
}

export class EventClient extends EventEmitter {
  private client: N8nClient;
  private config: EventStreamConfig;
  private subscriptions: Map<string, EventSubscription> = new Map();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private eventBuffer: EventData[] = [];
  private analyticsBuffer: AnalyticsEvent[] = [];

  constructor(client: N8nClient, config: EventStreamConfig) {
    super();
    this.client = client;
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      enableHeartbeat: true,
      heartbeatInterval: 30000,
      ...config,
    };
  }

  /**
   * Initialize the event streaming connection
   */
  async connect(): Promise<void> {
    try {
      // Test the connection with a simple API call
      await this.client.getWorkflows({ limit: 1 });
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');

      // Start heartbeat if enabled
      if (this.config.enableHeartbeat) {
        this.startHeartbeat();
      }

      // Start processing event buffers
      this.startEventProcessing();
    } catch (error) {
      this.isConnected = false;
      this.emit('error', error);

      // Attempt reconnection if configured
      if (this.reconnectAttempts < (this.config.maxReconnectAttempts || 10)) {
        setTimeout(() => this.reconnect(), this.config.reconnectInterval);
      }
    }
  }

  /**
   * Disconnect from event streaming
   */
  disconnect(): void {
    this.isConnected = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.emit('disconnected');
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(
    eventTypes: string[],
    webhook?: WebhookConfig,
    filters?: Record<string, unknown>
  ): string {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const subscription: EventSubscription = {
      id: subscriptionId,
      eventTypes,
      webhook,
      filters,
      active: true,
      createdAt: new Date(),
      successCount: 0,
      errorCount: 0,
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.emit('subscribed', subscription);

    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.subscriptions.delete(subscriptionId);
      this.emit('unsubscribed', subscription);
      return true;
    }
    return false;
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Emit a custom event
   */
  emitEvent(eventData: Partial<EventData>): void {
    const event: EventData = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      data: {},
      ...eventData,
      type: eventData.type || 'custom',
    };

    this.eventBuffer.push(event);
    this.processEvent(event);
  }

  /**
   * Track analytics event
   */
  trackEvent(analyticsEvent: Partial<AnalyticsEvent>): void {
    const event: AnalyticsEvent = {
      timestamp: new Date(),
      dimensions: {},
      ...analyticsEvent,
      type: analyticsEvent.type || 'system_event',
      category: analyticsEvent.category || 'general',
      action: analyticsEvent.action || 'unknown',
    };

    this.analyticsBuffer.push(event);
    this.emit('analytics', event);
  }

  /**
   * Get real-time system statistics
   */
  async getRealtimeStats(): Promise<RealtimeStats> {
    try {
      const [workflows, executions] = await Promise.all([
        this.client.getWorkflows({ limit: 100 }),
        this.client.getExecutions({ limit: 100 }),
      ]);

      const workflowsData = workflows.data;
      const executionsData = executions.data;

      // Calculate basic metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todaysExecutions = executionsData.filter(e => new Date(e.startedAt) >= today);

      const activeExecutions = executionsData.filter(e => !e.finished).length;
      const successfulExecutions = executionsData.filter(e => e.finished && !e.stoppedAt);

      const successRate =
        executionsData.length > 0
          ? (successfulExecutions.length / executionsData.length) * 100
          : 100;

      // Calculate average execution time
      const completedExecutions = executionsData.filter(
        e => e.finished && e.startedAt && e.stoppedAt
      );

      const avgTime =
        completedExecutions.length > 0
          ? completedExecutions.reduce((sum, e) => {
              const duration = new Date(e.stoppedAt!).getTime() - new Date(e.startedAt).getTime();
              return sum + duration;
            }, 0) / completedExecutions.length
          : 0;

      // Get top workflows by execution count
      const workflowStats = new Map<
        string,
        { name: string; executions: number; totalTime: number }
      >();

      executionsData.forEach(exec => {
        if (exec.workflowId) {
          const stats = workflowStats.get(exec.workflowId) || {
            name: workflowsData.find(w => w.id === exec.workflowId)?.name || 'Unknown',
            executions: 0,
            totalTime: 0,
          };

          stats.executions++;
          if (exec.finished && exec.startedAt && exec.stoppedAt) {
            stats.totalTime +=
              new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime();
          }

          workflowStats.set(exec.workflowId, stats);
        }
      });

      const topWorkflows = Array.from(workflowStats.entries())
        .map(([id, stats]) => ({
          id,
          name: stats.name,
          executions: stats.executions,
          avgTime: stats.executions > 0 ? stats.totalTime / stats.executions : 0,
        }))
        .sort((a, b) => b.executions - a.executions)
        .slice(0, 10);

      return {
        activeExecutions,
        totalExecutionsToday: todaysExecutions.length,
        successRate,
        averageExecutionTime: avgTime,
        errorRate: 100 - successRate,
        activeUsers: 1, // This would need actual user session tracking
        systemLoad: {
          cpu: Math.random() * 100, // Would be actual system metrics
          memory: Math.random() * 100,
          disk: Math.random() * 100,
        },
        topWorkflows,
      };
    } catch (error) {
      throw new Error(
        `Failed to get realtime stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get buffered events
   */
  getEventBuffer(): EventData[] {
    return [...this.eventBuffer];
  }

  /**
   * Get analytics buffer
   */
  getAnalyticsBuffer(): AnalyticsEvent[] {
    return [...this.analyticsBuffer];
  }

  /**
   * Clear event buffers
   */
  clearBuffers(): void {
    this.eventBuffer = [];
    this.analyticsBuffer = [];
  }

  /**
   * Test webhook configuration
   */
  async testWebhook(
    webhook: WebhookConfig
  ): Promise<{ success: boolean; responseTime: number; error?: string }> {
    const startTime = Date.now();

    try {
      const testPayload = {
        type: 'webhook_test',
        timestamp: new Date().toISOString(),
        data: { test: true },
      };

      const response = await fetch(webhook.url, {
        method: webhook.method,
        headers: {
          'Content-Type': 'application/json',
          ...this.buildAuthHeaders(webhook.authentication),
          ...webhook.headers,
        },
        body: webhook.method !== 'GET' ? JSON.stringify(webhook.body || testPayload) : undefined,
      });

      return {
        success: response.ok,
        responseTime: Date.now() - startTime,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Private methods

  private async reconnect(): Promise<void> {
    this.reconnectAttempts++;
    this.emit('reconnecting', { attempt: this.reconnectAttempts });

    try {
      await this.connect();
    } catch {
      if (this.reconnectAttempts < (this.config.maxReconnectAttempts || 10)) {
        setTimeout(() => this.reconnect(), this.config.reconnectInterval);
      } else {
        this.emit('maxReconnectAttemptsReached');
      }
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      try {
        // Simple heartbeat check
        await this.client.getWorkflows({ limit: 1 });
        this.emit('heartbeat', { timestamp: new Date(), healthy: true });
      } catch (error) {
        this.emit('heartbeat', { timestamp: new Date(), healthy: false, error });
        this.isConnected = false;
        this.reconnect();
      }
    }, this.config.heartbeatInterval);
  }

  private startEventProcessing(): void {
    // Process events every 1 second
    setInterval(() => {
      this.processBufferedEvents();
    }, 1000);
  }

  private processBufferedEvents(): void {
    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    events.forEach(event => {
      this.processEvent(event);
    });
  }

  private processEvent(event: EventData): void {
    // Check all subscriptions for matching event types
    for (const subscription of this.subscriptions.values()) {
      if (subscription.active && this.eventMatches(event, subscription)) {
        this.handleSubscription(event, subscription);
      }
    }

    this.emit('event', event);
  }

  private eventMatches(event: EventData, subscription: EventSubscription): boolean {
    // Check if event type matches
    if (!subscription.eventTypes.includes(event.type) && !subscription.eventTypes.includes('*')) {
      return false;
    }

    // Apply filters if any
    if (subscription.filters) {
      for (const [key, value] of Object.entries(subscription.filters)) {
        if (event.data[key] !== value && event.metadata?.[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  private async handleSubscription(
    event: EventData,
    subscription: EventSubscription
  ): Promise<void> {
    subscription.lastTriggered = new Date();

    if (subscription.webhook) {
      try {
        await this.sendWebhook(event, subscription.webhook);
        subscription.successCount++;
      } catch (error) {
        subscription.errorCount++;
        this.emit('webhookError', { subscription, event, error });
      }
    }

    this.emit('subscriptionTriggered', { subscription, event });
  }

  private async sendWebhook(event: EventData, webhook: WebhookConfig): Promise<void> {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
    };

    const maxRetries = webhook.retryConfig?.maxRetries || 0;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const response = await fetch(webhook.url, {
          method: webhook.method,
          headers: {
            'Content-Type': 'application/json',
            ...this.buildAuthHeaders(webhook.authentication),
            ...webhook.headers,
          },
          body: webhook.method !== 'GET' ? JSON.stringify(webhook.body || payload) : undefined,
        });

        if (response.ok) {
          return; // Success
        }

        // Check if we should retry on this status code
        if (
          webhook.retryConfig?.retryOnStatusCodes?.includes(response.status) &&
          attempt < maxRetries
        ) {
          attempt++;
          await this.delay(webhook.retryConfig.backoffMs * attempt);
          continue;
        }

        throw new Error(`Webhook failed: HTTP ${response.status}`);
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        attempt++;
        await this.delay(webhook.retryConfig?.backoffMs || 1000);
      }
    }
  }

  private buildAuthHeaders(auth?: WebhookConfig['authentication']): Record<string, string> {
    if (!auth) return {};

    switch (auth.type) {
      case 'bearer':
        return { Authorization: `Bearer ${auth.token}` };
      case 'basic': {
        const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
        return { Authorization: `Basic ${credentials}` };
      }
      case 'apikey':
        return { [auth.apiKeyHeader || 'X-API-Key']: auth.apiKeyValue || '' };
      default:
        return {};
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
