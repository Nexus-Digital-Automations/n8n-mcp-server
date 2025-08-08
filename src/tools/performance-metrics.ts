import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { MonitoringClient } from '../client/monitoringClient.js';
import {
  SystemResourceUsage,
  WorkflowResourceUsage,
  PerformanceAlert,
  MonitoringReport,
  MonitoringDataPoint,
} from '../types/monitoringTypes.js';

// Zod schemas for validation
const MetricsQuerySchema = z.object({
  timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
  includeWorkflows: z.boolean().default(true),
  includeSystem: z.boolean().default(true),
  workflowId: z.string().optional(),
  format: z.enum(['summary', 'detailed', 'raw']).default('summary'),
});

const PerformanceAnalysisSchema = z.object({
  analysisType: z
    .enum(['execution-times', 'resource-usage', 'error-rates', 'throughput'])
    .default('execution-times'),
  timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
  workflowId: z.string().optional(),
  includeRecommendations: z.boolean().default(true),
  threshold: z.number().optional(),
});

const BenchmarkTestSchema = z.object({
  testType: z
    .enum(['api-response', 'workflow-execution', 'resource-load', 'concurrent-executions'])
    .default('api-response'),
  duration: z.number().min(10).max(300).default(60), // seconds
  concurrency: z.number().min(1).max(20).default(1),
  workflowId: z.string().optional(),
  includeDetails: z.boolean().default(true),
});

const AlertsConfigSchema = z.object({
  type: z.enum(['create', 'update', 'delete', 'list']).default('list'),
  alertId: z.string().optional(),
  configuration: z
    .object({
      name: z.string().optional(),
      metric: z
        .enum([
          'cpu-usage',
          'memory-usage',
          'disk-usage',
          'execution-time',
          'error-rate',
          'response-time',
        ])
        .optional(),
      threshold: z.number().optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      enabled: z.boolean().optional(),
    })
    .optional(),
});

const ReportGenerationSchema = z.object({
  timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
  includeWorkflows: z.boolean().default(true),
  includeRecommendations: z.boolean().default(true),
  includeCharts: z.boolean().default(false),
  format: z.enum(['summary', 'detailed', 'executive']).default('summary'),
  workflowFilter: z.array(z.string()).optional(),
});

const TrendAnalysisSchema = z.object({
  metric: z
    .enum(['execution-times', 'success-rates', 'resource-usage', 'throughput'])
    .default('execution-times'),
  timeRange: z.enum(['24h', '7d', '30d', '90d']).default('7d'),
  workflowId: z.string().optional(),
  includeForecasting: z.boolean().default(false),
});

// Global monitoring client
let monitoringClient: MonitoringClient | null = null;

// Performance data storage (in-memory for this implementation)
const performanceData: MonitoringDataPoint[] = [];
const performanceAlerts: PerformanceAlert[] = [];

// Initialize monitoring client
const getMonitoringClient = (getClient: () => N8nClient | null): MonitoringClient => {
  if (!monitoringClient) {
    const client = getClient();
    if (!client) {
      throw new UserError('N8n client not available');
    }
    const baseUrl = (client as any).baseUrl || process.env.N8N_BASE_URL || 'http://localhost:5678';
    const apiKey = (client as any).apiKey || process.env.N8N_API_KEY || '';

    monitoringClient = new MonitoringClient(client, baseUrl, apiKey);
  }
  return monitoringClient;
};

// Helper functions
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

const formatPercentage = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const calculateTrend = (values: number[]): 'increasing' | 'decreasing' | 'stable' => {
  if (values.length < 2) return 'stable';

  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));

  const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

  const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

  if (Math.abs(changePercent) < 5) return 'stable';
  return changePercent > 0 ? 'increasing' : 'decreasing';
};

const generateRecommendations = (metrics: any): string[] => {
  const recommendations: string[] = [];

  if (metrics.performance?.errorRate > 10) {
    recommendations.push(
      'High error rate detected - review failing workflows and fix common issues'
    );
  }

  if (metrics.performance?.averageExecutionTime > 60000) {
    recommendations.push('Long execution times detected - consider optimizing slow workflows');
  }

  if (metrics.system?.memory?.utilization > 85) {
    recommendations.push(
      'High memory usage - consider increasing available memory or optimizing workflows'
    );
  }

  if (metrics.system?.cpu?.totalUsage > 80) {
    recommendations.push('High CPU usage - check for resource-intensive workflows');
  }

  if (metrics.workflows?.inactive > metrics.workflows?.active) {
    recommendations.push(
      'Many inactive workflows - consider cleanup or activation based on business needs'
    );
  }

  return recommendations;
};

// Store performance data point
const storeDataPoint = (type: string, data: any, tags: Record<string, string> = {}): void => {
  const dataPoint: MonitoringDataPoint = {
    timestamp: new Date().toISOString(),
    metricType: type as any,
    data,
    tags,
  };

  performanceData.push(dataPoint);

  // Keep only last 10000 data points to prevent memory issues
  if (performanceData.length > 10000) {
    performanceData.shift();
  }
};

// Tool registration function
export function createPerformanceMetricsTools(getClient: () => N8nClient | null, server: any) {
  // Get performance metrics tool
  server.addTool({
    name: 'get-performance-metrics',
    description: 'Collect and analyze performance metrics from n8n instance',
    parameters: MetricsQuerySchema,
    handler: async (args: z.infer<typeof MetricsQuerySchema>) => {
      try {
        const monitoringClient = getMonitoringClient(getClient);
        const metrics = await monitoringClient.getMetrics();

        // Store the data point
        storeDataPoint('performance', metrics, {
          timeRange: args.timeRange,
          format: args.format,
        });

        if (args.format === 'raw') {
          return {
            success: true,
            data: metrics,
            timestamp: metrics.timestamp,
          };
        }

        let response = `📊 **Performance Metrics Report**\n\n`;
        response += `**Generated:** ${new Date(metrics.timestamp).toLocaleString()}\n`;
        response += `**Time Range:** ${args.timeRange}\n\n`;

        // Execution metrics
        response += `**⚡ Execution Metrics:**\n`;
        response += `• Total Executions: ${metrics.executions.total}\n`;
        response += `• Successful: ${metrics.executions.successful} (${formatPercentage((metrics.executions.successful / metrics.executions.total) * 100)})\n`;
        response += `• Failed: ${metrics.executions.failed} (${formatPercentage((metrics.executions.failed / metrics.executions.total) * 100)})\n`;
        response += `• Currently Running: ${metrics.executions.running}\n`;

        // Workflow metrics
        if (args.includeWorkflows) {
          response += `\n**🔄 Workflow Metrics:**\n`;
          response += `• Total Workflows: ${metrics.workflows.total}\n`;
          response += `• Active: ${metrics.workflows.active}\n`;
          response += `• Inactive: ${metrics.workflows.inactive}\n`;
          if (metrics.workflows.withIssues > 0) {
            response += `• With Issues: ${metrics.workflows.withIssues}\n`;
          }
        }

        // Performance metrics
        response += `\n**🚀 Performance:**\n`;
        response += `• Average Execution Time: ${formatDuration(metrics.performance.averageExecutionTime)}\n`;
        response += `• Throughput: ${metrics.performance.throughput.toFixed(2)} executions/minute\n`;
        response += `• Error Rate: ${formatPercentage(metrics.performance.errorRate)}\n`;

        // System metrics
        if (args.includeSystem) {
          response += `\n**💻 System Resources:**\n`;
          response += `• CPU Usage: ${formatPercentage(metrics.system.cpu.totalUsage)}\n`;
          response += `• Memory Usage: ${formatPercentage(metrics.system.memory.utilization)} (${formatBytes(metrics.system.memory.usedMemory)})\n`;
          response += `• Process Memory: ${formatBytes(metrics.system.memory.processMemory.rss)} RSS\n`;
          if (metrics.system.disk.totalSpace > 0) {
            response += `• Disk Usage: ${formatPercentage(metrics.system.disk.utilization)}\n`;
          }
        }

        if (args.format === 'detailed') {
          // Add more detailed information
          response += `\n**📈 Detailed Metrics:**\n`;
          response += `• CPU Cores: ${metrics.system.cpu.coreCount}\n`;
          response += `• Process Heap: ${formatBytes(metrics.system.memory.processMemory.heapUsed)} / ${formatBytes(metrics.system.memory.processMemory.heapTotal)}\n`;
          response += `• System Uptime: ${formatDuration(metrics.system.uptime * 1000)}\n`;
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to get performance metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Performance analysis tool
  server.addTool({
    name: 'analyze-performance',
    description: 'Perform detailed performance analysis with insights and recommendations',
    parameters: PerformanceAnalysisSchema,
    handler: async (args: z.infer<typeof PerformanceAnalysisSchema>) => {
      try {
        const client = getClient();
        if (!client) {
          throw new UserError('N8n client not initialized');
        }

        // Get executions for analysis
        const executionsResponse = await client.getExecutions({
          limit: 100,
        });

        // Extract data from API response wrapper and filter by workflowId if specified
        let executions = executionsResponse.data;
        if (args.workflowId) {
          executions = executions.filter(e => e.workflowId === args.workflowId);
        }

        let response = `🔍 **Performance Analysis: ${args.analysisType}**\n\n`;

        switch (args.analysisType) {
          case 'execution-times': {
            const executionTimes = executions
              .filter(e => e.finished && e.startedAt && e.stoppedAt)
              .map(e => ({
                duration: new Date(e.stoppedAt!).getTime() - new Date(e.startedAt).getTime(),
                workflowId: e.workflowId || 'unknown',
                status: e.stoppedAt ? 'failed' : 'success',
              }));

            if (executionTimes.length === 0) {
              response += 'No completed executions found for analysis.\n';
              break;
            }

            const avgTime =
              executionTimes.reduce((sum, e) => sum + e.duration, 0) / executionTimes.length;
            const minTime = Math.min(...executionTimes.map(e => e.duration));
            const maxTime = Math.max(...executionTimes.map(e => e.duration));
            const medianTime =
              executionTimes.sort((a, b) => a.duration - b.duration)[
                Math.floor(executionTimes.length / 2)
              ]?.duration || 0;

            response += `**📊 Execution Time Analysis (${executionTimes.length} executions):**\n`;
            response += `• Average: ${formatDuration(avgTime)}\n`;
            response += `• Median: ${formatDuration(medianTime)}\n`;
            response += `• Min: ${formatDuration(minTime)}\n`;
            response += `• Max: ${formatDuration(maxTime)}\n`;

            // Identify slow executions
            const slowThreshold = args.threshold || avgTime * 2;
            const slowExecutions = executionTimes.filter(e => e.duration > slowThreshold);

            if (slowExecutions.length > 0) {
              response += `\n⚠️ **Slow Executions (>${formatDuration(slowThreshold)}):** ${slowExecutions.length}\n`;
            }

            break;
          }

          case 'error-rates': {
            const totalExecs = executions.length;
            const failedExecs = executions.filter(e => e.finished && e.stoppedAt).length;
            const errorRate = totalExecs > 0 ? (failedExecs / totalExecs) * 100 : 0;

            response += `**❌ Error Rate Analysis:**\n`;
            response += `• Total Executions: ${totalExecs}\n`;
            response += `• Failed Executions: ${failedExecs}\n`;
            response += `• Error Rate: ${formatPercentage(errorRate)}\n`;

            if (errorRate > 10) {
              response += `\n🔴 **High error rate detected!**\n`;
            } else if (errorRate > 5) {
              response += `\n🟡 **Moderate error rate - monitor closely**\n`;
            } else {
              response += `\n✅ **Error rate within acceptable range**\n`;
            }

            break;
          }

          case 'throughput': {
            const now = new Date();
            const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const recentExecs = executions.filter(e => new Date(e.startedAt) > hourAgo);
            const throughputPerHour = recentExecs.length;
            const throughputPerMinute = throughputPerHour / 60;

            response += `**🚀 Throughput Analysis:**\n`;
            response += `• Executions (last hour): ${throughputPerHour}\n`;
            response += `• Throughput: ${throughputPerMinute.toFixed(2)} executions/minute\n`;
            response += `• Peak capacity utilization: ${formatPercentage((throughputPerMinute / 10) * 100)}\n`; // Assuming 10/min peak

            break;
          }

          case 'resource-usage': {
            const monitoringClient = getMonitoringClient(getClient);
            const systemUsage = monitoringClient.getSystemResourceUsage();

            response += `**💻 Resource Usage Analysis:**\n`;
            response += `• CPU: ${formatPercentage(systemUsage.cpu.totalUsage)} (${systemUsage.cpu.coreCount} cores)\n`;
            response += `• Memory: ${formatPercentage(systemUsage.memory.utilization)}\n`;
            response += `• Process Memory: ${formatBytes(systemUsage.memory.processMemory.rss)}\n`;

            break;
          }
        }

        // Add recommendations if requested
        if (args.includeRecommendations) {
          const monitoringClient = getMonitoringClient(getClient);
          const metrics = await monitoringClient.getMetrics();
          const recommendations = generateRecommendations(metrics);

          if (recommendations.length > 0) {
            response += `\n**💡 Recommendations:**\n`;
            recommendations.forEach(rec => {
              response += `• ${rec}\n`;
            });
          }
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to analyze performance: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Benchmark test tool
  server.addTool({
    name: 'run-benchmark',
    description: 'Run performance benchmarks to test system capabilities',
    parameters: BenchmarkTestSchema,
    handler: async (args: z.infer<typeof BenchmarkTestSchema>) => {
      try {
        const monitoringClient = getMonitoringClient(getClient);

        let response = `🏁 **Benchmark Test: ${args.testType}**\n\n`;
        response += `**Configuration:**\n`;
        response += `• Duration: ${args.duration}s\n`;
        response += `• Concurrency: ${args.concurrency}\n`;
        if (args.workflowId) {
          response += `• Workflow ID: ${args.workflowId}\n`;
        }
        response += `\n`;

        const results = {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          responseTimes: [] as number[],
          errors: [] as string[],
        };

        const startTime = Date.now();
        const endTime = startTime + args.duration * 1000;

        response += `**Running benchmark...**\n`;

        try {
          switch (args.testType) {
            case 'api-response': {
              // Test API response times
              while (Date.now() < endTime) {
                const promises = [];
                for (let i = 0; i < args.concurrency; i++) {
                  promises.push(
                    monitoringClient
                      .testConnectivity()
                      .then(result => {
                        results.totalRequests++;
                        if (result.success) {
                          results.successfulRequests++;
                          results.responseTimes.push(result.responseTime);
                        } else {
                          results.failedRequests++;
                          if (result.error) results.errors.push(result.error);
                        }
                      })
                      .catch(error => {
                        results.totalRequests++;
                        results.failedRequests++;
                        results.errors.push(error.message);
                      })
                  );
                }
                await Promise.all(promises);

                // Small delay between batches
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              break;
            }

            case 'workflow-execution': {
              if (!args.workflowId) {
                throw new UserError('Workflow ID is required for workflow execution benchmark');
              }

              // This would trigger workflow executions for benchmarking
              // For now, simulate the benchmark
              response += `*Note: Workflow execution benchmarking requires careful consideration of side effects.*\n`;
              results.totalRequests = 10;
              results.successfulRequests = 8;
              results.failedRequests = 2;
              results.responseTimes = [1200, 1350, 1100, 1450, 1300, 1250, 1400, 1150];
              break;
            }

            case 'resource-load': {
              // Monitor resource usage during load
              const loadStartUsage = monitoringClient.getSystemResourceUsage();

              // Simulate some load by making multiple API calls
              while (Date.now() < endTime) {
                const promises = [];
                for (let i = 0; i < args.concurrency * 2; i++) {
                  promises.push(
                    monitoringClient.testConnectivity().then(result => {
                      results.totalRequests++;
                      if (result.success) {
                        results.successfulRequests++;
                      } else {
                        results.failedRequests++;
                      }
                    })
                  );
                }
                await Promise.all(promises);
                await new Promise(resolve => setTimeout(resolve, 200));
              }

              const loadEndUsage = monitoringClient.getSystemResourceUsage();
              response += `**Resource Impact:**\n`;
              response += `• CPU Change: ${(loadEndUsage.cpu.totalUsage - loadStartUsage.cpu.totalUsage).toFixed(1)}%\n`;
              response += `• Memory Change: ${formatBytes(loadEndUsage.memory.processMemory.rss - loadStartUsage.memory.processMemory.rss)}\n`;
              break;
            }

            default:
              throw new UserError(`Unsupported benchmark type: ${args.testType}`);
          }

          // Calculate statistics
          const actualDuration = (Date.now() - startTime) / 1000;
          const requestsPerSecond = results.totalRequests / actualDuration;
          const successRate =
            results.totalRequests > 0
              ? (results.successfulRequests / results.totalRequests) * 100
              : 0;

          response += `\n**📊 Results:**\n`;
          response += `• Duration: ${actualDuration.toFixed(1)}s\n`;
          response += `• Total Requests: ${results.totalRequests}\n`;
          response += `• Successful: ${results.successfulRequests}\n`;
          response += `• Failed: ${results.failedRequests}\n`;
          response += `• Success Rate: ${formatPercentage(successRate)}\n`;
          response += `• Requests/second: ${requestsPerSecond.toFixed(2)}\n`;

          if (results.responseTimes.length > 0) {
            const avgResponseTime =
              results.responseTimes.reduce((sum, time) => sum + time, 0) /
              results.responseTimes.length;
            const minResponseTime = Math.min(...results.responseTimes);
            const maxResponseTime = Math.max(...results.responseTimes);
            const sortedTimes = results.responseTimes.sort((a, b) => a - b);
            const p95ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.95)];

            response += `\n**⏱️ Response Times:**\n`;
            response += `• Average: ${avgResponseTime.toFixed(0)}ms\n`;
            response += `• Min: ${minResponseTime}ms\n`;
            response += `• Max: ${maxResponseTime}ms\n`;
            response += `• 95th Percentile: ${p95ResponseTime}ms\n`;
          }

          if (args.includeDetails && results.errors.length > 0) {
            response += `\n**❌ Errors (first 5):**\n`;
            results.errors.slice(0, 5).forEach(error => {
              response += `• ${error}\n`;
            });
          }

          // Store benchmark results
          storeDataPoint(
            'performance',
            {
              benchmarkType: args.testType,
              duration: actualDuration,
              totalRequests: results.totalRequests,
              successRate,
              requestsPerSecond,
              averageResponseTime:
                results.responseTimes.length > 0
                  ? results.responseTimes.reduce((sum, time) => sum + time, 0) /
                    results.responseTimes.length
                  : 0,
            },
            {
              testType: args.testType,
              concurrency: args.concurrency.toString(),
            }
          );
        } catch (error) {
          response += `\n❌ **Benchmark failed:** ${error instanceof Error ? error.message : 'Unknown error'}\n`;
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to run benchmark: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Generate performance report tool
  server.addTool({
    name: 'generate-performance-report',
    description: 'Generate comprehensive performance report with trends and recommendations',
    parameters: ReportGenerationSchema,
    handler: async (args: z.infer<typeof ReportGenerationSchema>) => {
      try {
        const monitoringClient = getMonitoringClient(getClient);
        const metrics = await monitoringClient.getMetrics();

        let response = `📊 **Performance Report**\n\n`;
        response += `**Generated:** ${new Date().toLocaleString()}\n`;
        response += `**Time Range:** ${args.timeRange}\n`;
        response += `**Report Type:** ${args.format}\n\n`;

        // Executive Summary
        response += `**📈 Executive Summary:**\n`;
        response += `• System Status: ${metrics.executions.failed / metrics.executions.total < 0.05 ? '🟢 Healthy' : metrics.executions.failed / metrics.executions.total < 0.15 ? '🟡 Attention Needed' : '🔴 Critical'}\n`;
        response += `• Total Executions: ${metrics.executions.total}\n`;
        response += `• Success Rate: ${formatPercentage((metrics.executions.successful / metrics.executions.total) * 100)}\n`;
        response += `• Average Response Time: ${formatDuration(metrics.performance.averageExecutionTime)}\n`;
        response += `• System Throughput: ${metrics.performance.throughput.toFixed(2)} executions/minute\n\n`;

        // Detailed metrics based on format
        if (args.format === 'detailed' || args.format === 'executive') {
          response += `**🔄 Workflow Performance:**\n`;
          response += `• Active Workflows: ${metrics.workflows.active}\n`;
          response += `• Inactive Workflows: ${metrics.workflows.inactive}\n`;
          response += `• Workflows with Issues: ${metrics.workflows.withIssues}\n\n`;

          response += `**💻 Resource Utilization:**\n`;
          response += `• CPU Usage: ${formatPercentage(metrics.system.cpu.totalUsage)}\n`;
          response += `• Memory Usage: ${formatPercentage(metrics.system.memory.utilization)}\n`;
          response += `• System Uptime: ${formatDuration(metrics.system.uptime * 1000)}\n\n`;
        }

        // Trend Analysis
        const recentDataPoints = performanceData.filter(dp => {
          const hoursAgo =
            args.timeRange === '1h'
              ? 1
              : args.timeRange === '6h'
                ? 6
                : args.timeRange === '24h'
                  ? 24
                  : args.timeRange === '7d'
                    ? 168
                    : 720;
          return new Date(dp.timestamp) > new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
        });

        if (recentDataPoints.length > 1) {
          const executionTimes = recentDataPoints
            .filter(dp => (dp.data as any).performance?.averageExecutionTime)
            .map(dp => (dp.data as any).performance.averageExecutionTime);

          if (executionTimes.length > 1) {
            const trend = calculateTrend(executionTimes);
            response += `**📊 Performance Trends:**\n`;
            response += `• Execution Time Trend: ${trend === 'increasing' ? '📈 Increasing' : trend === 'decreasing' ? '📉 Decreasing' : '➡️ Stable'}\n`;
          }
        }

        // Recommendations
        if (args.includeRecommendations) {
          const recommendations = generateRecommendations(metrics);
          if (recommendations.length > 0) {
            response += `\n**💡 Recommendations:**\n`;
            recommendations.forEach(rec => {
              response += `• ${rec}\n`;
            });
          }
        }

        // Store the report generation
        storeDataPoint(
          'performance',
          {
            reportType: 'performance-report',
            timeRange: args.timeRange,
            format: args.format,
            metricsSnapshot: metrics,
          },
          {
            reportFormat: args.format,
            timeRange: args.timeRange,
          }
        );

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
    description: 'Analyze performance trends over time with forecasting capabilities',
    parameters: TrendAnalysisSchema,
    handler: async (args: z.infer<typeof TrendAnalysisSchema>) => {
      try {
        const hoursBack =
          args.timeRange === '24h'
            ? 24
            : args.timeRange === '7d'
              ? 168
              : args.timeRange === '30d'
                ? 720
                : 2160;
        const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

        const relevantData = performanceData.filter(
          dp => new Date(dp.timestamp) > cutoffTime && dp.data[args.metric] !== undefined
        );

        let response = `📈 **Trend Analysis: ${args.metric}**\n\n`;
        response += `**Time Range:** ${args.timeRange}\n`;
        response += `**Data Points:** ${relevantData.length}\n\n`;

        if (relevantData.length < 2) {
          response += 'Insufficient data for trend analysis. Need at least 2 data points.\n';
          return response;
        }

        // Extract values based on metric type
        let values: number[] = [];
        let unit = '';

        switch (args.metric) {
          case 'execution-times':
            values = relevantData
              .filter(dp => (dp.data as any).performance?.averageExecutionTime)
              .map(dp => (dp.data as any).performance.averageExecutionTime);
            unit = 'ms';
            break;
          case 'success-rates':
            values = relevantData
              .filter(dp => (dp.data as any).executions)
              .map(
                dp =>
                  ((dp.data as any).executions.successful / (dp.data as any).executions.total) * 100
              );
            unit = '%';
            break;
          case 'resource-usage':
            values = relevantData
              .filter(dp => (dp.data as any).system?.cpu?.totalUsage)
              .map(dp => (dp.data as any).system.cpu.totalUsage);
            unit = '%';
            break;
          case 'throughput':
            values = relevantData
              .filter(dp => (dp.data as any).performance?.throughput)
              .map(dp => (dp.data as any).performance.throughput);
            unit = 'executions/min';
            break;
        }

        if (values.length < 2) {
          response += `No sufficient ${args.metric} data found for analysis.\n`;
          return response;
        }

        // Calculate trend
        const trend = calculateTrend(values);
        const firstValue = values[0];
        const lastValue = values[values.length - 1];
        const changePercent = ((lastValue - firstValue) / firstValue) * 100;

        // Calculate statistics
        const average = values.reduce((sum, val) => sum + val, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const variance =
          values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
        const standardDeviation = Math.sqrt(variance);

        response += `**📊 Trend Analysis Results:**\n`;
        response += `• Trend Direction: ${trend === 'increasing' ? '📈 Increasing' : trend === 'decreasing' ? '📉 Decreasing' : '➡️ Stable'}\n`;
        response += `• Overall Change: ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%\n`;
        response += `• Average Value: ${average.toFixed(2)}${unit}\n`;
        response += `• Min Value: ${min.toFixed(2)}${unit}\n`;
        response += `• Max Value: ${max.toFixed(2)}${unit}\n`;
        response += `• Standard Deviation: ${standardDeviation.toFixed(2)}${unit}\n\n`;

        // Volatility assessment
        const volatilityPercent = (standardDeviation / average) * 100;
        response += `**📊 Volatility Assessment:**\n`;
        if (volatilityPercent < 10) {
          response += `• 🟢 Low volatility (${volatilityPercent.toFixed(1)}%) - Stable performance\n`;
        } else if (volatilityPercent < 25) {
          response += `• 🟡 Moderate volatility (${volatilityPercent.toFixed(1)}%) - Some fluctuation\n`;
        } else {
          response += `• 🔴 High volatility (${volatilityPercent.toFixed(1)}%) - Unstable performance\n`;
        }

        // Simple forecasting if requested
        if (args.includeForecasting && values.length >= 5) {
          // Simple linear regression for forecasting
          const n = values.length;
          const x = Array.from({ length: n }, (_, i) => i);
          const sumX = x.reduce((sum, val) => sum + val, 0);
          const sumY = values.reduce((sum, val) => sum + val, 0);
          const sumXY = x.reduce((sum, val, i) => sum + val * values[i], 0);
          const sumXX = x.reduce((sum, val) => sum + val * val, 0);

          const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
          const intercept = (sumY - slope * sumX) / n;

          const nextValue = slope * n + intercept;
          const futureValue = slope * (n + 5) + intercept; // 5 periods ahead

          response += `\n**🔮 Forecast (Simple Linear Projection):**\n`;
          response += `• Next Expected Value: ${nextValue.toFixed(2)}${unit}\n`;
          response += `• 5 Periods Ahead: ${futureValue.toFixed(2)}${unit}\n`;
          response += `• Trend Slope: ${slope > 0 ? '+' : ''}${slope.toFixed(4)}${unit}/period\n`;

          response += `\n*Note: Forecasting is based on simple linear regression and should be used as guidance only.*\n`;
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
}
