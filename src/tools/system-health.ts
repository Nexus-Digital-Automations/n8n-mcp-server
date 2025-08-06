import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { MonitoringClient } from '../client/monitoringClient.js';
import {
  ResourceThresholds,
} from '../types/monitoringTypes.js';

// Zod schemas for validation
const HealthCheckSchema = z.object({
  includeDetails: z.boolean().default(true),
  includeDiagnostics: z.boolean().default(false),
  includeRecommendations: z.boolean().default(true),
});

const DiagnosticsSchema = z.object({
  includeEnvironment: z.boolean().default(true),
  includeConnectivity: z.boolean().default(true),
  includeResources: z.boolean().default(true),
  verbose: z.boolean().default(false),
});

const WorkflowHealthSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  includeNodes: z.boolean().default(true),
  includeRecentExecutions: z.boolean().default(true),
  executionLimit: z.number().min(1).max(100).default(10),
});

const ResourceThresholdSchema = z.object({
  cpu: z.object({
    warning: z.number().min(0).max(100).default(75),
    critical: z.number().min(0).max(100).default(90),
  }).optional(),
  memory: z.object({
    warning: z.number().min(0).max(100).default(80),
    critical: z.number().min(0).max(100).default(95),
  }).optional(),
  disk: z.object({
    warning: z.number().min(0).max(100).default(85),
    critical: z.number().min(0).max(100).default(95),
  }).optional(),
  executionTime: z.object({
    warning: z.number().min(0).default(30000), // 30 seconds
    critical: z.number().min(0).default(120000), // 2 minutes
  }).optional(),
  errorRate: z.object({
    warning: z.number().min(0).max(100).default(5),
    critical: z.number().min(0).max(100).default(15),
  }).optional(),
  responseTime: z.object({
    warning: z.number().min(0).default(1000), // 1 second
    critical: z.number().min(0).default(3000), // 3 seconds
  }).optional(),
});


const ConnectivityTestSchema = z.object({
  includeLatency: z.boolean().default(true),
  timeout: z.number().min(1000).max(30000).default(5000), // 5 second default timeout
  retries: z.number().min(0).max(5).default(1),
});

// Global monitoring client instance
let monitoringClient: MonitoringClient | null = null;

// Initialize monitoring client
const getMonitoringClient = (getClient: () => N8nClient | null): MonitoringClient => {
  if (!monitoringClient) {
    const client = getClient();
    if (!client) {
      throw new UserError('N8n client not available');
    }
    // Extract baseUrl and apiKey from client
    const baseUrl = (client as any).baseUrl || process.env.N8N_BASE_URL || 'http://localhost:5678';
    const apiKey = (client as any).apiKey || process.env.N8N_API_KEY || '';
    
    monitoringClient = new MonitoringClient(client, baseUrl, apiKey);
  }
  return monitoringClient;
};

// Helper functions
const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getHealthStatusIcon = (status: string): string => {
  switch (status) {
    case 'healthy': return '✅';
    case 'warning': return '⚠️';
    case 'critical': return '🔴';
    case 'degraded': return '🟡';
    default: return '❓';
  }
};

const evaluateResourceThresholds = (
  usage: any, 
  thresholds: ResourceThresholds
): { status: 'healthy' | 'warning' | 'critical'; alerts: string[] } => {
  const alerts: string[] = [];
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';

  // Check CPU
  if (usage.cpu?.totalUsage >= thresholds.cpu.critical) {
    alerts.push(`Critical CPU usage: ${usage.cpu.totalUsage.toFixed(1)}%`);
    status = 'critical';
  } else if (usage.cpu?.totalUsage >= thresholds.cpu.warning) {
    alerts.push(`High CPU usage: ${usage.cpu.totalUsage.toFixed(1)}%`);
    if (status === 'healthy') status = 'warning';
  }

  // Check Memory
  if (usage.memory?.utilization >= thresholds.memory.critical) {
    alerts.push(`Critical memory usage: ${usage.memory.utilization.toFixed(1)}%`);
    status = 'critical';
  } else if (usage.memory?.utilization >= thresholds.memory.warning) {
    alerts.push(`High memory usage: ${usage.memory.utilization.toFixed(1)}%`);
    if (status === 'healthy') status = 'warning';
  }

  // Check Disk (if available)
  if (usage.disk?.utilization && usage.disk.utilization >= thresholds.disk.critical) {
    alerts.push(`Critical disk usage: ${usage.disk.utilization.toFixed(1)}%`);
    status = 'critical';
  } else if (usage.disk?.utilization && usage.disk.utilization >= thresholds.disk.warning) {
    alerts.push(`High disk usage: ${usage.disk.utilization.toFixed(1)}%`);
    if (status === 'healthy') status = 'warning';
  }

  return { status, alerts };
};

// Tool registration function
export function createSystemHealthTools(getClient: () => N8nClient | null, server: any) {
  // System health check tool
  server.addTool({
    name: 'check-system-health',
    description: 'Perform comprehensive system health check of the n8n instance',
    parameters: HealthCheckSchema,
    handler: async (args: z.infer<typeof HealthCheckSchema>) => {
      try {
        const monitoringClient = getMonitoringClient(getClient);

        // Get health check data
        const healthCheck = await monitoringClient.getHealthCheck();
        
        let diagnostics = null;
        if (args.includeDiagnostics) {
          diagnostics = await monitoringClient.getSystemDiagnostics();
        }

        // Format response
        const statusIcon = getHealthStatusIcon(healthCheck.status);
        let response = `${statusIcon} **System Health Status: ${healthCheck.status.toUpperCase()}**\n\n`;

        // Basic health information
        response += `**🔗 Database:** ${healthCheck.database.status} (${healthCheck.database.responseTime}ms)\n`;
        response += `**📁 Filesystem:** ${healthCheck.filesystem.status} (${healthCheck.filesystem.permissions})\n`;
        response += `**⏱️ Uptime:** ${formatUptime(healthCheck.uptime)}\n`;
        
        if (healthCheck.version && healthCheck.version !== 'unknown') {
          response += `**📦 Version:** ${healthCheck.version}\n`;
        }

        if (healthCheck.redis) {
          response += `**📊 Redis:** ${healthCheck.redis.status} (${healthCheck.redis.responseTime}ms)\n`;
        }

        // Include diagnostics if requested
        if (diagnostics && args.includeDetails) {
          response += `\n**🔍 System Diagnostics:**\n`;
          response += `**Node.js:** ${diagnostics.environment.nodeVersion}\n`;
          response += `**Platform:** ${diagnostics.environment.platform} (${diagnostics.environment.architecture})\n`;
          response += `**API Response:** ${diagnostics.connectivity.responseTime}ms\n`;

          if (diagnostics.overall.issues.length > 0) {
            response += `\n**⚠️ Issues Detected:**\n`;
            diagnostics.overall.issues.forEach((issue: string) => {
              response += `• ${issue}\n`;
            });
          }

          if (args.includeRecommendations && diagnostics.overall.recommendations.length > 0) {
            response += `\n**💡 Recommendations:**\n`;
            diagnostics.overall.recommendations.forEach((rec: string) => {
              response += `• ${rec}\n`;
            });
          }
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to check system health: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // System diagnostics tool
  server.addTool({
    name: 'get-system-diagnostics',
    description: 'Get detailed system diagnostics for troubleshooting',
    parameters: DiagnosticsSchema,
    handler: async (args: z.infer<typeof DiagnosticsSchema>) => {
      try {
        const monitoringClient = getMonitoringClient(getClient);
        const diagnostics = await monitoringClient.getSystemDiagnostics();

        let response = `🔍 **System Diagnostics Report**\n\n`;
        response += `**Generated:** ${new Date(diagnostics.timestamp).toLocaleString()}\n`;
        response += `**Overall Status:** ${getHealthStatusIcon(diagnostics.overall.status)} ${diagnostics.overall.status.toUpperCase()}\n\n`;

        // Connectivity information
        if (args.includeConnectivity) {
          response += `**🌐 Connectivity:**\n`;
          response += `• API Connection: ${diagnostics.connectivity.apiConnectivity ? '✅ Connected' : '❌ Disconnected'}\n`;
          response += `• Response Time: ${diagnostics.connectivity.responseTime}ms\n`;
          if (diagnostics.connectivity.error) {
            response += `• Error: ${diagnostics.connectivity.error}\n`;
          }
          response += `\n`;
        }

        // Environment information
        if (args.includeEnvironment) {
          response += `**💻 Environment:**\n`;
          response += `• Node.js Version: ${diagnostics.environment.nodeVersion}\n`;
          response += `• Platform: ${diagnostics.environment.platform}\n`;
          response += `• Architecture: ${diagnostics.environment.architecture}\n`;
          response += `• Process Uptime: ${formatUptime(diagnostics.environment.uptime)}\n`;
          response += `\n`;
        }

        // Resource usage
        if (args.includeResources) {
          const resources = diagnostics.resources;
          response += `**📊 Resource Usage:**\n`;
          response += `• CPU: ${resources.cpu.totalUsage.toFixed(1)}% (${resources.cpu.coreCount} cores)\n`;
          response += `• Memory: ${formatBytes(resources.memory.usedMemory)} / ${formatBytes(resources.memory.totalMemory)} (${resources.memory.utilization.toFixed(1)}%)\n`;
          response += `• Process Memory: ${formatBytes(resources.memory.processMemory.rss)} RSS, ${formatBytes(resources.memory.processMemory.heapUsed)} heap\n`;
          
          if (resources.disk.totalSpace > 0) {
            response += `• Disk: ${formatBytes(resources.disk.usedSpace)} / ${formatBytes(resources.disk.totalSpace)} (${resources.disk.utilization.toFixed(1)}%)\n`;
          }
          response += `\n`;
        }

        // Issues and recommendations
        if (diagnostics.overall.issues.length > 0) {
          response += `**⚠️ Issues Detected:**\n`;
          diagnostics.overall.issues.forEach((issue: string) => {
            response += `• ${issue}\n`;
          });
          response += `\n`;
        }

        if (diagnostics.overall.recommendations.length > 0) {
          response += `**💡 Recommendations:**\n`;
          diagnostics.overall.recommendations.forEach((rec: string) => {
            response += `• ${rec}\n`;
          });
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to get system diagnostics: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Workflow health check tool
  server.addTool({
    name: 'check-workflow-health',
    description: 'Check the health and performance of a specific workflow',
    parameters: WorkflowHealthSchema,
    handler: async (args: z.infer<typeof WorkflowHealthSchema>) => {
      try {
        const monitoringClient = getMonitoringClient(getClient);
        const diagnostics = await monitoringClient.getWorkflowDiagnostics(args.workflowId);

        const statusIcon = getHealthStatusIcon(diagnostics.health.status);
        let response = `${statusIcon} **Workflow Health: ${diagnostics.workflowName}**\n\n`;
        response += `**Status:** ${diagnostics.health.status.toUpperCase()}\n`;
        response += `**Success Rate:** ${diagnostics.performance.successRate.toFixed(1)}%\n`;
        
        if (diagnostics.performance.averageExecutionTime > 0) {
          response += `**Avg Execution Time:** ${(diagnostics.performance.averageExecutionTime / 1000).toFixed(2)}s\n`;
        }

        // Health issues
        if (diagnostics.health.issues.length > 0) {
          response += `\n**⚠️ Issues:**\n`;
          diagnostics.health.issues.forEach(issue => {
            response += `• ${issue}\n`;
          });
        }

        // Recommendations
        if (diagnostics.health.recommendations.length > 0) {
          response += `\n**💡 Recommendations:**\n`;
          diagnostics.health.recommendations.forEach(rec => {
            response += `• ${rec}\n`;
          });
        }

        // Recent executions
        if (args.includeRecentExecutions && diagnostics.performance.recentExecutions.length > 0) {
          response += `\n**📈 Recent Executions (${Math.min(diagnostics.performance.recentExecutions.length, args.executionLimit)}):**\n`;
          diagnostics.performance.recentExecutions
            .slice(0, args.executionLimit)
            .forEach(exec => {
              const timeStr = exec.executionTime > 0 ? ` (${(exec.executionTime / 1000).toFixed(2)}s)` : '';
              const statusEmoji = exec.status === 'success' ? '✅' : exec.status === 'failed' ? '❌' : '⏳';
              response += `• ${statusEmoji} ${exec.status}${timeStr} - ${new Date(exec.timestamp).toLocaleString()}\n`;
            });
        }

        // Node analysis
        if (args.includeNodes && diagnostics.nodes.length > 0) {
          response += `\n**🔧 Node Analysis (${diagnostics.nodes.length} nodes):**\n`;
          diagnostics.nodes.forEach(node => {
            const nodeStatus = node.issues.length > 0 ? '⚠️' : '✅';
            response += `• ${nodeStatus} **${node.name}** (${node.type})\n`;
            if (node.issues.length > 0) {
              node.issues.forEach(issue => {
                response += `  - ${issue}\n`;
              });
            }
          });
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to check workflow health: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Test connectivity tool
  server.addTool({
    name: 'test-connectivity',
    description: 'Test connectivity to n8n instance and measure response times',
    parameters: ConnectivityTestSchema,
    handler: async (args: z.infer<typeof ConnectivityTestSchema>) => {
      try {
        const monitoringClient = getMonitoringClient(getClient);
        
        const tests = [];
        for (let i = 0; i <= args.retries; i++) {
          const result = await monitoringClient.testConnectivity();
          tests.push(result);
          
          if (i < args.retries && !result.success) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        const successfulTests = tests.filter(t => t.success);
        const failedTests = tests.filter(t => !t.success);
        
        let response = `🌐 **Connectivity Test Results**\n\n`;
        response += `**Tests:** ${tests.length} (${successfulTests.length} successful, ${failedTests.length} failed)\n`;

        if (successfulTests.length > 0) {
          const avgResponseTime = successfulTests.reduce((sum, test) => sum + test.responseTime, 0) / successfulTests.length;
          const minResponseTime = Math.min(...successfulTests.map(t => t.responseTime));
          const maxResponseTime = Math.max(...successfulTests.map(t => t.responseTime));
          
          response += `**Success Rate:** ${(successfulTests.length / tests.length * 100).toFixed(1)}%\n`;
          response += `**Response Times:**\n`;
          response += `• Average: ${avgResponseTime.toFixed(0)}ms\n`;
          response += `• Min: ${minResponseTime}ms\n`;
          response += `• Max: ${maxResponseTime}ms\n`;
          
          // Assess response time
          if (avgResponseTime > 3000) {
            response += `⚠️ **High response times detected - consider checking network or server performance**\n`;
          } else if (avgResponseTime > 1000) {
            response += `🟡 **Moderate response times - monitor for trends**\n`;
          } else {
            response += `✅ **Good response times**\n`;
          }
        }

        if (failedTests.length > 0) {
          response += `\n**❌ Failed Tests:**\n`;
          failedTests.forEach((test, index) => {
            response += `• Test ${index + 1}: ${test.error}\n`;
          });
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to test connectivity: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Resource monitoring tool
  server.addTool({
    name: 'monitor-resources',
    description: 'Monitor system resources with configurable thresholds and alerts',
    parameters: ResourceThresholdSchema,
    handler: async (args: z.infer<typeof ResourceThresholdSchema>) => {
      try {
        const monitoringClient = getMonitoringClient(getClient);
        const systemUsage = monitoringClient.getSystemResourceUsage();

        // Default thresholds
        const thresholds: ResourceThresholds = {
          cpu: args.cpu || { warning: 75, critical: 90 },
          memory: args.memory || { warning: 80, critical: 95 },
          disk: args.disk || { warning: 85, critical: 95 },
          executionTime: args.executionTime || { warning: 30000, critical: 120000 },
          errorRate: args.errorRate || { warning: 5, critical: 15 },
          responseTime: args.responseTime || { warning: 1000, critical: 3000 },
        };

        // Evaluate resource usage against thresholds
        const evaluation = evaluateResourceThresholds(systemUsage, thresholds);

        let response = `📊 **Resource Monitoring Report**\n\n`;
        response += `**Overall Status:** ${getHealthStatusIcon(evaluation.status)} ${evaluation.status.toUpperCase()}\n`;
        response += `**Timestamp:** ${new Date(systemUsage.timestamp).toLocaleString()}\n\n`;

        // Current resource usage
        response += `**💻 Current Usage:**\n`;
        response += `• CPU: ${systemUsage.cpu.totalUsage.toFixed(1)}% (${systemUsage.cpu.coreCount} cores)\n`;
        response += `• Memory: ${systemUsage.memory.utilization.toFixed(1)}% (${formatBytes(systemUsage.memory.usedMemory)} / ${formatBytes(systemUsage.memory.totalMemory)})\n`;
        response += `• Process: ${formatBytes(systemUsage.memory.processMemory.rss)} RSS, ${formatBytes(systemUsage.memory.processMemory.heapUsed)} heap\n`;
        
        if (systemUsage.disk.totalSpace > 0) {
          response += `• Disk: ${systemUsage.disk.utilization.toFixed(1)}% (${formatBytes(systemUsage.disk.usedSpace)} / ${formatBytes(systemUsage.disk.totalSpace)})\n`;
        }
        response += `• Uptime: ${formatUptime(systemUsage.uptime)}\n`;

        // Configured thresholds
        response += `\n**⚙️ Configured Thresholds:**\n`;
        response += `• CPU: ⚠️${thresholds.cpu.warning}% / 🔴${thresholds.cpu.critical}%\n`;
        response += `• Memory: ⚠️${thresholds.memory.warning}% / 🔴${thresholds.memory.critical}%\n`;
        response += `• Disk: ⚠️${thresholds.disk.warning}% / 🔴${thresholds.disk.critical}%\n`;

        // Alerts
        if (evaluation.alerts.length > 0) {
          response += `\n**🚨 Active Alerts:**\n`;
          evaluation.alerts.forEach(alert => {
            response += `• ${alert}\n`;
          });
        } else {
          response += `\n✅ **No resource alerts currently active**\n`;
        }

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to monitor resources: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });
}