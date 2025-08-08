/**
 * MCP Server Registry
 * 
 * Central registry for managing multiple MCP server connections and their capabilities.
 * Supports dynamic discovery, real-time synchronization, and capability versioning.
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// Schemas for MCP server configuration and capabilities
export const MCPServerConfigSchema = z.object({
  id: z.string().min(1, 'Server ID is required'),
  name: z.string().min(1, 'Server name is required'),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  transport: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('stdio'),
      command: z.string(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string()).optional(),
    }),
    z.object({
      type: z.literal('sse'),
      url: z.string().url(),
      headers: z.record(z.string()).optional(),
    }),
  ]),
  auth: z.object({
    type: z.enum(['none', 'api-key', 'oauth2']),
    credentials: z.record(z.any()).optional(),
  }).optional(),
  enabled: z.boolean().default(true),
  reconnect: z.object({
    enabled: z.boolean().default(true),
    maxAttempts: z.number().min(1).default(5),
    delay: z.number().min(100).default(1000),
  }).optional(),
});

export const MCPToolCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.any(),
  annotations: z.object({
    title: z.string().optional(),
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
  }).optional(),
});

export const MCPResourceCapabilitySchema = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});

export const MCPPromptCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  arguments: z.array(z.object({
    name: z.string(),
    description: z.string(),
    required: z.boolean(),
  })).optional(),
});

export const MCPServerCapabilitiesSchema = z.object({
  tools: z.array(MCPToolCapabilitySchema).default([]),
  resources: z.array(MCPResourceCapabilitySchema).default([]),
  prompts: z.array(MCPPromptCapabilitySchema).default([]),
  resourceTemplates: z.array(z.any()).default([]),
  lastUpdated: z.string().datetime(),
  version: z.string().default('1.0.0'),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type MCPToolCapability = z.infer<typeof MCPToolCapabilitySchema>;
export type MCPResourceCapability = z.infer<typeof MCPResourceCapabilitySchema>;
export type MCPPromptCapability = z.infer<typeof MCPPromptCapabilitySchema>;
export type MCPServerCapabilities = z.infer<typeof MCPServerCapabilitiesSchema>;

/**
 * Status of an MCP server connection
 */
export enum MCPServerStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  RECONNECTING = 'reconnecting',
}

/**
 * MCP Server Connection represents a single MCP server and its state
 */
export interface MCPServerConnection {
  config: MCPServerConfig;
  status: MCPServerStatus;
  client: Client | null;
  capabilities: MCPServerCapabilities | null;
  lastSeen: Date;
  errors: string[];
  reconnectAttempts: number;
  metadata: {
    connectedAt?: Date;
    lastCapabilitySync?: Date;
    totalToolCalls?: number;
    averageResponseTime?: number;
  };
}

/**
 * Registry events for capability changes and server lifecycle
 */
export interface MCPServerRegistryEvents {
  'server-connected': { serverId: string; capabilities: MCPServerCapabilities };
  'server-disconnected': { serverId: string; reason: string };
  'server-error': { serverId: string; error: Error };
  'capabilities-updated': { serverId: string; capabilities: MCPServerCapabilities };
  'tool-registered': { serverId: string; tool: MCPToolCapability };
  'tool-unregistered': { serverId: string; toolName: string };
  'registry-updated': { totalServers: number; connectedServers: number };
}

/**
 * MCP Server Registry
 * 
 * Central registry for managing MCP server connections and capabilities
 */
export class MCPServerRegistry extends EventEmitter {
  private servers = new Map<string, MCPServerConnection>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly healthCheckIntervalMs = 30000; // 30 seconds

  constructor() {
    super();
    this.startHealthChecks();
  }

  /**
   * Register a new MCP server with the registry
   */
  async registerServer(config: MCPServerConfig): Promise<void> {
    const validatedConfig = MCPServerConfigSchema.parse(config);
    
    if (this.servers.has(validatedConfig.id)) {
      throw new Error(`Server with ID '${validatedConfig.id}' is already registered`);
    }

    const connection: MCPServerConnection = {
      config: validatedConfig,
      status: MCPServerStatus.DISCONNECTED,
      client: null,
      capabilities: null,
      lastSeen: new Date(),
      errors: [],
      reconnectAttempts: 0,
      metadata: {},
    };

    this.servers.set(validatedConfig.id, connection);

    // Auto-connect if enabled
    if (validatedConfig.enabled) {
      await this.connectServer(validatedConfig.id);
    }

    this.emitRegistryUpdate();
  }

  /**
   * Unregister an MCP server from the registry
   */
  async unregisterServer(serverId: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection) {
      throw new Error(`Server '${serverId}' not found in registry`);
    }

    await this.disconnectServer(serverId);
    this.servers.delete(serverId);
    this.emitRegistryUpdate();
  }

  /**
   * Connect to an MCP server
   */
  async connectServer(serverId: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection) {
      throw new Error(`Server '${serverId}' not found in registry`);
    }

    if (connection.status === MCPServerStatus.CONNECTED) {
      return; // Already connected
    }

    try {
      connection.status = MCPServerStatus.CONNECTING;
      connection.errors = [];

      // Create client based on transport type
      const client = new Client({
        name: 'n8n-mcp-discovery',
        version: '1.0.0',
      }, {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {},
          sampling: {},
        },
      });

      // Create transport based on configuration
      let transport;
      if (connection.config.transport.type === 'stdio') {
        const { command, args = [], env } = connection.config.transport;
        transport = new StdioClientTransport({
          command,
          args,
          env: { ...process.env, ...env },
        });
      } else {
        const { url, headers } = connection.config.transport;
        transport = new SSEClientTransport(new URL(url));
        
        // Add authentication headers if configured
        if (connection.config.auth?.type === 'api-key' && connection.config.auth.credentials?.apiKey) {
          // Headers would be set through transport configuration if supported
        }
      }

      // Connect to the server
      await client.connect(transport);

      connection.client = client;
      connection.status = MCPServerStatus.CONNECTED;
      connection.lastSeen = new Date();
      connection.metadata.connectedAt = new Date();
      connection.reconnectAttempts = 0;

      // Discover capabilities
      await this.discoverCapabilities(serverId);

      this.emit('server-connected', {
        serverId,
        capabilities: connection.capabilities!,
      });

    } catch (error) {
      connection.status = MCPServerStatus.ERROR;
      connection.errors.push(error instanceof Error ? error.message : String(error));
      
      this.emit('server-error', {
        serverId,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      // Schedule reconnection if enabled
      this.scheduleReconnect(serverId);
      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection || !connection.client) {
      return;
    }

    try {
      await connection.client.close();
    } catch (error) {
      // Log error but don't throw - we want to clean up regardless
      connection.errors.push(`Disconnect error: ${error instanceof Error ? error.message : String(error)}`);
    }

    connection.client = null;
    connection.status = MCPServerStatus.DISCONNECTED;
    connection.capabilities = null;

    this.emit('server-disconnected', {
      serverId,
      reason: 'Manual disconnect',
    });
  }

  /**
   * Discover capabilities from an MCP server
   */
  private async discoverCapabilities(serverId: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection?.client) {
      throw new Error(`Server '${serverId}' is not connected`);
    }

    try {
      const capabilities: MCPServerCapabilities = {
        tools: [],
        resources: [],
        prompts: [],
        resourceTemplates: [],
        lastUpdated: new Date().toISOString(),
        version: connection.config.version,
      };

      // Discover tools
      try {
        const toolsResponse = await connection.client.request(
          { method: 'tools/list' },
          { method: 'tools/list', params: {} }
        );
        
        if (toolsResponse.tools) {
          capabilities.tools = toolsResponse.tools.map((tool: any) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
          }));
        }
      } catch (error) {
        // Tools capability might not be supported
        connection.errors.push(`Tool discovery failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Discover resources
      try {
        const resourcesResponse = await connection.client.request(
          { method: 'resources/list' },
          { method: 'resources/list', params: {} }
        );
        
        if (resourcesResponse.resources) {
          capabilities.resources = resourcesResponse.resources.map((resource: any) => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
          }));
        }
      } catch (error) {
        // Resources capability might not be supported
        connection.errors.push(`Resource discovery failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Discover prompts
      try {
        const promptsResponse = await connection.client.request(
          { method: 'prompts/list' },
          { method: 'prompts/list', params: {} }
        );
        
        if (promptsResponse.prompts) {
          capabilities.prompts = promptsResponse.prompts.map((prompt: any) => ({
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments,
          }));
        }
      } catch (error) {
        // Prompts capability might not be supported
        connection.errors.push(`Prompt discovery failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      connection.capabilities = capabilities;
      connection.metadata.lastCapabilitySync = new Date();

      this.emit('capabilities-updated', {
        serverId,
        capabilities,
      });

    } catch (error) {
      throw new Error(`Failed to discover capabilities: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all registered servers
   */
  getServers(): Map<string, MCPServerConnection> {
    return new Map(this.servers);
  }

  /**
   * Get a specific server by ID
   */
  getServer(serverId: string): MCPServerConnection | null {
    return this.servers.get(serverId) || null;
  }

  /**
   * Get all capabilities from all connected servers
   */
  getAllCapabilities(): Map<string, MCPServerCapabilities> {
    const capabilities = new Map<string, MCPServerCapabilities>();
    
    for (const [serverId, connection] of this.servers) {
      if (connection.status === MCPServerStatus.CONNECTED && connection.capabilities) {
        capabilities.set(serverId, connection.capabilities);
      }
    }

    return capabilities;
  }

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): Map<string, MCPToolCapability[]> {
    const tools = new Map<string, MCPToolCapability[]>();
    
    for (const [serverId, connection] of this.servers) {
      if (connection.status === MCPServerStatus.CONNECTED && connection.capabilities) {
        tools.set(serverId, connection.capabilities.tools);
      }
    }

    return tools;
  }

  /**
   * Schedule reconnection for a server
   */
  private scheduleReconnect(serverId: string): void {
    const connection = this.servers.get(serverId);
    if (!connection?.config.reconnect?.enabled) {
      return;
    }

    const maxAttempts = connection.config.reconnect.maxAttempts || 5;
    const delay = connection.config.reconnect.delay || 1000;

    if (connection.reconnectAttempts >= maxAttempts) {
      connection.status = MCPServerStatus.ERROR;
      connection.errors.push(`Max reconnection attempts (${maxAttempts}) exceeded`);
      return;
    }

    connection.reconnectAttempts++;
    connection.status = MCPServerStatus.RECONNECTING;

    setTimeout(async () => {
      try {
        await this.connectServer(serverId);
      } catch (error) {
        // Error is already handled in connectServer
      }
    }, delay * connection.reconnectAttempts); // Exponential backoff
  }

  /**
   * Start health checks for all servers
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckIntervalMs);
  }

  /**
   * Perform health checks on all connected servers
   */
  private async performHealthChecks(): Promise<void> {
    for (const [serverId, connection] of this.servers) {
      if (connection.status === MCPServerStatus.CONNECTED && connection.client) {
        try {
          // Simple ping to check if server is still responding
          await connection.client.request(
            { method: 'ping' },
            { method: 'ping', params: {} }
          );
          
          connection.lastSeen = new Date();
        } catch (error) {
          // Server might not support ping, try tools/list as fallback
          try {
            await connection.client.request(
              { method: 'tools/list' },
              { method: 'tools/list', params: {} }
            );
            connection.lastSeen = new Date();
          } catch (fallbackError) {
            // Server is not responding, mark as error and schedule reconnect
            connection.status = MCPServerStatus.ERROR;
            connection.errors.push(`Health check failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
            
            this.emit('server-error', {
              serverId,
              error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
            });

            this.scheduleReconnect(serverId);
          }
        }
      }
    }
  }

  /**
   * Emit registry update event
   */
  private emitRegistryUpdate(): void {
    const totalServers = this.servers.size;
    const connectedServers = Array.from(this.servers.values())
      .filter(conn => conn.status === MCPServerStatus.CONNECTED).length;

    this.emit('registry-updated', {
      totalServers,
      connectedServers,
    });
  }

  /**
   * Cleanup and disconnect all servers
   */
  async cleanup(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const disconnectPromises = Array.from(this.servers.keys()).map(
      serverId => this.disconnectServer(serverId)
    );

    await Promise.allSettled(disconnectPromises);
    this.servers.clear();
  }
}

/**
 * Global MCP server registry instance
 */
export const mcpServerRegistry = new MCPServerRegistry();