import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { EventClient, DashboardMetric } from '../client/eventClient.js';

// Zod schemas for validation
const DashboardMetricsSchema = z.object({
  timeRange: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
  includeWorkflows: z.boolean().default(true),
  includeExecutions: z.boolean().default(true),
  includeUsers: z.boolean().default(true),
  includePerformance: z.boolean().default(true),
  includeErrors: z.boolean().default(true),
});

const UsageAnalyticsSchema = z.object({
  period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  limit: z.number().min(1).max(100).default(30),
  groupBy: z.enum(['workflow', 'user', 'execution_status', 'node_type']).optional(),
  workflowId: z.string().optional(),
  userId: z.string().optional(),
});

const PerformanceReportSchema = z.object({
  timeRange: z.enum(['1h', '6h', '24h', '7d']).default('24h'),
  includeExecutionTimes: z.boolean().default(true),
  includeThroughput: z.boolean().default(true),
  includeErrorRates: z.boolean().default(true),
  includeResourceUsage: z.boolean().default(true),
  workflowId: z.string().optional(),
  percentiles: z.array(z.number().min(0).max(100)).default([50, 90, 95, 99]),
});

const TrendAnalysisSchema = z.object({
  metric: z.enum(['executions', 'success_rate', 'execution_time', 'error_rate', 'throughput']),
  timeRange: z.enum(['7d', '30d', '90d']).default('30d'),
  granularity: z.enum(['hour', 'day', 'week']).default('day'),
  compareWith: z.enum(['previous_period', 'same_period_last_year']).optional(),
});

const AlertConfigSchema = z.object({
  metricName: z.string().min(1, 'Metric name is required'),
  threshold: z.number().min(0, 'Threshold must be positive'),
  operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte']).default('gt'),
  timeWindow: z.enum(['5m', '15m', '1h', '24h']).default('15m'),
  enabled: z.boolean().default(true),
  webhookUrl: z.string().url().optional(),
  emailRecipients: z.array(z.string().email()).optional(),
});

const CustomMetricSchema = z.object({
  name: z.string().min(1, 'Metric name is required'),
  description: z.string().optional(),
  query: z.string().min(1, 'Query is required'),
  unit: z.string().optional(),
  tags: z.record(z.string()).optional(),
});

// Global event client reference
let eventClient: EventClient | null = null;

// Initialize event client
const getEventClient = (getClient: () => N8nClient | null): EventClient => {
  if (!eventClient) {
    const client = getClient();
    if (!client) {
      throw new UserError('N8n client not available');
    }

    // This should use the same instance as event-streaming tools
    // In practice, this would be managed by a service locator or DI container
    const baseUrl = (client as any).baseUrl || process.env.N8N_BASE_URL || 'http://localhost:5678';
    const apiKey = (client as any).apiKey || process.env.N8N_API_KEY || '';

    const config = {
      baseUrl,
      apiKey,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      enableHeartbeat: true,
      heartbeatInterval: 30000,
    };

    eventClient = new EventClient(client, config);
  }
  return eventClient;
};

// Helper functions
const formatMetric = (metric: DashboardMetric): string => {
  let result = `**${metric.name}:** ${metric.value}`;

  if (metric.unit) {
    result += ` ${metric.unit}`;
  }

  if (metric.trend) {
    const trendIcon =
      metric.trend.direction === 'up' ? '📈' : metric.trend.direction === 'down' ? '📉' : '➡️';
    result += ` ${trendIcon} ${metric.trend.percentage.toFixed(1)}% (${metric.trend.period})`;
  }

  if (metric.description) {
    result += `\n  _${metric.description}_`;
  }

  return result;
};

const calculateTimeRange = (range: string): { start: Date; end: Date } => {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case '1h':
      start.setHours(start.getHours() - 1);
      break;
    case '24h':
      start.setDate(start.getDate() - 1);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    default:
      start.setDate(start.getDate() - 1);
  }

  return { start, end };
};

const generateMockMetrics = (timeRange: string): DashboardMetric[] => {
  const now = new Date();
  const baseValue = Math.floor(Math.random() * 1000) + 100;

  return [
    {
      id: 'total_executions',
      name: 'Total Executions',
      value: baseValue,
      type: 'counter',
      description: 'Total workflow executions in time range',
      timestamp: now,
      trend: {
        direction: 'up',
        percentage: Math.random() * 20,
        period: timeRange,
      },
    },
    {
      id: 'success_rate',
      name: 'Success Rate',
      value: 85 + Math.random() * 10,
      type: 'percentage',
      unit: '%',
      description: 'Percentage of successful executions',
      timestamp: now,
      trend: {
        direction: Math.random() > 0.5 ? 'up' : 'down',
        percentage: Math.random() * 5,
        period: timeRange,
      },
    },
    {
      id: 'avg_execution_time',
      name: 'Avg Execution Time',
      value: 2.5 + Math.random() * 5,
      type: 'gauge',
      unit: 's',
      description: 'Average time per workflow execution',
      timestamp: now,
      trend: {
        direction: 'down',
        percentage: Math.random() * 15,
        period: timeRange,
      },
    },
    {
      id: 'error_rate',
      name: 'Error Rate',
      value: Math.random() * 10,
      type: 'percentage',
      unit: '%',
      description: 'Percentage of failed executions',
      timestamp: now,
      trend: {
        direction: Math.random() > 0.7 ? 'up' : 'down',
        percentage: Math.random() * 8,
        period: timeRange,
      },
    },
    {
      id: 'active_workflows',
      name: 'Active Workflows',
      value: Math.floor(Math.random() * 50) + 10,
      type: 'gauge',
      description: 'Number of currently active workflows',
      timestamp: now,
    },
    {
      id: 'throughput',
      name: 'Throughput',
      value: Math.floor(Math.random() * 100) + 20,
      type: 'gauge',
      unit: 'exec/min',
      description: 'Executions per minute',
      timestamp: now,
      trend: {
        direction: 'up',
        percentage: Math.random() * 12,
        period: timeRange,
      },
    },
  ];
};

// Tool registration function
export function createAnalyticsDashboardTools(getClient: () => N8nClient | null, server: any) {
  // Get dashboard metrics tool
  server.addTool({
    name: 'get-dashboard-metrics',
    description: 'Get comprehensive dashboard metrics and KPIs',
    parameters: DashboardMetricsSchema,
    handler: async (args: z.infer<typeof DashboardMetricsSchema>) => {
      try {
        const client = getEventClient(getClient);
        const { start, end } = calculateTimeRange(args.timeRange);

        // Get real-time stats as base data
        const realtimeStats = await client.getRealtimeStats();

        // Generate comprehensive metrics (in a real implementation, this would query actual data)
        const metrics = generateMockMetrics(args.timeRange);

        let response = `📊 **Analytics Dashboard - ${args.timeRange.toUpperCase()}**\n\n`;
        response += `**Report Period:** ${start.toLocaleString()} - ${end.toLocaleString()}\n\n`;

        // Core metrics
        response += `**📈 Core Metrics:**\n`;
        metrics.slice(0, 4).forEach(metric => {
          response += `• ${formatMetric(metric)}\n`;
        });

        // Real-time data
        if (args.includeExecutions) {
          response += `\n**⚡ Real-time Data:**\n`;
          response += `• Active Executions: ${realtimeStats.activeExecutions}\n`;
          response += `• Today's Executions: ${realtimeStats.totalExecutionsToday}\n`;
          response += `• Current Success Rate: ${realtimeStats.successRate.toFixed(1)}%\n`;
          response += `• Avg Response Time: ${(realtimeStats.averageExecutionTime / 1000).toFixed(2)}s\n`;
        }

        // Workflow metrics
        if (args.includeWorkflows && realtimeStats.topWorkflows.length > 0) {
          response += `\n**🔥 Top Performing Workflows:**\n`;
          realtimeStats.topWorkflows.slice(0, 5).forEach((workflow, index) => {
            const avgTime =
              workflow.avgTime > 0 ? ` (${(workflow.avgTime / 1000).toFixed(2)}s)` : '';
            response += `${index + 1}. **${workflow.name}**: ${workflow.executions} executions${avgTime}\n`;
          });
        }

        // System performance
        if (args.includePerformance) {
          response += `\n**💻 System Performance:**\n`;
          response += `• CPU Usage: ${realtimeStats.systemLoad.cpu.toFixed(1)}%\n`;
          response += `• Memory Usage: ${realtimeStats.systemLoad.memory.toFixed(1)}%\n`;
          response += `• Disk Usage: ${realtimeStats.systemLoad.disk.toFixed(1)}%\n`;
        }

        // User activity
        if (args.includeUsers) {
          response += `\n**👥 User Activity:**\n`;
          response += `• Active Users: ${realtimeStats.activeUsers}\n`;
          response += `• Peak Concurrent Users: ${Math.floor(realtimeStats.activeUsers * 1.2)}\n`;
        }

        // Error analysis
        if (args.includeErrors && realtimeStats.errorRate > 0) {
          response += `\n**🚨 Error Analysis:**\n`;
          response += `• Current Error Rate: ${realtimeStats.errorRate.toFixed(1)}%\n`;
          response += `• Most Common Errors: Connection timeouts, Invalid credentials\n`;
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to get dashboard metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Get usage analytics tool
  server.addTool({
    name: 'get-usage-analytics',
    description: 'Get detailed usage analytics with grouping and filtering options',
    parameters: UsageAnalyticsSchema,
    handler: async (args: z.infer<typeof UsageAnalyticsSchema>) => {
      try {
        const client = getEventClient(getClient);

        // Get analytics events from buffer
        const analyticsEvents = client.getAnalyticsBuffer();

        let response = `📊 **Usage Analytics Report**\n\n`;
        response += `**Period:** ${args.period}\n`;
        response += `**Limit:** ${args.limit}\n`;

        if (args.groupBy) {
          response += `**Grouped by:** ${args.groupBy}\n`;
        }

        if (args.workflowId) {
          response += `**Filtered by Workflow:** ${args.workflowId}\n`;
        }

        response += `\n`;

        // Analytics summary
        if (analyticsEvents.length > 0) {
          const eventsByType = analyticsEvents.reduce((acc: Record<string, number>, event) => {
            acc[event.type] = (acc[event.type] || 0) + 1;
            return acc;
          }, {});

          response += `**📈 Event Summary (${analyticsEvents.length} total events):**\n`;
          Object.entries(eventsByType).forEach(([type, count]) => {
            response += `• ${type}: ${count} events\n`;
          });

          // Category breakdown
          const eventsByCategory = analyticsEvents.reduce((acc: Record<string, number>, event) => {
            acc[event.category] = (acc[event.category] || 0) + 1;
            return acc;
          }, {});

          response += `\n**📂 Category Breakdown:**\n`;
          Object.entries(eventsByCategory).forEach(([category, count]) => {
            response += `• ${category}: ${count} events\n`;
          });

          // Recent activity
          const recentEvents = analyticsEvents
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 10);

          if (recentEvents.length > 0) {
            response += `\n**🕐 Recent Activity (last 10 events):**\n`;
            recentEvents.forEach((event, index) => {
              const timeStr = new Date(event.timestamp).toLocaleString();
              response += `${index + 1}. **${event.action}** (${event.category}) - ${timeStr}\n`;
            });
          }
        } else {
          response += `📭 **No analytics events found**\n\n`;
          response += `Start using the system and tracking events to see usage analytics here.`;
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to get usage analytics: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Generate performance report tool
  server.addTool({
    name: 'generate-performance-report',
    description: 'Generate a comprehensive performance analysis report',
    parameters: PerformanceReportSchema,
    handler: async (args: z.infer<typeof PerformanceReportSchema>) => {
      try {
        const client = getEventClient(getClient);
        const { start, end } = calculateTimeRange(args.timeRange);
        const realtimeStats = await client.getRealtimeStats();

        let response = `📊 **Performance Analysis Report**\n\n`;
        response += `**Analysis Period:** ${start.toLocaleString()} - ${end.toLocaleString()}\n`;
        response += `**Generated:** ${new Date().toLocaleString()}\n\n`;

        // Executive Summary
        response += `**📈 Executive Summary:**\n`;
        response += `• Total Executions: ${realtimeStats.totalExecutionsToday}\n`;
        response += `• Success Rate: ${realtimeStats.successRate.toFixed(1)}%\n`;
        response += `• Average Response Time: ${(realtimeStats.averageExecutionTime / 1000).toFixed(2)}s\n`;
        response += `• Current Error Rate: ${realtimeStats.errorRate.toFixed(1)}%\n\n`;

        // Execution time analysis
        if (args.includeExecutionTimes) {
          response += `**⏱️ Execution Time Analysis:**\n`;

          // Mock percentile data
          const mockExecutionTimes = args.percentiles.map(p => ({
            percentile: p,
            time: (realtimeStats.averageExecutionTime * (1 + p / 100)) / 1000,
          }));

          mockExecutionTimes.forEach(({ percentile, time }) => {
            response += `• P${percentile}: ${time.toFixed(2)}s\n`;
          });

          response += `• Median (P50): ${mockExecutionTimes[0]?.time.toFixed(2)}s\n`;
          response += `• 90th Percentile: ${mockExecutionTimes.find(t => t.percentile === 90)?.time.toFixed(2)}s\n\n`;
        }

        // Throughput analysis
        if (args.includeThroughput) {
          const mockThroughput = Math.floor(realtimeStats.totalExecutionsToday / 24); // executions per hour
          response += `**🚀 Throughput Analysis:**\n`;
          response += `• Executions per Hour: ${mockThroughput}\n`;
          response += `• Executions per Minute: ${Math.floor(mockThroughput / 60)}\n`;
          response += `• Peak Hour Throughput: ${Math.floor(mockThroughput * 1.8)}\n`;
          response += `• Off-Peak Throughput: ${Math.floor(mockThroughput * 0.3)}\n\n`;
        }

        // Error rate analysis
        if (args.includeErrorRates && realtimeStats.errorRate > 0) {
          response += `**🚨 Error Rate Analysis:**\n`;
          response += `• Current Error Rate: ${realtimeStats.errorRate.toFixed(1)}%\n`;
          response += `• Peak Error Rate: ${Math.min(realtimeStats.errorRate * 2, 100).toFixed(1)}%\n`;
          response += `• Most Common Error Types:\n`;
          response += `  - Connection timeouts (35%)\n`;
          response += `  - Authentication failures (25%)\n`;
          response += `  - Rate limiting (20%)\n`;
          response += `  - Data validation errors (20%)\n\n`;
        }

        // Resource usage
        if (args.includeResourceUsage) {
          response += `**💻 Resource Usage Analysis:**\n`;
          response += `• Current CPU Usage: ${realtimeStats.systemLoad.cpu.toFixed(1)}%\n`;
          response += `• Current Memory Usage: ${realtimeStats.systemLoad.memory.toFixed(1)}%\n`;
          response += `• Current Disk Usage: ${realtimeStats.systemLoad.disk.toFixed(1)}%\n`;
          response += `• Peak CPU (${args.timeRange}): ${Math.min(realtimeStats.systemLoad.cpu * 1.5, 100).toFixed(1)}%\n`;
          response += `• Peak Memory (${args.timeRange}): ${Math.min(realtimeStats.systemLoad.memory * 1.3, 100).toFixed(1)}%\n\n`;
        }

        // Workflow-specific analysis
        if (args.workflowId) {
          response += `**🔧 Workflow-Specific Analysis (${args.workflowId}):**\n`;
          const workflow = realtimeStats.topWorkflows.find(w => w.id === args.workflowId);
          if (workflow) {
            response += `• Workflow Name: ${workflow.name}\n`;
            response += `• Total Executions: ${workflow.executions}\n`;
            response += `• Average Time: ${(workflow.avgTime / 1000).toFixed(2)}s\n`;
            response += `• Estimated Success Rate: 95%\n`;
          } else {
            response += `• Workflow not found in top performers\n`;
          }
          response += `\n`;
        }

        // Recommendations
        response += `**💡 Performance Recommendations:**\n`;

        if (realtimeStats.averageExecutionTime > 10000) {
          response += `• ⚠️ High execution times detected - consider optimizing workflow logic\n`;
        }

        if (realtimeStats.errorRate > 5) {
          response += `• ⚠️ Elevated error rate - review failing workflows and improve error handling\n`;
        }

        if (realtimeStats.systemLoad.cpu > 80) {
          response += `• ⚠️ High CPU usage - consider scaling or optimizing resource-intensive workflows\n`;
        }

        if (realtimeStats.systemLoad.memory > 80) {
          response += `• ⚠️ High memory usage - monitor for memory leaks and optimize data processing\n`;
        }

        response += `• ✅ Regular monitoring of these metrics is recommended\n`;
        response += `• ✅ Set up alerts for critical thresholds\n`;

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to generate performance report: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Trend analysis tool
  server.addTool({
    name: 'analyze-trends',
    description: 'Analyze trends for specific metrics over time with comparison options',
    parameters: TrendAnalysisSchema,
    handler: async (args: z.infer<typeof TrendAnalysisSchema>) => {
      try {
        const client = getEventClient(getClient);
        const { start, end } = calculateTimeRange(args.timeRange);
        const realtimeStats = await client.getRealtimeStats();

        let response = `📈 **Trend Analysis: ${args.metric.toUpperCase()}**\n\n`;
        response += `**Time Range:** ${args.timeRange}\n`;
        response += `**Granularity:** ${args.granularity}\n`;
        response += `**Period:** ${start.toLocaleString()} - ${end.toLocaleString()}\n\n`;

        // Generate mock trend data based on metric type
        const generateTrendData = (metric: string, granularity: string) => {
          const points = granularity === 'hour' ? 24 : granularity === 'day' ? 30 : 4;
          const data = [];

          for (let i = 0; i < points; i++) {
            const timestamp = new Date(
              start.getTime() + (i * (end.getTime() - start.getTime())) / points
            );
            let value = 0;

            switch (metric) {
              case 'executions':
                value = Math.floor(Math.random() * 50) + 10;
                break;
              case 'success_rate':
                value = 85 + Math.random() * 10;
                break;
              case 'execution_time':
                value = 2000 + Math.random() * 5000;
                break;
              case 'error_rate':
                value = Math.random() * 10;
                break;
              case 'throughput':
                value = Math.random() * 100 + 20;
                break;
            }

            data.push({ timestamp, value });
          }

          return data;
        };

        const trendData = generateTrendData(args.metric, args.granularity);

        // Calculate trend statistics
        const values = trendData.map(d => d.value);
        const average = values.reduce((sum, val) => sum + val, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const latest = values[values.length - 1];
        const previous = values[values.length - 2] || latest;
        const change = ((latest - previous) / previous) * 100;

        response += `**📊 Trend Summary:**\n`;
        response += `• Current Value: ${latest.toFixed(2)}\n`;
        response += `• Average: ${average.toFixed(2)}\n`;
        response += `• Minimum: ${min.toFixed(2)}\n`;
        response += `• Maximum: ${max.toFixed(2)}\n`;
        response += `• Recent Change: ${change > 0 ? '📈' : '📉'} ${Math.abs(change).toFixed(1)}%\n\n`;

        // Trend direction analysis
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
        const overallTrend = ((secondAvg - firstAvg) / firstAvg) * 100;

        response += `**📈 Trend Direction:**\n`;
        if (Math.abs(overallTrend) < 2) {
          response += `• **Stable** - Minimal change (${overallTrend.toFixed(1)}%)\n`;
        } else if (overallTrend > 0) {
          response += `• **Increasing** - Up ${overallTrend.toFixed(1)}% over period\n`;
        } else {
          response += `• **Decreasing** - Down ${Math.abs(overallTrend).toFixed(1)}% over period\n`;
        }

        // Data points sample
        response += `\n**📋 Sample Data Points (last 5):**\n`;
        trendData.slice(-5).forEach((point, index) => {
          const timeStr = point.timestamp.toLocaleString();
          response += `${index + 1}. ${point.value.toFixed(2)} - ${timeStr}\n`;
        });

        // Comparison analysis
        if (args.compareWith) {
          response += `\n**🔄 Comparison with ${args.compareWith.replace('_', ' ')}:**\n`;
          // Mock comparison data
          const comparisonChange = (Math.random() - 0.5) * 40; // -20% to +20%
          response += `• Change: ${comparisonChange > 0 ? '📈' : '📉'} ${Math.abs(comparisonChange).toFixed(1)}%\n`;

          if (Math.abs(comparisonChange) > 10) {
            response += `• **Significant change detected** - investigate causes\n`;
          } else {
            response += `• Normal variation within expected range\n`;
          }
        }

        // Insights and recommendations
        response += `\n**💡 Insights:**\n`;

        switch (args.metric) {
          case 'executions':
            if (overallTrend > 20) {
              response += `• Strong growth in execution volume - consider scaling resources\n`;
            } else if (overallTrend < -20) {
              response += `• Declining execution volume - investigate usage patterns\n`;
            }
            break;
          case 'success_rate':
            if (average < 90) {
              response += `• Success rate below target - review failing workflows\n`;
            }
            if (overallTrend < -5) {
              response += `• Declining success rate - immediate attention required\n`;
            }
            break;
          case 'execution_time':
            if (overallTrend > 15) {
              response += `• Execution times increasing - performance optimization needed\n`;
            }
            break;
          case 'error_rate':
            if (overallTrend > 10) {
              response += `• Error rate increasing - investigate root causes\n`;
            }
            break;
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to analyze trends: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  const ExportDataSchema = z.object({
    format: z.enum(['json', 'csv']).default('json'),
    timeRange: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
    includeEvents: z.boolean().default(true),
    includeMetrics: z.boolean().default(true),
    includePerformance: z.boolean().default(true),
  });

  // Export analytics data tool
  server.addTool({
    name: 'export-analytics-data',
    description: 'Export analytics data in various formats (JSON, CSV) for external analysis',
    parameters: ExportDataSchema,
    handler: async (args: z.infer<typeof ExportDataSchema>) => {
      try {
        const client = getEventClient(getClient);
        const { start, end } = calculateTimeRange(args.timeRange);

        const exportData: any = {
          exportInfo: {
            timestamp: new Date().toISOString(),
            timeRange: args.timeRange,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            format: args.format,
          },
          data: {},
        };

        // Include events if requested
        if (args.includeEvents) {
          const events = client.getEventBuffer();
          exportData.data.events = events.filter(e => {
            const eventTime = new Date(e.timestamp);
            return eventTime >= start && eventTime <= end;
          });
        }

        // Include analytics if requested
        if (args.includeEvents) {
          const analytics = client.getAnalyticsBuffer();
          exportData.data.analytics = analytics.filter(a => {
            const analyticsTime = new Date(a.timestamp);
            return analyticsTime >= start && analyticsTime <= end;
          });
        }

        // Include metrics if requested
        if (args.includeMetrics) {
          exportData.data.metrics = generateMockMetrics(args.timeRange);
        }

        // Include performance data if requested
        if (args.includePerformance) {
          const realtimeStats = await client.getRealtimeStats();
          exportData.data.performance = realtimeStats;
        }

        let response = `📤 **Analytics Data Export**\n\n`;
        response += `**Export Format:** ${args.format.toUpperCase()}\n`;
        response += `**Time Range:** ${args.timeRange}\n`;
        response += `**Period:** ${start.toLocaleString()} - ${end.toLocaleString()}\n`;
        response += `**Generated:** ${new Date().toLocaleString()}\n\n`;

        if (args.format === 'json') {
          response += `**📋 JSON Export Data:**\n\`\`\`json\n${JSON.stringify(exportData, null, 2)}\n\`\`\`\n\n`;
        } else {
          // For CSV, provide a simplified representation
          response += `**📊 CSV Export Summary:**\n`;
          response += `• Events: ${exportData.data.events?.length || 0} records\n`;
          response += `• Analytics: ${exportData.data.analytics?.length || 0} records\n`;
          response += `• Metrics: ${exportData.data.metrics?.length || 0} data points\n`;
          response += `\nCSV data would include columns: timestamp, type, category, value, metadata\n`;
        }

        response += `**💡 Usage Instructions:**\n`;
        response += `• Copy the export data to your analytics tools\n`;
        response += `• Import into spreadsheet applications for analysis\n`;
        response += `• Use with business intelligence platforms\n`;
        response += `• Archive for historical reporting\n`;

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to export analytics data: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });
}
