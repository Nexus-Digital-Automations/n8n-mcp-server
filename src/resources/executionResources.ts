/**
 * Execution Resources for n8n MCP Server
 *
 * Provides MCP resources for accessing n8n execution data including logs,
 * results, timing information, and execution history.
 */

import { FastMCP } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';

/**
 * Execution resource configuration
 */
export interface ExecutionResourceConfig {
  /** Base URI prefix for execution resources */
  baseUri?: string;

  /** Maximum number of executions to include in listings */
  maxExecutions?: number;

  /** Whether to include execution data in listings */
  includeData?: boolean;

  /** Whether to include failed executions */
  includeFailures?: boolean;

  /** Cache duration for execution data (ms) */
  cacheDuration?: number;

  /** Maximum execution data size to return (bytes) */
  maxDataSize?: number;
}

/**
 * Execution resource manager
 *
 * Manages execution-related MCP resources including individual execution access,
 * execution logs, and execution statistics.
 */
export class ExecutionResourceManager {
  private config: Required<ExecutionResourceConfig>;
  private cache = new Map<string, { data: any; expires: number }>();

  constructor(config: ExecutionResourceConfig = {}) {
    this.config = {
      baseUri: 'n8n://executions',
      maxExecutions: 50,
      includeData: false, // Data can be large, exclude by default
      includeFailures: true,
      cacheDuration: 2 * 60 * 1000, // 2 minutes (executions change frequently)
      maxDataSize: 1024 * 1024, // 1MB max
      ...config,
    };
  }

  /**
   * Register execution resources with FastMCP server
   */
  public register(server: FastMCP, getClient: () => N8nClient | null): void {
    // Individual execution resource template
    server.addResourceTemplate({
      uriTemplate: `${this.config.baseUri}/{id}`,
      name: 'n8n Execution',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'id',
          description: 'The ID of the n8n execution',
          required: true,
        },
      ],
      load: async ({ id }) => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const execution = await this.getExecutionResource(client, id);
        return {
          text: JSON.stringify(execution, null, 2),
        };
      },
    });

    // Execution logs resource template
    server.addResourceTemplate({
      uriTemplate: `${this.config.baseUri}/{id}/logs`,
      name: 'n8n Execution Logs',
      mimeType: 'text/plain',
      arguments: [
        {
          name: 'id',
          description: 'The ID of the n8n execution',
          required: true,
        },
      ],
      load: async ({ id }) => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const logs = await this.getExecutionLogsResource(client, id);
        return {
          text: logs,
        };
      },
    });

    // Recent executions resource
    server.addResource({
      uri: `${this.config.baseUri}/recent`,
      name: 'n8n Recent Executions',
      mimeType: 'application/json',
      load: async () => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const executions = await this.getRecentExecutionsResource(client);
        return {
          text: JSON.stringify(executions, null, 2),
        };
      },
    });

    // Failed executions resource
    server.addResource({
      uri: `${this.config.baseUri}/failures`,
      name: 'n8n Failed Executions',
      mimeType: 'application/json',
      load: async () => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const failures = await this.getFailedExecutionsResource(client);
        return {
          text: JSON.stringify(failures, null, 2),
        };
      },
    });

    // Execution statistics resource
    server.addResource({
      uri: `${this.config.baseUri}/stats`,
      name: 'n8n Execution Statistics',
      mimeType: 'application/json',
      load: async () => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const stats = await this.getExecutionStatsResource(client);
        return {
          text: JSON.stringify(stats, null, 2),
        };
      },
    });

    // Execution resource template
    server.addResourceTemplate({
      uriTemplate: `${this.config.baseUri}/{executionId}`,
      name: 'n8n Execution by ID',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'executionId',
          description: 'The ID of the n8n execution',
          required: true,
        },
      ],
      load: async ({ executionId }) => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const execution = await this.getExecutionResource(client, executionId);
        return {
          text: JSON.stringify(execution, null, 2),
        };
      },
    });

    // Workflow executions resource template
    server.addResourceTemplate({
      uriTemplate: `${this.config.baseUri}/workflow/{workflowId}`,
      name: 'n8n Workflow Executions',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workflowId',
          description: 'The ID of the workflow',
          required: true,
        },
      ],
      load: async ({ workflowId }) => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const executions = await this.getWorkflowExecutionsResource(client, workflowId);
        return {
          text: JSON.stringify(executions, null, 2),
        };
      },
    });

    console.log('⚡ Execution resources registered');
  }

  /**
   * Get individual execution resource
   */
  private async getExecutionResource(client: N8nClient, executionId: string): Promise<any> {
    const cacheKey = `execution:${executionId}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const execution = await client.getExecution(executionId);

      // Enhance execution data with metadata
      const enhancedExecution = {
        id: execution.id,
        workflowId: execution.workflowId,
        status: execution.finished ? 'success' : execution.stoppedAt ? 'stopped' : 'running',
        startedAt: execution.startedAt,
        stoppedAt: execution.stoppedAt,
        duration:
          execution.stoppedAt && execution.startedAt
            ? new Date(execution.stoppedAt).getTime() - new Date(execution.startedAt).getTime()
            : null,
        metadata: {
          mode: execution.mode,
          retryOf: execution.retryOf,
          retrySuccessId: execution.retrySuccessId,
          error: (execution.data as any)?.resultData?.error,
        },
        // Include data only if specifically requested and within size limits
        data: this.config.includeData
          ? this.sanitizeExecutionData(execution.data || {})
          : undefined,
        resourceInfo: {
          uri: `${this.config.baseUri}/${executionId}`,
          type: 'n8n-execution',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };

      this.setCachedData(cacheKey, enhancedExecution);
      return enhancedExecution;
    } catch (error) {
      throw new Error(
        `Failed to load execution ${executionId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get execution logs resource
   */
  private async getExecutionLogsResource(client: N8nClient, executionId: string): Promise<string> {
    const cacheKey = `execution:${executionId}:logs`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const execution = await client.getExecution(executionId);

      // Extract logs from execution data
      const logs = this.extractLogsFromExecution(execution);

      this.setCachedData(cacheKey, logs);
      return logs;
    } catch (error) {
      throw new Error(
        `Failed to load execution logs ${executionId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get recent executions resource
   */
  private async getRecentExecutionsResource(client: N8nClient): Promise<any> {
    const cacheKey = 'executions:recent';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const executions = await client.getExecutions({
        limit: this.config.maxExecutions,
      });

      const recentExecutions = {
        executions: executions.data.map((execution: any) => ({
          id: execution.id,
          workflowId: execution.workflowId,
          workflowName: execution.workflowData?.name,
          status: execution.finished ? 'success' : execution.stoppedAt ? 'stopped' : 'running',
          startedAt: execution.startedAt,
          stoppedAt: execution.stoppedAt,
          duration:
            execution.stoppedAt && execution.startedAt
              ? new Date(execution.stoppedAt).getTime() - new Date(execution.startedAt).getTime()
              : null,
          uri: `${this.config.baseUri}/${execution.id}`,
        })),
        metadata: {
          total: executions.data.length,
          returned: executions.data.length,
          maxExecutions: this.config.maxExecutions,
        },
        resourceInfo: {
          uri: `${this.config.baseUri}/recent`,
          type: 'n8n-recent-executions',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };

      this.setCachedData(cacheKey, recentExecutions);
      return recentExecutions;
    } catch (error) {
      throw new Error(
        `Failed to load recent executions: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get failed executions resource
   */
  private async getFailedExecutionsResource(client: N8nClient): Promise<any> {
    const cacheKey = 'executions:failures';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const executions = await client.getExecutions({
        limit: this.config.maxExecutions,
      });

      // Filter for failed executions client-side
      const failedExecutionsData = executions.data.filter((e: any) => e.data?.resultData?.error);

      const failedExecutions = {
        failures: failedExecutionsData.map((execution: any) => ({
          id: execution.id,
          workflowId: execution.workflowId,
          workflowName: execution.workflowData?.name,
          startedAt: execution.startedAt,
          stoppedAt: execution.stoppedAt,
          error: execution.data?.resultData?.error?.message || 'Unknown error',
          errorDetails: execution.data?.resultData?.error,
          uri: `${this.config.baseUri}/${execution.id}`,
        })),
        metadata: {
          total: failedExecutionsData.length,
          returned: failedExecutionsData.length,
          maxExecutions: this.config.maxExecutions,
        },
        resourceInfo: {
          uri: `${this.config.baseUri}/failures`,
          type: 'n8n-failed-executions',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };

      this.setCachedData(cacheKey, failedExecutions);
      return failedExecutions;
    } catch (error) {
      throw new Error(
        `Failed to load failed executions: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get execution statistics resource
   */
  private async getExecutionStatsResource(client: N8nClient): Promise<any> {
    const cacheKey = 'executions:stats';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const executions = await client.getExecutions({
        limit: this.config.maxExecutions,
      });

      const stats = {
        totalExecutions: executions.data.length,
        successfulExecutions: executions.data.filter(
          (e: any) => e.finished && !e.data?.resultData?.error
        ).length,
        failedExecutions: executions.data.filter((e: any) => e.data?.resultData?.error).length,
        runningExecutions: executions.data.filter((e: any) => !e.finished && !e.stoppedAt).length,
        averageDuration: this.calculateAverageDuration(executions.data),
        executionsByStatus: this.calculateExecutionsByStatus(executions.data),
        resourceInfo: {
          uri: `${this.config.baseUri}/stats`,
          type: 'n8n-execution-stats',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };

      this.setCachedData(cacheKey, stats);
      return stats;
    } catch (error) {
      throw new Error(
        `Failed to load execution statistics: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get workflow executions resource
   */
  private async getWorkflowExecutionsResource(client: N8nClient, workflowId: string): Promise<any> {
    const cacheKey = `executions:workflow:${workflowId}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const executions = await client.getExecutions({
        limit: this.config.maxExecutions,
      });

      // Filter for specific workflow client-side
      const workflowExecutionsData = executions.data.filter(
        (e: any) => e.workflowId === workflowId
      );

      const workflowExecutions = {
        workflowId,
        executions: workflowExecutionsData.map((execution: any) => ({
          id: execution.id,
          status: execution.finished ? 'success' : execution.stoppedAt ? 'stopped' : 'running',
          startedAt: execution.startedAt,
          stoppedAt: execution.stoppedAt,
          duration:
            execution.stoppedAt && execution.startedAt
              ? new Date(execution.stoppedAt).getTime() - new Date(execution.startedAt).getTime()
              : null,
          uri: `${this.config.baseUri}/${execution.id}`,
        })),
        metadata: {
          workflowId,
          total: workflowExecutionsData.length,
          returned: workflowExecutionsData.length,
        },
        resourceInfo: {
          uri: `${this.config.baseUri}/workflow/${workflowId}`,
          type: 'n8n-workflow-executions',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };

      this.setCachedData(cacheKey, workflowExecutions);
      return workflowExecutions;
    } catch (error) {
      throw new Error(
        `Failed to load workflow executions ${workflowId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Sanitize execution data to remove sensitive information and limit size
   */
  private sanitizeExecutionData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const serialized = JSON.stringify(data);
    if (serialized.length > this.config.maxDataSize) {
      return {
        _truncated: true,
        _size: serialized.length,
        _maxSize: this.config.maxDataSize,
        summary: 'Data truncated due to size limits',
      };
    }

    // Remove sensitive data patterns
    return this.removeSensitiveData(data);
  }

  /**
   * Remove sensitive data from execution data
   */
  private removeSensitiveData(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeSensitiveData(item));
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip sensitive keys
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('password') ||
          lowerKey.includes('token') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('key')
        ) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = this.removeSensitiveData(value);
        }
      }
      return result;
    }

    return obj;
  }

  /**
   * Extract logs from execution data
   */
  private extractLogsFromExecution(execution: any): string {
    const logs: string[] = [];

    logs.push(`Execution ID: ${execution.id}`);
    logs.push(`Workflow ID: ${execution.workflowId}`);
    logs.push(`Started: ${execution.startedAt}`);
    logs.push(`Stopped: ${execution.stoppedAt || 'Still running'}`);
    logs.push(`Status: ${execution.finished ? 'Finished' : 'Running'}`);
    logs.push('');

    if (execution.data?.resultData?.error) {
      logs.push('ERROR:');
      logs.push(JSON.stringify(execution.data.resultData.error, null, 2));
      logs.push('');
    }

    // Add node execution logs if available
    if (execution.data?.resultData?.runData) {
      logs.push('NODE EXECUTION DATA:');
      for (const [nodeName, nodeData] of Object.entries(execution.data.resultData.runData)) {
        logs.push(`Node: ${nodeName}`);
        logs.push(JSON.stringify(nodeData, null, 2));
        logs.push('');
      }
    }

    return logs.join('\n');
  }

  /**
   * Calculate average execution duration
   */
  private calculateAverageDuration(executions: any[]): number {
    const durations = executions
      .filter(e => e.startedAt && e.stoppedAt)
      .map(e => new Date(e.stoppedAt).getTime() - new Date(e.startedAt).getTime());

    if (durations.length === 0) return 0;

    return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  }

  /**
   * Calculate executions by status
   */
  private calculateExecutionsByStatus(executions: any[]): Record<string, number> {
    const statusCounts: Record<string, number> = {
      success: 0,
      error: 0,
      running: 0,
      stopped: 0,
    };

    executions.forEach(execution => {
      if (execution.finished && !execution.data?.resultData?.error) {
        statusCounts.success++;
      } else if (execution.data?.resultData?.error) {
        statusCounts.error++;
      } else if (!execution.finished && !execution.stoppedAt) {
        statusCounts.running++;
      } else {
        statusCounts.stopped++;
      }
    });

    return statusCounts;
  }

  /**
   * Get cached data if not expired
   */
  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set cached data with expiration
   */
  private setCachedData(key: string, data: any): void {
    if (this.config.cacheDuration > 0) {
      this.cache.set(key, {
        data,
        expires: Date.now() + this.config.cacheDuration,
      });
    }
  }

  /**
   * Clear resource cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

/**
 * Create execution resource manager
 */
export function createExecutionResources(
  config?: ExecutionResourceConfig
): ExecutionResourceManager {
  return new ExecutionResourceManager(config);
}
