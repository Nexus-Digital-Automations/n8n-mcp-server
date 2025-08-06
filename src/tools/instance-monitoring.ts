import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { ResourceMonitor } from '../utils/resourceMonitor.js';
import {
  SystemResourceUsage,
  WorkflowResourceUsage,
  InstanceHealthMetrics,
  MonitoringReport,
  PerformanceAlert,
} from '../types/monitoringTypes.js';

// Validation Schemas
const MonitoringPeriodSchema = z.object({
  hours: z.number().min(1).max(168).optional().default(24), // 1 hour to 1 week
  includeInactive: z.boolean().optional().default(false),
});

const WorkflowMonitoringSchema = z.object({
  workflowId: z.string().optional(),
  includeNodeMetrics: z.boolean().optional().default(true),
  timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).optional().default('24h'),
});

const AlertManagementSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  resolved: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional().default(50),
});

const HealthCheckSchema = z.object({
  includeRecommendations: z.boolean().optional().default(true),
  includeAlerts: z.boolean().optional().default(true),
  includeDependencies: z.boolean().optional().default(true),
});

const ReportGenerationSchema = z.object({
  timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).optional().default('24h'),
  includeWorkflows: z.boolean().optional().default(true),
  includeRecommendations: z.boolean().optional().default(true),
  format: z.enum(['summary', 'detailed', 'dashboard']).optional().default('summary'),
});

// Global resource monitor instance
let resourceMonitor: ResourceMonitor | null = null;

function getResourceMonitor(): ResourceMonitor {
  if (!resourceMonitor) {
    resourceMonitor = new ResourceMonitor();
    resourceMonitor.startMonitoring();
  }
  return resourceMonitor;
}

// Helper Functions
function formatSystemUsage(usage: SystemResourceUsage): string {
  const sections = [];

  sections.push(`🖥️ **System Resource Usage**\n`);
  sections.push(`**Timestamp:** ${new Date(usage.timestamp).toLocaleString()}\n`);

  sections.push(`**💻 CPU:**`);
  sections.push(`• Total Usage: ${usage.cpu.totalUsage.toFixed(1)}%`);
  sections.push(`• Process Usage: ${usage.cpu.processUsage.toFixed(1)}%`);
  sections.push(`• Load Average: ${usage.cpu.loadAverage.map(l => l.toFixed(2)).join(', ')}`);
  sections.push(`• Cores: ${usage.cpu.coreCount}`);
  sections.push('');

  sections.push(`**🧠 Memory:**`);
  sections.push(`• Total: ${formatBytes(usage.memory.totalMemory)}`);
  sections.push(`• Used: ${formatBytes(usage.memory.usedMemory)} (${usage.memory.utilization.toFixed(1)}%)`);
  sections.push(`• Free: ${formatBytes(usage.memory.freeMemory)}`);
  sections.push(`• Process Heap: ${formatBytes(usage.memory.processMemory.heapUsed)} / ${formatBytes(usage.memory.processMemory.heapTotal)}`);
  sections.push(`• Process RSS: ${formatBytes(usage.memory.processMemory.rss)}`);
  sections.push('');

  sections.push(`**💾 Disk:**`);
  sections.push(`• Total: ${formatBytes(usage.disk.totalSpace)}`);
  sections.push(`• Used: ${formatBytes(usage.disk.usedSpace)} (${usage.disk.utilization.toFixed(1)}%)`);
  sections.push(`• Free: ${formatBytes(usage.disk.freeSpace)}`);
  sections.push('');

  sections.push(`**🌐 Network:**`);
  sections.push(`• Bytes Received: ${formatBytes(usage.network.bytesReceived)}`);
  sections.push(`• Bytes Sent: ${formatBytes(usage.network.bytesSent)}`);
  sections.push('');

  sections.push(`**⏱️ Uptime:** ${formatDuration(usage.uptime)}`);

  return sections.join('\n');
}

function formatWorkflowUsage(usage: WorkflowResourceUsage[]): string {
  if (usage.length === 0) {
    return 'No workflow usage data available.';
  }

  const sections = [];
  sections.push(`📊 **Workflow Resource Usage (${usage.length} workflows)**\n`);

  usage.forEach((workflow, index) => {
    const status = workflow.isActive ? '✅ Active' : '⏸️ Inactive';
    const successRate = workflow.executionStats.successRate.toFixed(1);
    
    sections.push(`**${index + 1}. ${workflow.workflowName}** ${status}`);
    sections.push(`   ID: ${workflow.workflowId}`);
    sections.push(`   Executions: ${workflow.executionCount} (${successRate}% success rate)`);
    sections.push(`   Avg Execution Time: ${formatDuration(workflow.resourceMetrics.averageExecutionTime / 1000)}`);
    sections.push(`   Memory Usage: Avg ${formatBytes(workflow.resourceMetrics.memoryUsage.average)}, Peak ${formatBytes(workflow.resourceMetrics.memoryUsage.peak)}`);
    sections.push(`   CPU Usage: Avg ${workflow.resourceMetrics.cpuUsage.average}%, Peak ${workflow.resourceMetrics.cpuUsage.peak}%`);
    sections.push(`   Runs/Hour: ${workflow.executionStats.averageRunsPerHour.toFixed(1)}`);
    sections.push('');
  });

  return sections.join('\n');
}

function formatHealthMetrics(health: InstanceHealthMetrics): string {
  const sections = [];
  const statusEmoji = {
    healthy: '✅',
    warning: '⚠️',
    degraded: '🟡',
    critical: '🚨'
  };

  sections.push(`🏥 **Instance Health Report**\n`);
  sections.push(`**Overall Status:** ${statusEmoji[health.overall.status]} ${health.overall.status.toUpperCase()}`);
  sections.push(`**Health Score:** ${health.overall.score}/100\n`);

  if (health.overall.issues.length > 0) {
    sections.push(`**🚨 Issues:**`);
    health.overall.issues.forEach((issue, i) => {
      sections.push(`${i + 1}. ${issue}`);
    });
    sections.push('');
  }

  if (health.overall.recommendations.length > 0) {
    sections.push(`**💡 Recommendations:**`);
    health.overall.recommendations.forEach((rec, i) => {
      sections.push(`${i + 1}. ${rec}`);
    });
    sections.push('');
  }

  sections.push(`**📈 Performance Metrics:**`);
  sections.push(`• API Response Time: ${health.performance.responseTime}ms`);
  sections.push(`• Throughput: ${health.performance.throughput} executions/min`);
  sections.push(`• Error Rate: ${health.performance.errorRate}%`);
  sections.push(`• Uptime: ${health.performance.availabilityUptime}%`);
  sections.push('');

  sections.push(`**🔧 Resource Status:**`);
  sections.push(`• Memory Pressure: ${health.resources.memoryPressure ? '⚠️ Yes' : '✅ No'}`);
  sections.push(`• CPU Throttling: ${health.resources.cpuThrottling ? '⚠️ Yes' : '✅ No'}`);
  sections.push(`• Disk Space Warning: ${health.resources.diskSpaceWarning ? '⚠️ Yes' : '✅ No'}`);
  sections.push(`• Network Latency: ${health.resources.networkLatency}ms`);
  sections.push('');

  if (health.dependencies.length > 0) {
    sections.push(`**🔗 Dependencies:**`);
    health.dependencies.forEach(dep => {
      const statusEmoji = dep.status === 'online' ? '✅' : dep.status === 'degraded' ? '⚠️' : '❌';
      sections.push(`• ${dep.name}: ${statusEmoji} ${dep.status} (${dep.responseTime}ms, ${dep.errorCount} errors)`);
    });
    sections.push('');
  }

  if (health.alerts.length > 0) {
    sections.push(`**🚨 Active Alerts (${health.alerts.length}):**`);
    health.alerts.slice(0, 5).forEach(alert => {
      const severityEmoji: Record<string, string> = {
        info: '💡',
        warning: '⚠️',
        error: '🚨',
        critical: '🔴'
      };
      sections.push(`• ${severityEmoji[alert.severity] || '💡'} ${alert.message}`);
    });
    if (health.alerts.length > 5) {
      sections.push(`  ... and ${health.alerts.length - 5} more alerts`);
    }
  }

  return sections.join('\n');
}

function formatAlerts(alerts: PerformanceAlert[]): string {
  if (alerts.length === 0) {
    return 'No alerts found.';
  }

  const sections = [];
  sections.push(`🚨 **Performance Alerts (${alerts.length})**\n`);

  alerts.forEach((alert, index) => {
    const severityEmoji = {
      low: '💡',
      medium: '⚠️',
      high: '🚨',
      critical: '🔴'
    };
    
    const status = alert.resolvedAt ? '✅ Resolved' : '🔴 Active';
    
    sections.push(`**${index + 1}. ${alert.title}** ${status}`);
    sections.push(`   Severity: ${severityEmoji[alert.severity]} ${alert.severity.toUpperCase()}`);
    sections.push(`   Type: ${alert.type}`);
    sections.push(`   Description: ${alert.description}`);
    sections.push(`   Triggered: ${new Date(alert.triggeredAt).toLocaleString()}`);
    
    if (alert.resolvedAt) {
      sections.push(`   Resolved: ${new Date(alert.resolvedAt).toLocaleString()}`);
    }
    
    if (alert.metadata.workflowId) {
      sections.push(`   Workflow: ${alert.metadata.workflowId}`);
    }
    
    if (alert.metadata.threshold && alert.metadata.actualValue) {
      sections.push(`   Threshold: ${alert.metadata.threshold}, Actual: ${alert.metadata.actualValue}`);
    }
    
    sections.push('');
  });

  return sections.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export function createInstanceMonitoringTools(getClient: () => N8nClient | null, server: any) {
  // System Resource Monitoring
  server.addTool({
    name: 'get-system-resources',
    description: 'Get real-time system resource usage including CPU, memory, disk, and network statistics',
    parameters: z.object({}),
    annotations: {
      title: 'System Resource Usage',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async () => {
      try {
        const monitor = getResourceMonitor();
        const systemUsage = await monitor.getSystemResourceUsage();
        return formatSystemUsage(systemUsage);
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get system resources: ${error.message}`);
        }
        throw new UserError('Failed to get system resources with unknown error');
      }
    },
  });

  // Workflow Resource Usage
  server.addTool({
    name: 'get-workflow-resources',
    description: 'Monitor per-workflow resource consumption including execution times and memory usage',
    parameters: WorkflowMonitoringSchema,
    annotations: {
      title: 'Workflow Resource Monitoring',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof WorkflowMonitoringSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const monitor = getResourceMonitor();
        const workflowUsages: WorkflowResourceUsage[] = [];

        if (args.workflowId) {
          // Get specific workflow
          const workflow = await client.getWorkflow(args.workflowId);
          const usage = await monitor.getWorkflowResourceUsage(
            workflow.id,
            workflow.name,
            workflow.active
          );
          workflowUsages.push(usage);
        } else {
          // Get all workflows
          const workflowsResponse = await client.getWorkflows({ limit: 50 });
          
          for (const workflow of workflowsResponse.data) {
            const usage = await monitor.getWorkflowResourceUsage(
              workflow.id,
              workflow.name,
              workflow.active
            );
            workflowUsages.push(usage);
          }
        }

        return formatWorkflowUsage(workflowUsages);
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get workflow resources: ${error.message}`);
        }
        throw new UserError('Failed to get workflow resources with unknown error');
      }
    },
  });

  // Instance Health Check
  server.addTool({
    name: 'check-instance-health',
    description: 'Comprehensive health check of the n8n instance including performance metrics and recommendations',
    parameters: HealthCheckSchema,
    annotations: {
      title: 'Instance Health Check',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof HealthCheckSchema>) => {
      try {
        const monitor = getResourceMonitor();
        const healthMetrics = await monitor.getInstanceHealthMetrics();
        return formatHealthMetrics(healthMetrics);
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to check instance health: ${error.message}`);
        }
        throw new UserError('Failed to check instance health with unknown error');
      }
    },
  });

  // Performance Alerts Management
  server.addTool({
    name: 'get-performance-alerts',
    description: 'Retrieve and manage performance alerts with filtering options',
    parameters: AlertManagementSchema,
    annotations: {
      title: 'Performance Alerts',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof AlertManagementSchema>) => {
      try {
        const monitor = getResourceMonitor();
        const alerts = monitor.getAlerts(args.severity, args.resolved);
        const limitedAlerts = alerts.slice(0, args.limit);
        return formatAlerts(limitedAlerts);
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get performance alerts: ${error.message}`);
        }
        throw new UserError('Failed to get performance alerts with unknown error');
      }
    },
  });

  // Resolve Alert
  server.addTool({
    name: 'resolve-performance-alert',
    description: 'Mark a performance alert as resolved',
    parameters: z.object({
      alertId: z.string().min(1, 'Alert ID is required'),
    }),
    annotations: {
      title: 'Resolve Performance Alert',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: { alertId: string }) => {
      try {
        const monitor = getResourceMonitor();
        const resolved = monitor.resolveAlert(args.alertId);
        
        if (resolved) {
          return `✅ Alert ${args.alertId} has been marked as resolved.`;
        } else {
          return `❌ Alert ${args.alertId} not found or already resolved.`;
        }
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to resolve alert: ${error.message}`);
        }
        throw new UserError('Failed to resolve alert with unknown error');
      }
    },
  });

  // Start/Stop Monitoring
  server.addTool({
    name: 'control-monitoring',
    description: 'Start or stop resource monitoring and configure monitoring settings',
    parameters: z.object({
      action: z.enum(['start', 'stop', 'restart', 'status']),
      intervalMs: z.number().min(5000).max(300000).optional(), // 5 seconds to 5 minutes
    }),
    annotations: {
      title: 'Control Resource Monitoring',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: { action: string; intervalMs?: number }) => {
      try {
        const monitor = getResourceMonitor();
        
        switch (args.action) {
          case 'start':
            await monitor.startMonitoring();
            return '✅ Resource monitoring started successfully.';
            
          case 'stop':
            monitor.stopMonitoring();
            return '⏹️ Resource monitoring stopped.';
            
          case 'restart':
            monitor.stopMonitoring();
            if (args.intervalMs) {
              monitor.updateConfig({
                monitoring: { ...monitor.getConfig().monitoring, intervalMs: args.intervalMs }
              });
            }
            await monitor.startMonitoring();
            return '🔄 Resource monitoring restarted successfully.';
            
          case 'status':
            const config = monitor.getConfig();
            return `📊 **Monitoring Status**\n\nEnabled: ${config.monitoring.enabled ? '✅ Yes' : '❌ No'}\nInterval: ${config.monitoring.intervalMs}ms\nRetention: ${config.monitoring.retentionDays} days\nData Points: ${monitor.getDataPoints().length}\nActive Alerts: ${monitor.getAlerts(undefined, false).length}`;
            
          default:
            throw new UserError(`Unknown action: ${args.action}`);
        }
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to control monitoring: ${error.message}`);
        }
        throw new UserError('Failed to control monitoring with unknown error');
      }
    },
  });

  // Record Workflow Execution (for tracking)
  server.addTool({
    name: 'record-execution-metrics',
    description: 'Record execution metrics for a workflow (used internally for tracking)',
    parameters: z.object({
      workflowId: z.string().min(1, 'Workflow ID is required'),
      duration: z.number().min(0, 'Duration must be non-negative'),
      success: z.boolean(),
    }),
    annotations: {
      title: 'Record Execution Metrics',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: { workflowId: string; duration: number; success: boolean }) => {
      try {
        const monitor = getResourceMonitor();
        monitor.recordWorkflowExecution(args.workflowId, args.duration, args.success);
        
        return `📊 Execution metrics recorded for workflow ${args.workflowId}: ${args.duration}ms (${args.success ? 'success' : 'failure'})`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to record execution metrics: ${error.message}`);
        }
        throw new UserError('Failed to record execution metrics with unknown error');
      }
    },
  });
}