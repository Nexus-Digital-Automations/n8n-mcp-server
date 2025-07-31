/**
 * Resource Manager for n8n MCP Server
 *
 * Central coordinator for all MCP resources, managing registration,
 * configuration, and lifecycle of resource providers.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */

import { FastMCP } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { WorkflowResourceManager, createWorkflowResources } from './workflowResources.js';
import { ExecutionResourceManager, createExecutionResources } from './executionResources.js';

/**
 * Resource manager configuration
 */
export interface ResourceManagerConfig {
  /** Base URI prefix for all n8n resources */
  baseUri?: string;

  /** Whether to enable workflow resources */
  enableWorkflows?: boolean;

  /** Whether to enable execution resources */
  enableExecutions?: boolean;

  /** Whether to enable credential resources */
  enableCredentials?: boolean;

  /** Whether to enable node documentation resources */
  enableNodes?: boolean;

  /** Global cache duration for all resources (ms) */
  globalCacheDuration?: number;

  /** Maximum number of items in resource listings */
  maxItems?: number;
}

/**
 * Central resource manager
 *
 * Coordinates all resource providers and handles global resource configuration.
 */
export class ResourceManager {
  private config: Required<ResourceManagerConfig>;
  private workflowResources?: WorkflowResourceManager;
  private executionResources?: ExecutionResourceManager;

  constructor(config: ResourceManagerConfig = {}) {
    this.config = {
      baseUri: 'n8n://',
      enableWorkflows: true,
      enableExecutions: true,
      enableCredentials: false, // Disabled by default for security
      enableNodes: true,
      globalCacheDuration: 5 * 60 * 1000, // 5 minutes
      maxItems: 100,
      ...config,
    };
  }

  /**
   * Register all enabled resources with FastMCP server
   */
  public register(server: FastMCP, getClient: () => N8nClient | null): void {
    console.log('📚 Registering n8n MCP resources...');

    // Register workflow resources
    if (this.config.enableWorkflows) {
      this.workflowResources = createWorkflowResources({
        baseUri: `${this.config.baseUri}workflows`,
        maxWorkflows: this.config.maxItems,
        cacheDuration: this.config.globalCacheDuration,
      });
      this.workflowResources.register(server, getClient);
    }

    // Register execution resources
    if (this.config.enableExecutions) {
      this.executionResources = createExecutionResources({
        baseUri: `${this.config.baseUri}executions`,
        maxExecutions: this.config.maxItems,
        cacheDuration: this.config.globalCacheDuration,
      });
      this.executionResources.register(server, getClient);
    }

    // Register node documentation resources
    if (this.config.enableNodes) {
      this.registerNodeResources(server, getClient);
    }

    // Register credential template resources (if enabled)
    if (this.config.enableCredentials) {
      this.registerCredentialResources(server, getClient);
    }

    // Register general n8n information resources
    this.registerGeneralResources(server, getClient);

    console.log('✅ All n8n MCP resources registered');
  }

  /**
   * Register node documentation resources
   */
  private registerNodeResources(server: FastMCP, getClient: () => N8nClient | null): void {
    // Available nodes resource
    server.addResource({
      uri: `${this.config.baseUri}nodes/available`,
      name: 'n8n Available Nodes',
      mimeType: 'application/json',
      load: async () => {
        const nodes = await this.getAvailableNodes();
        return {
          text: JSON.stringify(nodes, null, 2),
        };
      },
    });

    // Node documentation template
    server.addResourceTemplate({
      uriTemplate: `${this.config.baseUri}nodes/{nodeType}`,
      name: 'n8n Node Documentation',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'nodeType',
          description: 'The type of n8n node (e.g., "n8n-nodes-base.httpRequest")',
          required: true,
        },
      ],
      load: async ({ nodeType }) => {
        const nodeDoc = await this.getNodeDocumentation(nodeType);
        return {
          text: JSON.stringify(nodeDoc, null, 2),
        };
      },
    });

    console.log('📦 Node resources registered');
  }

  /**
   * Register credential template resources
   */
  private registerCredentialResources(server: FastMCP, getClient: () => N8nClient | null): void {
    // Credential types resource
    server.addResource({
      uri: `${this.config.baseUri}credentials/types`,
      name: 'n8n Credential Types',
      mimeType: 'application/json',
      load: async () => {
        const credTypes = await this.getCredentialTypes();
        return {
          text: JSON.stringify(credTypes, null, 2),
        };
      },
    });

    // Credential template
    server.addResourceTemplate({
      uriTemplate: `${this.config.baseUri}credentials/template/{credType}`,
      name: 'n8n Credential Template',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'credType',
          description: 'The credential type name',
          required: true,
        },
      ],
      load: async ({ credType }) => {
        const template = await this.getCredentialTemplate(credType);
        return {
          text: JSON.stringify(template, null, 2),
        };
      },
    });

    console.log('🔐 Credential resources registered');
  }

  /**
   * Register general n8n information resources
   */
  private registerGeneralResources(server: FastMCP, getClient: () => N8nClient | null): void {
    // n8n instance information
    server.addResource({
      uri: `${this.config.baseUri}info`,
      name: 'n8n Instance Information',
      mimeType: 'application/json',
      load: async () => {
        const client = getClient();
        if (!client) {
          throw new Error('n8n client not initialized. Run init-n8n first.');
        }

        const info = await this.getInstanceInfo(client);
        return {
          text: JSON.stringify(info, null, 2),
        };
      },
    });

    // Resource directory/index
    server.addResource({
      uri: `${this.config.baseUri}index`,
      name: 'n8n Resource Directory',
      mimeType: 'application/json',
      load: async () => {
        const directory = this.getResourceDirectory();
        return {
          text: JSON.stringify(directory, null, 2),
        };
      },
    });

    console.log('ℹ️  General resources registered');
  }

  /**
   * Get available n8n nodes (mock data - would need to be retrieved from n8n API)
   */
  private async getAvailableNodes(): Promise<any> {
    // This would typically fetch from n8n API or node registry
    return {
      nodes: [
        {
          name: 'HTTP Request',
          type: 'n8n-nodes-base.httpRequest',
          description: 'Makes HTTP requests and returns the response data',
          category: 'Core Nodes',
          version: 1,
        },
        {
          name: 'Code',
          type: 'n8n-nodes-base.code',
          description: 'Run custom JavaScript code',
          category: 'Core Nodes',
          version: 1,
        },
        {
          name: 'If',
          type: 'n8n-nodes-base.if',
          description: 'Conditional routing based on comparison operations',
          category: 'Core Nodes',
          version: 1,
        },
        // More nodes would be listed here
      ],
      metadata: {
        totalNodes: 500, // Example count
        categories: ['Core Nodes', 'Trigger Nodes', 'Regular Nodes'],
        lastUpdated: new Date().toISOString(),
      },
      resourceInfo: {
        uri: `${this.config.baseUri}nodes/available`,
        type: 'n8n-available-nodes',
        version: '1.0',
        lastAccessed: new Date().toISOString(),
      },
    };
  }

  /**
   * Get node documentation
   */
  private async getNodeDocumentation(nodeType: string): Promise<any> {
    // This would fetch actual node documentation from n8n
    return {
      nodeType,
      name: nodeType.split('.').pop(),
      description: `Documentation for ${nodeType}`,
      parameters: [],
      examples: [],
      resourceInfo: {
        uri: `${this.config.baseUri}nodes/${nodeType}`,
        type: 'n8n-node-documentation',
        version: '1.0',
        lastAccessed: new Date().toISOString(),
      },
    };
  }

  /**
   * Get credential types
   */
  private async getCredentialTypes(): Promise<any> {
    return {
      credentialTypes: [
        {
          name: 'httpBasicAuth',
          displayName: 'Basic Auth',
          properties: ['user', 'password'],
        },
        {
          name: 'httpHeaderAuth',
          displayName: 'Header Auth',
          properties: ['name', 'value'],
        },
        // More credential types
      ],
      metadata: {
        totalTypes: 50, // Example count
        lastUpdated: new Date().toISOString(),
      },
      resourceInfo: {
        uri: `${this.config.baseUri}credentials/types`,
        type: 'n8n-credential-types',
        version: '1.0',
        lastAccessed: new Date().toISOString(),
      },
    };
  }

  /**
   * Get credential template (without sensitive data)
   */
  private async getCredentialTemplate(credType: string): Promise<any> {
    return {
      credentialType: credType,
      template: {
        name: `${credType} Template`,
        type: credType,
        data: {
          // Template structure without actual values
          fields: ['user', 'password'], // Example fields
        },
      },
      resourceInfo: {
        uri: `${this.config.baseUri}credentials/template/${credType}`,
        type: 'n8n-credential-template',
        version: '1.0',
        lastAccessed: new Date().toISOString(),
      },
    };
  }

  /**
   * Get n8n instance information
   */
  private async getInstanceInfo(client: N8nClient): Promise<any> {
    try {
      // Attempt to gather instance information
      const workflows = await client.getWorkflows({ limit: 1 });
      const executions = await client.getExecutions({ limit: 1 });

      return {
        status: 'connected',
        features: {
          workflows: true,
          executions: true,
          // Test for Enterprise features
          projects: await this.testFeature(() => client.getProjects({ limit: 1 })),
          users: await this.testFeature(() => client.getUsers({ limit: 1 })),
          variables: await this.testFeature(() => client.getVariables({ limit: 1 })),
        },
        statistics: {
          totalWorkflows: workflows.data.length,
          totalExecutions: executions.data.length,
        },
        resourceInfo: {
          uri: `${this.config.baseUri}info`,
          type: 'n8n-instance-info',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        resourceInfo: {
          uri: `${this.config.baseUri}info`,
          type: 'n8n-instance-info',
          version: '1.0',
          lastAccessed: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Test if a feature is available
   */
  private async testFeature(testFn: () => Promise<any>): Promise<boolean> {
    try {
      await testFn();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get resource directory
   */
  private getResourceDirectory(): any {
    const resources: any[] = [];

    if (this.config.enableWorkflows) {
      resources.push({
        name: 'Workflows',
        baseUri: `${this.config.baseUri}workflows`,
        description: 'Access n8n workflow definitions and metadata',
        endpoints: [
          `${this.config.baseUri}workflows/list`,
          `${this.config.baseUri}workflows/active`,
          `${this.config.baseUri}workflows/stats`,
          `${this.config.baseUri}workflows/{id}`,
        ],
      });
    }

    if (this.config.enableExecutions) {
      resources.push({
        name: 'Executions',
        baseUri: `${this.config.baseUri}executions`,
        description: 'Access n8n execution data, logs, and statistics',
        endpoints: [
          `${this.config.baseUri}executions/recent`,
          `${this.config.baseUri}executions/failures`,
          `${this.config.baseUri}executions/stats`,
          `${this.config.baseUri}executions/{id}`,
          `${this.config.baseUri}executions/{id}/logs`,
        ],
      });
    }

    if (this.config.enableNodes) {
      resources.push({
        name: 'Nodes',
        baseUri: `${this.config.baseUri}nodes`,
        description: 'Access n8n node documentation and information',
        endpoints: [
          `${this.config.baseUri}nodes/available`,
          `${this.config.baseUri}nodes/{nodeType}`,
        ],
      });
    }

    return {
      resources,
      metadata: {
        totalResources: resources.length,
        baseUri: this.config.baseUri,
        version: '1.0',
      },
      resourceInfo: {
        uri: `${this.config.baseUri}index`,
        type: 'n8n-resource-directory',
        version: '1.0',
        lastAccessed: new Date().toISOString(),
      },
    };
  }

  /**
   * Clear all resource caches
   */
  public clearAllCaches(): void {
    this.workflowResources?.clearCache();
    this.executionResources?.clearCache();
    console.log('🧹 All resource caches cleared');
  }

  /**
   * Get cache statistics for all resources
   */
  public getAllCacheStats(): any {
    return {
      workflows: this.workflowResources?.getCacheStats() || { size: 0, keys: [] },
      executions: this.executionResources?.getCacheStats() || { size: 0, keys: [] },
    };
  }
}

/**
 * Create resource manager
 */
export function createResourceManager(config?: ResourceManagerConfig): ResourceManager {
  return new ResourceManager(config);
}

/**
 * Environment variable configuration for resources
 */
export const RESOURCE_ENV_CONFIG = {
  /** Base URI for resources */
  BASE_URI: 'N8N_MCP_RESOURCE_BASE_URI',

  /** Enable/disable specific resource types */
  ENABLE_WORKFLOWS: 'N8N_MCP_ENABLE_WORKFLOW_RESOURCES',
  ENABLE_EXECUTIONS: 'N8N_MCP_ENABLE_EXECUTION_RESOURCES',
  ENABLE_CREDENTIALS: 'N8N_MCP_ENABLE_CREDENTIAL_RESOURCES',
  ENABLE_NODES: 'N8N_MCP_ENABLE_NODE_RESOURCES',

  /** Global configuration */
  CACHE_DURATION: 'N8N_MCP_RESOURCE_CACHE_DURATION',
  MAX_ITEMS: 'N8N_MCP_RESOURCE_MAX_ITEMS',
} as const;

/**
 * Parse resource configuration from environment variables
 */
export function parseResourceConfigFromEnv(): ResourceManagerConfig {
  return {
    baseUri: process.env[RESOURCE_ENV_CONFIG.BASE_URI] || undefined,
    enableWorkflows: process.env[RESOURCE_ENV_CONFIG.ENABLE_WORKFLOWS] !== 'false',
    enableExecutions: process.env[RESOURCE_ENV_CONFIG.ENABLE_EXECUTIONS] !== 'false',
    enableCredentials: process.env[RESOURCE_ENV_CONFIG.ENABLE_CREDENTIALS] === 'true',
    enableNodes: process.env[RESOURCE_ENV_CONFIG.ENABLE_NODES] !== 'false',
    globalCacheDuration: (() => {
      const value = process.env[RESOURCE_ENV_CONFIG.CACHE_DURATION];
      return value ? parseInt(value) : undefined;
    })(),
    maxItems: (() => {
      const value = process.env[RESOURCE_ENV_CONFIG.MAX_ITEMS];
      return value ? parseInt(value) : undefined;
    })(),
  };
}
