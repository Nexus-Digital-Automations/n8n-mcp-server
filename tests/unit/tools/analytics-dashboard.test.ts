import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { FastMCP } from 'fastmcp';
import { N8nClient } from '../../../src/client/n8nClient';
import { createAnalyticsDashboardTools } from '../../../src/tools/analytics-dashboard';
import { EventClient } from '../../../src/client/eventClient';

// Mock the EventClient
jest.mock('../../../src/client/eventClient');
const MockedEventClient = EventClient as jest.MockedClass<typeof EventClient>;

describe('Analytics Dashboard Tools', () => {
  let server: FastMCP;
  let mockClient: jest.Mocked<N8nClient>;
  let mockEventClient: jest.Mocked<EventClient>;
  let getClient: () => N8nClient | null;

  const mockRealtimeStats = {
    activeExecutions: 5,
    totalExecutionsToday: 120,
    successRate: 95.2,
    averageExecutionTime: 3500,
    errorRate: 4.8,
    activeUsers: 3,
    systemLoad: {
      cpu: 42.3,
      memory: 67.8,
      disk: 28.5,
    },
    topWorkflows: [
      {
        id: 'wf_1',
        name: 'Customer Onboarding',
        executions: 45,
        avgTime: 2200,
      },
      {
        id: 'wf_2',
        name: 'Invoice Processing',
        executions: 32,
        avgTime: 4800,
      },
      {
        id: 'wf_3',
        name: 'Email Campaign',
        executions: 28,
        avgTime: 1200,
      },
    ],
  };

  const mockAnalyticsEvents = [
    {
      type: 'workflow_execution' as const,
      category: 'automation',
      action: 'execute',
      label: 'test-workflow',
      timestamp: new Date('2023-01-01T12:00:00Z'),
    },
    {
      type: 'user_action' as const,
      category: 'ui',
      action: 'workflow_create',
      timestamp: new Date('2023-01-01T12:05:00Z'),
    },
    {
      type: 'system_event' as const,
      category: 'monitoring',
      action: 'health_check',
      timestamp: new Date('2023-01-01T12:10:00Z'),
    },
  ];

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
      getRealtimeStats: jest.fn(),
      getAnalyticsBuffer: jest.fn(),
      getEventBuffer: jest.fn(),
      connect: jest.fn(),
      on: jest.fn(),
    } as any;

    // Mock EventClient constructor
    MockedEventClient.mockImplementation(() => mockEventClient);

    // Setup getClient function
    getClient = jest.fn().mockReturnValue(mockClient);

    // Register tools
    createAnalyticsDashboardTools(getClient, server);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get-dashboard-metrics', () => {
    it('should return comprehensive dashboard metrics', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'get-dashboard-metrics',
          arguments: {
            timeRange: '24h',
            includeWorkflows: true,
            includeExecutions: true,
            includeUsers: true,
            includePerformance: true,
          },
        },
      });

      expect(result.content[0].text).toContain('Analytics Dashboard - 24H');
      expect(result.content[0].text).toContain('Core Metrics');
      expect(result.content[0].text).toContain('Real-time Data');
      expect(result.content[0].text).toContain('Active Executions: 5');
      expect(result.content[0].text).toContain('Success Rate: 95.2%');
      expect(result.content[0].text).toContain('Top Performing Workflows');
      expect(result.content[0].text).toContain('Customer Onboarding: 45 executions');
      expect(result.content[0].text).toContain('System Performance');
      expect(result.content[0].text).toContain('CPU Usage: 42.3%');
    });

    it('should handle different time ranges', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'get-dashboard-metrics',
          arguments: {
            timeRange: '7d',
            includeWorkflows: false,
            includeUsers: false,
          },
        },
      });

      expect(result.content[0].text).toContain('Analytics Dashboard - 7D');
      expect(result.content[0].text).toContain('Core Metrics');
      expect(result.content[0].text).not.toContain('Top Performing Workflows');
      expect(result.content[0].text).not.toContain('User Activity');
    });

    it('should include error analysis when error rate is high', async () => {
      const highErrorStats = {
        ...mockRealtimeStats,
        errorRate: 15.5,
      };
      mockEventClient.getRealtimeStats.mockResolvedValue(highErrorStats);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'get-dashboard-metrics',
          arguments: {
            timeRange: '24h',
            includeErrors: true,
          },
        },
      });

      expect(result.content[0].text).toContain('Error Analysis');
      expect(result.content[0].text).toContain('Current Error Rate: 15.5%');
    });
  });

  describe('get-usage-analytics', () => {
    it('should return usage analytics with event breakdown', async () => {
      mockEventClient.getAnalyticsBuffer.mockReturnValue(mockAnalyticsEvents);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'get-usage-analytics',
          arguments: {
            period: 'day',
            limit: 30,
          },
        },
      });

      expect(result.content[0].text).toContain('Usage Analytics Report');
      expect(result.content[0].text).toContain('Event Summary (3 total events)');
      expect(result.content[0].text).toContain('workflow_execution: 1 events');
      expect(result.content[0].text).toContain('user_action: 1 events');
      expect(result.content[0].text).toContain('system_event: 1 events');
      expect(result.content[0].text).toContain('Category Breakdown');
      expect(result.content[0].text).toContain('automation: 1 events');
      expect(result.content[0].text).toContain('Recent Activity');
    });

    it('should handle empty analytics buffer', async () => {
      mockEventClient.getAnalyticsBuffer.mockReturnValue([]);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'get-usage-analytics',
          arguments: {
            period: 'hour',
          },
        },
      });

      expect(result.content[0].text).toContain('No analytics events found');
      expect(result.content[0].text).toContain('Start using the system');
    });

    it('should handle filtered analytics', async () => {
      mockEventClient.getAnalyticsBuffer.mockReturnValue(mockAnalyticsEvents);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'get-usage-analytics',
          arguments: {
            period: 'day',
            groupBy: 'workflow',
            workflowId: 'wf_123',
          },
        },
      });

      expect(result.content[0].text).toContain('Grouped by: workflow');
      expect(result.content[0].text).toContain('Filtered by Workflow: wf_123');
    });
  });

  describe('generate-performance-report', () => {
    it('should generate comprehensive performance report', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'generate-performance-report',
          arguments: {
            timeRange: '24h',
            includeExecutionTimes: true,
            includeThroughput: true,
            includeErrorRates: true,
            includeResourceUsage: true,
            percentiles: [50, 90, 95, 99],
          },
        },
      });

      expect(result.content[0].text).toContain('Performance Analysis Report');
      expect(result.content[0].text).toContain('Executive Summary');
      expect(result.content[0].text).toContain('Total Executions: 120');
      expect(result.content[0].text).toContain('Execution Time Analysis');
      expect(result.content[0].text).toContain('P50:');
      expect(result.content[0].text).toContain('P90:');
      expect(result.content[0].text).toContain('Throughput Analysis');
      expect(result.content[0].text).toContain('Executions per Hour');
      expect(result.content[0].text).toContain('Resource Usage Analysis');
      expect(result.content[0].text).toContain('Performance Recommendations');
    });

    it('should include workflow-specific analysis', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'generate-performance-report',
          arguments: {
            timeRange: '7d',
            workflowId: 'wf_1',
          },
        },
      });

      expect(result.content[0].text).toContain('Workflow-Specific Analysis (wf_1)');
      expect(result.content[0].text).toContain('Customer Onboarding');
      expect(result.content[0].text).toContain('Total Executions: 45');
    });

    it('should provide recommendations based on metrics', async () => {
      const highResourceStats = {
        ...mockRealtimeStats,
        averageExecutionTime: 15000, // High execution time
        errorRate: 12.0, // High error rate
        systemLoad: {
          cpu: 85.0, // High CPU
          memory: 92.0, // High memory
          disk: 45.0,
        },
      };

      mockEventClient.getRealtimeStats.mockResolvedValue(highResourceStats);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'generate-performance-report',
          arguments: {
            timeRange: '24h',
          },
        },
      });

      expect(result.content[0].text).toContain('⚠️ High execution times detected');
      expect(result.content[0].text).toContain('⚠️ Elevated error rate');
      expect(result.content[0].text).toContain('⚠️ High CPU usage');
      expect(result.content[0].text).toContain('⚠️ High memory usage');
    });
  });

  describe('analyze-trends', () => {
    it('should analyze execution trends', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'analyze-trends',
          arguments: {
            metric: 'executions',
            timeRange: '30d',
            granularity: 'day',
          },
        },
      });

      expect(result.content[0].text).toContain('Trend Analysis: EXECUTIONS');
      expect(result.content[0].text).toContain('Time Range: 30d');
      expect(result.content[0].text).toContain('Granularity: day');
      expect(result.content[0].text).toContain('Trend Summary');
      expect(result.content[0].text).toContain('Current Value:');
      expect(result.content[0].text).toContain('Average:');
      expect(result.content[0].text).toContain('Trend Direction');
      expect(result.content[0].text).toContain('Sample Data Points');
    });

    it('should analyze success rate trends', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'analyze-trends',
          arguments: {
            metric: 'success_rate',
            timeRange: '7d',
            granularity: 'hour',
          },
        },
      });

      expect(result.content[0].text).toContain('Trend Analysis: SUCCESS_RATE');
      expect(result.content[0].text).toContain('Time Range: 7d');
      expect(result.content[0].text).toContain('Granularity: hour');
    });

    it('should include comparison analysis', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'analyze-trends',
          arguments: {
            metric: 'execution_time',
            timeRange: '30d',
            compareWith: 'previous_period',
          },
        },
      });

      expect(result.content[0].text).toContain('Comparison with previous period');
      expect(result.content[0].text).toContain('Change:');
    });

    it('should provide metric-specific insights', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);

      // Test error rate insights
      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'analyze-trends',
          arguments: {
            metric: 'error_rate',
            timeRange: '7d',
          },
        },
      });

      expect(result.content[0].text).toContain('Trend Analysis: ERROR_RATE');
      expect(result.content[0].text).toContain('Insights');
    });
  });

  describe('export-analytics-data', () => {
    it('should export analytics data in JSON format', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);
      mockEventClient.getEventBuffer.mockReturnValue([
        {
          id: 'evt_1',
          type: 'workflow_execution',
          timestamp: new Date('2023-01-01T12:00:00Z'),
          data: { status: 'success' },
        },
      ] as any);
      mockEventClient.getAnalyticsBuffer.mockReturnValue(mockAnalyticsEvents);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'export-analytics-data',
          arguments: {
            format: 'json',
            timeRange: '24h',
            includeEvents: true,
            includeMetrics: true,
            includePerformance: true,
          },
        },
      });

      expect(result.content[0].text).toContain('Analytics Data Export');
      expect(result.content[0].text).toContain('Export Format: JSON');
      expect(result.content[0].text).toContain('JSON Export Data');
      expect(result.content[0].text).toContain('exportInfo');
      expect(result.content[0].text).toContain('timestamp');
      expect(result.content[0].text).toContain('Usage Instructions');
    });

    it('should export analytics data in CSV format', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);
      mockEventClient.getEventBuffer.mockReturnValue([]);
      mockEventClient.getAnalyticsBuffer.mockReturnValue(mockAnalyticsEvents);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'export-analytics-data',
          arguments: {
            format: 'csv',
            timeRange: '7d',
            includeEvents: true,
            includeAnalytics: true,
          },
        },
      });

      expect(result.content[0].text).toContain('Export Format: CSV');
      expect(result.content[0].text).toContain('CSV Export Summary');
      expect(result.content[0].text).toContain('Events: 0 records');
      expect(result.content[0].text).toContain('Analytics: 3 records');
      expect(result.content[0].text).toContain('CSV data would include columns');
    });

    it('should handle different time ranges for export', async () => {
      mockEventClient.getRealtimeStats.mockResolvedValue(mockRealtimeStats);
      mockEventClient.getEventBuffer.mockReturnValue([]);
      mockEventClient.getAnalyticsBuffer.mockReturnValue([]);

      const result = await server.request({
        method: 'tools/call',
        params: {
          name: 'export-analytics-data',
          arguments: {
            format: 'json',
            timeRange: '30d',
            includeMetrics: true,
            includePerformance: false,
          },
        },
      });

      expect(result.content[0].text).toContain('Time Range: 30d');
      expect(result.content[0].text).toContain('Usage Instructions');
    });
  });

  describe('error handling', () => {
    it('should handle client not available error', async () => {
      const getClientError = jest.fn().mockReturnValue(null);

      // Create new server with error-prone client
      const errorServer = new FastMCP({ name: 'error-server', version: '1.0.0' });
      createAnalyticsDashboardTools(getClientError, errorServer);

      await expect(
        errorServer.request({
          method: 'tools/call',
          params: {
            name: 'get-dashboard-metrics',
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
            name: 'get-dashboard-metrics',
            arguments: {},
          },
        })
      ).rejects.toThrow('Failed to get dashboard metrics');
    });

    it('should handle trend analysis errors', async () => {
      mockEventClient.getRealtimeStats.mockRejectedValue(new Error('Stats unavailable'));

      await expect(
        server.request({
          method: 'tools/call',
          params: {
            name: 'analyze-trends',
            arguments: {
              metric: 'executions',
            },
          },
        })
      ).rejects.toThrow('Failed to analyze trends');
    });
  });

  describe('input validation', () => {
    it('should validate dashboard metrics parameters', async () => {
      await expect(
        server.request({
          method: 'tools/call',
          params: {
            name: 'get-dashboard-metrics',
            arguments: {
              timeRange: 'invalid-range',
            },
          },
        })
      ).rejects.toThrow();
    });

    it('should validate trend analysis parameters', async () => {
      await expect(
        server.request({
          method: 'tools/call',
          params: {
            name: 'analyze-trends',
            arguments: {
              metric: 'invalid-metric',
            },
          },
        })
      ).rejects.toThrow();
    });

    it('should validate export format parameters', async () => {
      await expect(
        server.request({
          method: 'tools/call',
          params: {
            name: 'export-analytics-data',
            arguments: {
              format: 'invalid-format',
            },
          },
        })
      ).rejects.toThrow();
    });
  });
});
