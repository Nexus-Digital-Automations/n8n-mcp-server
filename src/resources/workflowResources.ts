/**
 * Workflow Resources for n8n MCP Server
 *
 * Provides MCP resources for accessing n8n workflow data including definitions,
 * metadata, and configuration. Supports both static workflow access and dynamic
 * workflow discovery.
 */

import { FastMCP } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';

/**
 * Workflow resource configuration
 */
export interface WorkflowResourceConfig {
  /** Base URI prefix for workflow resources */
  baseUri?: string;

  /** Maximum number of workflows to include in listings */
  maxWorkflows?: number;

  /** Whether to include inactive workflows */
  includeInactive?: boolean;

  /** Whether to include workflow execution history */
  includeExecutions?: boolean;

  /** Cache duration for workflow data (ms) */
  cacheDuration?: number;
}

/**
 * Workflow resource manager
 *
 * Manages workflow-related MCP resources including individual workflow access,
 * workflow listings, and workflow metadata.
 */
export class WorkflowResourceManager {
  private config: Required<WorkflowResourceConfig>;
  private cache = new Map<string, { data: any; expires: number }>();

  constructor(config: WorkflowResourceConfig = {}) {
    this.config = {
      baseUri: 'n8n://workflows',
      maxWorkflows: 100,
      includeInactive: true,
      includeExecutions: false,
      cacheDuration: 5 * 60 * 1000, // 5 minutes
      ...config,
    };
  }

  /**
   * Register workflow resources with FastMCP server
   */
  public register(server: FastMCP, getClient: () => N8nClient | null): void {
    // Individual workflow resource template
    server.addResourceTemplate({
      uriTemplate: `${this.config.baseUri}/{id}`,
      name: 'n8n Workflow',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'id',
          description: 'The ID of the n8n workflow',
          required: true,
        },
      ],
      load: async ({ id }: { id: string }) => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const workflow = await this.getWorkflowResource(client, id);
        return {
          text: JSON.stringify(workflow, null, 2),
        };
      },
    });

    // Workflow listing resource
    server.addResource({
      uri: `${this.config.baseUri}/list`,
      name: 'n8n Workflow List',
      mimeType: 'application/json',
      load: async () => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const workflows = await this.getWorkflowListResource(client);
        return {
          text: JSON.stringify(workflows, null, 2),
        };
      },
    });

    // Active workflows resource
    server.addResource({
      uri: `${this.config.baseUri}/active`,
      name: 'n8n Active Workflows',
      mimeType: 'application/json',
      load: async () => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const activeWorkflows = await this.getActiveWorkflowsResource(client);
        return {
          text: JSON.stringify(activeWorkflows, null, 2),
        };
      },
    });

    // Workflow statistics resource
    server.addResource({
      uri: `${this.config.baseUri}/stats`,
      name: 'n8n Workflow Statistics',
      mimeType: 'application/json',
      load: async () => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const stats = await this.getWorkflowStatsResource(client);
        return {
          text: JSON.stringify(stats, null, 2),
        };
      },
    });

    // Workflow resource template for pattern matching
    server.addResourceTemplate({
      uriTemplate: `${this.config.baseUri}/{workflowId}`,
      name: 'n8n Workflow by ID',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workflowId',
          description: 'The ID of the n8n workflow',
          required: true,
        },
      ],
      load: async ({ workflowId }: { workflowId: string }) => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const workflow = await this.getWorkflowResource(client, workflowId);
        return {
          text: JSON.stringify(workflow, null, 2),
        };
      },
    });

    console.log('📄 Workflow resources registered');
  }

  /**
   * Get individual workflow resource
   */
  private async getWorkflowResource(client: N8nClient, workflowId: string): Promise<any> {
    const cacheKey = `workflow:${workflowId}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const workflow = await client.getWorkflow(workflowId);

      // Enhance workflow data with metadata
      const enhancedWorkflow = {
        ...workflow,
        metadata: {
          id: workflow.id,
          name: workflow.name,
          active: workflow.active,
          tags: workflow.tags || [],
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
          nodeCount: workflow.nodes?.length || 0,
          connectionCount: workflow.connections ? Object.keys(workflow.connections).length : 0,
        },
        resourceInfo: {
          uri: `${this.config.baseUri}/${workflowId}`,
          type: 'n8n-workflow',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };

      this.setCachedData(cacheKey, enhancedWorkflow);
      return enhancedWorkflow;
    } catch (error) {
      throw new Error(
        `Failed to load workflow ${workflowId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get workflow list resource
   */
  private async getWorkflowListResource(client: N8nClient): Promise<any> {
    const cacheKey = 'workflows:list';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const workflows = await client.getWorkflows({
        limit: this.config.maxWorkflows,
      });

      const workflowList = {
        workflows: workflows.data.map(workflow => ({
          id: workflow.id,
          name: workflow.name,
          active: workflow.active,
          tags: workflow.tags || [],
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
          uri: `${this.config.baseUri}/${workflow.id}`,
        })),
        metadata: {
          total: workflows.data.length, // API doesn't provide total count
          returned: workflows.data.length,
          includeInactive: this.config.includeInactive,
          maxWorkflows: this.config.maxWorkflows,
        },
        resourceInfo: {
          uri: `${this.config.baseUri}/list`,
          type: 'n8n-workflow-list',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };

      this.setCachedData(cacheKey, workflowList);
      return workflowList;
    } catch (error) {
      throw new Error(
        `Failed to load workflow list: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get active workflows resource
   */
  private async getActiveWorkflowsResource(client: N8nClient): Promise<any> {
    const cacheKey = 'workflows:active';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const workflows = await client.getWorkflows({
        limit: this.config.maxWorkflows,
      });

      // Filter for active workflows client-side
      const activeWorkflowsData = workflows.data.filter(w => w.active);

      const activeWorkflows = {
        activeWorkflows: activeWorkflowsData.map(workflow => ({
          id: workflow.id,
          name: workflow.name,
          tags: workflow.tags || [],
          lastExecution: workflow.updatedAt,
          uri: `${this.config.baseUri}/${workflow.id}`,
        })),
        metadata: {
          total: activeWorkflowsData.length,
          returned: activeWorkflowsData.length,
          activeOnly: true,
        },
        resourceInfo: {
          uri: `${this.config.baseUri}/active`,
          type: 'n8n-active-workflows',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };

      this.setCachedData(cacheKey, activeWorkflows);
      return activeWorkflows;
    } catch (error) {
      throw new Error(
        `Failed to load active workflows: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get workflow statistics resource
   */
  private async getWorkflowStatsResource(client: N8nClient): Promise<any> {
    const cacheKey = 'workflows:stats';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const workflows = await client.getWorkflows({
        limit: this.config.maxWorkflows,
      });

      const stats = {
        totalWorkflows: workflows.data.length,
        activeWorkflows: workflows.data.filter(w => w.active).length,
        inactiveWorkflows: workflows.data.filter(w => !w.active).length,
        tagUsage: this.calculateTagUsage(workflows.data),
        creationStats: this.calculateCreationStats(workflows.data),
        resourceInfo: {
          uri: `${this.config.baseUri}/stats`,
          type: 'n8n-workflow-stats',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };

      this.setCachedData(cacheKey, stats);
      return stats;
    } catch (error) {
      throw new Error(
        `Failed to load workflow statistics: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Calculate tag usage statistics
   */
  private calculateTagUsage(workflows: any[]): Record<string, number> {
    const tagUsage: Record<string, number> = {};

    workflows.forEach(workflow => {
      if (workflow.tags && Array.isArray(workflow.tags)) {
        workflow.tags.forEach((tag: any) => {
          if (tag != null) {
            const tagName = typeof tag === 'string' ? tag : tag?.name;
            if (tagName) {
              tagUsage[tagName] = (tagUsage[tagName] || 0) + 1;
            }
          }
        });
      }
    });

    return tagUsage;
  }

  /**
   * Calculate creation statistics
   */
  private calculateCreationStats(workflows: any[]): any {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      createdLastWeek: workflows.filter(w => new Date(w.createdAt) > oneWeekAgo).length,
      createdLastMonth: workflows.filter(w => new Date(w.createdAt) > oneMonthAgo).length,
      updatedLastWeek: workflows.filter(w => new Date(w.updatedAt) > oneWeekAgo).length,
      updatedLastMonth: workflows.filter(w => new Date(w.updatedAt) > oneMonthAgo).length,
    };
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
 * Create workflow resource manager
 */
export function createWorkflowResources(config?: WorkflowResourceConfig): WorkflowResourceManager {
  return new WorkflowResourceManager(config);
}
