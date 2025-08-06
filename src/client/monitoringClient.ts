import fetch from 'node-fetch';
import { N8nClient } from './n8nClient.js';
import {
  SystemResourceUsage,
  SystemDiagnostics,
} from '../types/monitoringTypes.js';

export interface HealthCheckResponse {
  status: 'healthy' | 'warning' | 'critical' | 'degraded';
  version: string;
  uptime: number;
  database: {
    status: 'connected' | 'disconnected' | 'error';
    responseTime: number;
  };
  redis?: {
    status: 'connected' | 'disconnected' | 'error';
    responseTime: number;
  };
  filesystem: {
    status: 'accessible' | 'error';
    permissions: 'read-write' | 'read-only' | 'no-access';
  };
}

export interface MetricsResponse {
  timestamp: string;
  executions: {
    total: number;
    successful: number;
    failed: number;
    running: number;
    waiting: number;
  };
  workflows: {
    total: number;
    active: number;
    inactive: number;
    withIssues: number;
  };
  performance: {
    averageExecutionTime: number;
    throughput: number; // executions per minute
    errorRate: number;
  };
  system: SystemResourceUsage;
}

export interface WorkflowDiagnosticsResponse {
  workflowId: string;
  workflowName: string;
  health: {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  };
  performance: {
    averageExecutionTime: number;
    successRate: number;
    recentExecutions: Array<{
      id: string;
      status: string;
      executionTime: number;
      timestamp: string;
      error?: string;
    }>;
  };
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    issues: string[];
    performance: {
      averageTime: number;
      successRate: number;
    };
  }>;
}

export class MonitoringClient {
  constructor(
    private client: N8nClient,
    private baseUrl: string,
    private apiKey: string
  ) {
    // Remove trailing slash if present
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async makeRequest<T>(
    endpoint: string,
    options: Record<string, unknown> = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const headers = {
      'X-N8N-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      } else {
        return (await response.text()) as unknown as T;
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Monitoring request failed: ${error.message}`);
      }
      throw new Error('Monitoring request failed with unknown error');
    }
  }

  /**
   * Get system health status
   */
  async getHealthCheck(): Promise<HealthCheckResponse> {
    try {
      // Try the standard n8n health endpoint
      return await this.makeRequest<HealthCheckResponse>('/health');
    } catch (error) {
      // Fallback to manual health check using available endpoints
      return await this.performManualHealthCheck();
    }
  }

  /**
   * Manual health check using available n8n API endpoints
   */
  private async performManualHealthCheck(): Promise<HealthCheckResponse> {
    const startTime = Date.now();
    let databaseStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
    let databaseResponseTime = 0;

    try {
      // Test database connectivity by fetching workflows
      const dbStart = Date.now();
      await this.client.getWorkflows({ limit: 1 });
      databaseResponseTime = Date.now() - dbStart;
      databaseStatus = 'connected';
    } catch (error) {
      databaseStatus = 'error';
      databaseResponseTime = Date.now() - startTime;
    }

    // Check filesystem access
    let filesystemStatus: 'accessible' | 'error' = 'accessible';
    let filesystemPermissions: 'read-write' | 'read-only' | 'no-access' = 'read-write';

    try {
      // This would typically check file system access
      // For now, assume accessible if we can make API calls
      if (databaseStatus === 'connected') {
        filesystemStatus = 'accessible';
        filesystemPermissions = 'read-write';
      } else {
        filesystemStatus = 'error';
        filesystemPermissions = 'no-access';
      }
    } catch {
      filesystemStatus = 'error';
      filesystemPermissions = 'no-access';
    }

    // Determine overall status
    let overallStatus: 'healthy' | 'warning' | 'critical' | 'degraded' = 'healthy';
    if (databaseStatus === 'error' || filesystemStatus === 'error') {
      overallStatus = 'critical';
    } else if (databaseResponseTime > 1000) {
      overallStatus = 'warning';
    }

    return {
      status: overallStatus,
      version: 'unknown', // Would need to be fetched from n8n API if available
      uptime: process.uptime(),
      database: {
        status: databaseStatus,
        responseTime: databaseResponseTime,
      },
      filesystem: {
        status: filesystemStatus,
        permissions: filesystemPermissions,
      },
    };
  }

  /**
   * Get comprehensive system metrics
   */
  async getMetrics(): Promise<MetricsResponse> {

    try {
      // Fetch data in parallel
      const [workflowsResponse, executionsResponse] = await Promise.all([
        this.client.getWorkflows({ limit: 1000 }), // Get all workflows for analysis
        this.client.getExecutions({ limit: 100 }), // Get recent executions
      ]);

      // Extract data from API response wrappers
      const workflows = workflowsResponse.data;
      const executions = executionsResponse.data;

      // Analyze workflow states
      const activeWorkflows = workflows.filter(w => w.active);
      const workflowsWithIssues = workflows.filter(w => !w.active && w.nodes && w.nodes.length === 0);

      // Analyze execution stats
      const successfulExecutions = executions.filter(e => e.finished && !e.stoppedAt);
      const failedExecutions = executions.filter(e => e.finished && e.stoppedAt);
      const runningExecutions = executions.filter(e => !e.finished);

      // Calculate performance metrics
      const executionTimes = executions
        .filter(e => e.finished && e.startedAt && e.stoppedAt)
        .map(e => new Date(e.stoppedAt!).getTime() - new Date(e.startedAt).getTime());

      const averageExecutionTime = executionTimes.length > 0 
        ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
        : 0;

      const errorRate = executions.length > 0 
        ? (failedExecutions.length / executions.length) * 100 
        : 0;

      // Calculate throughput (executions per minute in last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentExecutions = executions.filter(e => 
        new Date(e.startedAt) > oneHourAgo
      );
      const throughput = recentExecutions.length / 60; // per minute

      // Get system resource usage
      const systemUsage = this.getSystemResourceUsage();

      return {
        timestamp: new Date().toISOString(),
        executions: {
          total: executions.length,
          successful: successfulExecutions.length,
          failed: failedExecutions.length,
          running: runningExecutions.length,
          waiting: 0, // Would need to be calculated from queue if available
        },
        workflows: {
          total: workflows.length,
          active: activeWorkflows.length,
          inactive: workflows.length - activeWorkflows.length,
          withIssues: workflowsWithIssues.length,
        },
        performance: {
          averageExecutionTime,
          throughput,
          errorRate,
        },
        system: systemUsage,
      };
    } catch (error) {
      throw new Error(`Failed to get metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get detailed workflow diagnostics
   */
  async getWorkflowDiagnostics(workflowId: string): Promise<WorkflowDiagnosticsResponse> {
    try {
      const [workflow, executionsResponse] = await Promise.all([
        this.client.getWorkflow(workflowId),
        this.client.getExecutions({ limit: 100 }), // Get more executions to filter by workflowId
      ]);

      // Extract executions data from API response wrapper and filter by workflowId
      const allExecutions = executionsResponse.data;
      const executions = allExecutions.filter(e => e.workflowId === workflowId).slice(0, 50);

      // Analyze workflow health
      const issues: string[] = [];
      const recommendations: string[] = [];

      if (!workflow.active) {
        issues.push('Workflow is inactive');
        recommendations.push('Consider activating the workflow if it should be running');
      }

      if (!workflow.nodes || workflow.nodes.length === 0) {
        issues.push('Workflow has no nodes');
        recommendations.push('Add nodes to define workflow logic');
      }

      // Analyze recent executions
      const recentExecutions = executions.slice(0, 10).map(e => ({
        id: e.id!,
        status: e.finished ? (e.stoppedAt ? 'failed' : 'success') : 'running',
        executionTime: e.finished && e.startedAt && e.stoppedAt 
          ? new Date(e.stoppedAt).getTime() - new Date(e.startedAt).getTime()
          : 0,
        timestamp: e.startedAt,
        error: e.stoppedAt ? 'Execution stopped' : undefined,
      }));

      // Calculate success rate
      const finishedExecutions = executions.filter(e => e.finished);
      const successfulExecutions = finishedExecutions.filter(e => !e.stoppedAt);
      const successRate = finishedExecutions.length > 0 
        ? (successfulExecutions.length / finishedExecutions.length) * 100 
        : 100;

      // Calculate average execution time
      const executionTimes = recentExecutions
        .filter(e => e.status === 'success' && e.executionTime > 0)
        .map(e => e.executionTime);
      const averageExecutionTime = executionTimes.length > 0 
        ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
        : 0;

      // Determine health status
      let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (issues.length > 0 || successRate < 80) {
        healthStatus = 'critical';
      } else if (successRate < 95 || averageExecutionTime > 30000) {
        healthStatus = 'warning';
      }

      // Analyze nodes
      const nodeAnalysis = (workflow.nodes || []).map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        issues: node.disabled ? ['Node is disabled'] : [],
        performance: {
          averageTime: 0, // Would need execution details to calculate
          successRate: 100, // Would need execution details to calculate
        },
      }));

      return {
        workflowId: workflow.id!,
        workflowName: workflow.name,
        health: {
          status: healthStatus,
          issues,
          recommendations,
        },
        performance: {
          averageExecutionTime,
          successRate,
          recentExecutions,
        },
        nodes: nodeAnalysis,
      };
    } catch (error) {
      throw new Error(`Failed to get workflow diagnostics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current system resource usage
   */
  getSystemResourceUsage(): SystemResourceUsage {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Convert CPU usage to percentage (simplified)
    const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000) / process.uptime() * 100;

    return {
      cpu: {
        totalUsage: Math.min(cpuPercent, 100), // Cap at 100%
        processUsage: Math.min(cpuPercent, 100),
        loadAverage: process.platform === 'win32' ? [0, 0, 0] : require('os').loadavg(),
        coreCount: require('os').cpus().length,
      },
      memory: {
        totalMemory: require('os').totalmem(),
        freeMemory: require('os').freemem(),
        usedMemory: require('os').totalmem() - require('os').freemem(),
        processMemory: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss,
        },
        utilization: ((require('os').totalmem() - require('os').freemem()) / require('os').totalmem()) * 100,
      },
      disk: {
        totalSpace: 0, // Would need filesystem API to get real values
        freeSpace: 0,
        usedSpace: 0,
        utilization: 0,
      },
      network: {
        bytesReceived: 0, // Would need network statistics
        bytesSent: 0,
        packetsReceived: 0,
        packetsSent: 0,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Test connectivity to n8n instance
   */
  async testConnectivity(): Promise<{ success: boolean; responseTime: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      await this.client.getWorkflows({ limit: 1 });
      return {
        success: true,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get system diagnostics for troubleshooting
   */
  async getSystemDiagnostics(): Promise<SystemDiagnostics> {
    const [healthCheck, connectivity, systemUsage] = await Promise.all([
      this.getHealthCheck(),
      this.testConnectivity(),
      Promise.resolve(this.getSystemResourceUsage()),
    ]);

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Analyze health issues
    if (healthCheck.status === 'critical') {
      issues.push('System health is critical');
      recommendations.push('Check database connectivity and file system permissions');
    }

    if (!connectivity.success) {
      issues.push(`API connectivity failed: ${connectivity.error}`);
      recommendations.push('Verify n8n instance is running and API key is correct');
    }

    if (connectivity.responseTime > 1000) {
      issues.push('High API response time detected');
      recommendations.push('Check network connectivity and server performance');
    }

    // Analyze resource usage
    if (systemUsage.memory.utilization > 85) {
      issues.push('High memory utilization detected');
      recommendations.push('Consider increasing available memory or optimizing workflows');
    }

    if (systemUsage.cpu.totalUsage > 80) {
      issues.push('High CPU usage detected');
      recommendations.push('Check for resource-intensive workflows or background processes');
    }

    return {
      timestamp: new Date().toISOString(),
      overall: {
        status: healthCheck.status,
        issues,
        recommendations,
      },
      connectivity: {
        apiConnectivity: connectivity.success,
        responseTime: connectivity.responseTime,
        error: connectivity.error,
      },
      resources: systemUsage,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        uptime: process.uptime(),
      },
    };
  }
}