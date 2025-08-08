/**
 * Dynamic Tool Registration System
 * 
 * Manages hot-reloading of MCP tools as n8n nodes without server restart.
 * Supports versioning, conflict resolution, and real-time synchronization.
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { UserError } from 'fastmcp';
import { MCPServerRegistry, MCPToolCapability, MCPServerConnection } from './mcpServerRegistry.js';
import { ToolToNodeConverter, N8nNodeTypeDescription, ConversionContext } from './toolToNodeConverter.js';

/**
 * Dynamic tool metadata
 */
export interface DynamicToolMetadata {
  serverId: string;
  toolName: string;
  nodeTypeName: string;
  version: string;
  registeredAt: Date;
  lastUpdated: Date;
  callCount: number;
  lastCalled?: Date;
  averageResponseTime?: number;
  errorCount: number;
  lastError?: string;
  status: 'active' | 'inactive' | 'error' | 'deprecated';
}

/**
 * Tool registration conflict information
 */
export interface ToolConflict {
  toolName: string;
  conflictingServers: string[];
  resolutionStrategy: 'prefix' | 'version' | 'manual' | 'error';
  resolvedNodeName?: string;
}

/**
 * Dynamic tool registration events
 */
export interface DynamicToolRegistrationEvents {
  'tool-registered': { serverId: string; toolName: string; nodeType: N8nNodeTypeDescription };
  'tool-unregistered': { serverId: string; toolName: string; nodeTypeName: string };
  'tool-updated': { serverId: string; toolName: string; oldNodeType: N8nNodeTypeDescription; newNodeType: N8nNodeTypeDescription };
  'tool-conflict': { conflict: ToolConflict };
  'tool-error': { serverId: string; toolName: string; error: Error };
  'batch-update-started': { serverId: string; toolCount: number };
  'batch-update-completed': { serverId: string; registered: number; updated: number; errors: number };
}

/**
 * Tool execution context for dynamic tools
 */
export interface DynamicToolExecutionContext {
  serverId: string;
  toolName: string;
  nodeType: N8nNodeTypeDescription;
  metadata: DynamicToolMetadata;
  mcpClient: any; // MCP client for the server
}

/**
 * Configuration for dynamic tool registration
 */
export interface DynamicToolRegistrationConfig {
  conflictResolution: 'prefix' | 'version' | 'manual' | 'error';
  versioningStrategy: 'semantic' | 'timestamp' | 'incremental';
  maxVersionsPerTool: number;
  enableAutoUpdate: boolean;
  updateInterval: number; // ms
  enableMetrics: boolean;
  enableCaching: boolean;
  cacheTimeout: number; // ms
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DynamicToolRegistrationConfig = {
  conflictResolution: 'prefix',
  versioningStrategy: 'timestamp',
  maxVersionsPerTool: 5,
  enableAutoUpdate: true,
  updateInterval: 60000, // 1 minute
  enableMetrics: true,
  enableCaching: true,
  cacheTimeout: 300000, // 5 minutes
};

/**
 * Dynamic Tool Registration Manager
 * 
 * Manages the lifecycle of dynamically registered MCP tools as n8n nodes
 */
export class DynamicToolRegistrationManager extends EventEmitter {
  private registeredTools = new Map<string, DynamicToolMetadata>();
  private nodeTypes = new Map<string, N8nNodeTypeDescription>();
  private toolExecutors = new Map<string, (args: any) => Promise<any>>();
  private conflicts = new Map<string, ToolConflict>();
  private config: DynamicToolRegistrationConfig;
  private updateInterval: NodeJS.Timeout | null = null;
  private mcpRegistry: MCPServerRegistry;

  constructor(
    mcpRegistry: MCPServerRegistry,
    config: Partial<DynamicToolRegistrationConfig> = {}
  ) {
    super();
    this.mcpRegistry = mcpRegistry;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.setupEventListeners();
    this.startAutoUpdate();
  }

  /**
   * Register tools from an MCP server
   */
  async registerServerTools(serverId: string): Promise<void> {
    const serverConnection = this.mcpRegistry.getServer(serverId);
    if (!serverConnection || !serverConnection.capabilities) {
      throw new Error(`Server '${serverId}' not found or has no capabilities`);
    }

    const tools = serverConnection.capabilities.tools;
    if (!tools || tools.length === 0) {
      return;
    }

    this.emit('batch-update-started', { serverId, toolCount: tools.length });

    let registered = 0;
    let updated = 0;
    let errors = 0;

    for (const tool of tools) {
      try {
        const isUpdate = this.isToolRegistered(serverId, tool.name);
        await this.registerTool(serverId, tool, serverConnection);
        
        if (isUpdate) {
          updated++;
        } else {
          registered++;
        }
      } catch (error) {
        errors++;
        this.emit('tool-error', {
          serverId,
          toolName: tool.name,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    this.emit('batch-update-completed', { serverId, registered, updated, errors });
  }

  /**
   * Register a single tool from an MCP server
   */
  async registerTool(
    serverId: string,
    tool: MCPToolCapability,
    serverConnection?: MCPServerConnection
  ): Promise<void> {
    try {
      // Get server connection if not provided
      if (!serverConnection) {
        serverConnection = this.mcpRegistry.getServer(serverId);
        if (!serverConnection) {
          throw new Error(`Server '${serverId}' not found`);
        }
      }

      // Check for conflicts
      const conflict = this.detectConflict(serverId, tool.name);
      if (conflict && this.config.conflictResolution === 'error') {
        this.emit('tool-conflict', { conflict });
        throw new Error(`Tool name conflict: ${tool.name} already exists`);
      }

      // Create conversion context
      const context: ConversionContext = {
        serverId,
        toolName: tool.name,
        nodeNamePrefix: this.resolveNodePrefix(serverId, tool.name, conflict),
        routing: {
          baseURL: this.generateToolBaseURL(serverId),
          defaultHeaders: this.generateDefaultHeaders(serverId),
        },
      };

      // Convert tool to node type
      const nodeType = ToolToNodeConverter.convertToolToNode(tool, context);
      const toolKey = this.generateToolKey(serverId, tool.name);
      const existingTool = this.registeredTools.get(toolKey);
      
      // Create or update metadata
      const metadata: DynamicToolMetadata = {
        serverId,
        toolName: tool.name,
        nodeTypeName: nodeType.name,
        version: this.generateVersion(tool, existingTool),
        registeredAt: existingTool?.registeredAt || new Date(),
        lastUpdated: new Date(),
        callCount: existingTool?.callCount || 0,
        lastCalled: existingTool?.lastCalled,
        averageResponseTime: existingTool?.averageResponseTime,
        errorCount: existingTool?.errorCount || 0,
        lastError: existingTool?.lastError,
        status: 'active',
      };

      // Create tool executor
      const executor = this.createToolExecutor(serverId, tool, serverConnection, metadata);

      // Store everything
      const oldNodeType = this.nodeTypes.get(toolKey);
      this.registeredTools.set(toolKey, metadata);
      this.nodeTypes.set(toolKey, nodeType);
      this.toolExecutors.set(toolKey, executor);

      // Emit appropriate event
      if (existingTool && oldNodeType) {
        this.emit('tool-updated', { serverId, toolName: tool.name, oldNodeType, newNodeType: nodeType });
      } else {
        this.emit('tool-registered', { serverId, toolName: tool.name, nodeType });
      }

    } catch (error) {
      throw new Error(`Failed to register tool '${tool.name}' from server '${serverId}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Unregister all tools from an MCP server
   */
  async unregisterServerTools(serverId: string): Promise<void> {
    const toolsToRemove = Array.from(this.registeredTools.entries())
      .filter(([key, metadata]) => metadata.serverId === serverId)
      .map(([key]) => key);

    for (const toolKey of toolsToRemove) {
      const metadata = this.registeredTools.get(toolKey);
      if (metadata) {
        await this.unregisterTool(metadata.serverId, metadata.toolName);
      }
    }
  }

  /**
   * Unregister a single tool
   */
  async unregisterTool(serverId: string, toolName: string): Promise<void> {
    const toolKey = this.generateToolKey(serverId, toolName);
    const metadata = this.registeredTools.get(toolKey);
    
    if (!metadata) {
      return; // Tool not registered
    }

    // Clean up
    this.registeredTools.delete(toolKey);
    this.nodeTypes.delete(toolKey);
    this.toolExecutors.delete(toolKey);

    // Remove from conflicts if present
    this.removeFromConflicts(serverId, toolName);

    this.emit('tool-unregistered', {
      serverId,
      toolName,
      nodeTypeName: metadata.nodeTypeName,
    });
  }

  /**
   * Execute a dynamic tool
   */
  async executeTool(nodeTypeName: string, parameters: any): Promise<any> {
    // Find the tool by node type name
    const toolEntry = Array.from(this.registeredTools.entries())
      .find(([key, metadata]) => metadata.nodeTypeName === nodeTypeName);

    if (!toolEntry) {
      throw new UserError(`Dynamic tool with node type '${nodeTypeName}' not found`);
    }

    const [toolKey, metadata] = toolEntry;
    const executor = this.toolExecutors.get(toolKey);

    if (!executor) {
      throw new UserError(`Executor for tool '${metadata.toolName}' not found`);
    }

    // Update call metrics
    const startTime = Date.now();
    metadata.callCount++;
    metadata.lastCalled = new Date();

    try {
      const result = await executor(parameters);
      
      // Update success metrics
      const responseTime = Date.now() - startTime;
      metadata.averageResponseTime = metadata.averageResponseTime
        ? (metadata.averageResponseTime + responseTime) / 2
        : responseTime;
      
      metadata.status = 'active';
      return result;

    } catch (error) {
      // Update error metrics
      metadata.errorCount++;
      metadata.lastError = error instanceof Error ? error.message : String(error);
      metadata.status = 'error';
      
      throw error;
    }
  }

  /**
   * Get all registered node types
   */
  getNodeTypes(): N8nNodeTypeDescription[] {
    return Array.from(this.nodeTypes.values());
  }

  /**
   * Get node type by name
   */
  getNodeType(nodeTypeName: string): N8nNodeTypeDescription | null {
    const toolEntry = Array.from(this.nodeTypes.entries())
      .find(([key, nodeType]) => nodeType.name === nodeTypeName);
    
    return toolEntry ? toolEntry[1] : null;
  }

  /**
   * Get tool metadata
   */
  getToolMetadata(serverId: string, toolName: string): DynamicToolMetadata | null {
    const toolKey = this.generateToolKey(serverId, toolName);
    return this.registeredTools.get(toolKey) || null;
  }

  /**
   * Get all tool metadata
   */
  getAllToolMetadata(): DynamicToolMetadata[] {
    return Array.from(this.registeredTools.values());
  }

  /**
   * Get current conflicts
   */
  getConflicts(): ToolConflict[] {
    return Array.from(this.conflicts.values());
  }

  /**
   * Check if a tool is registered
   */
  isToolRegistered(serverId: string, toolName: string): boolean {
    const toolKey = this.generateToolKey(serverId, toolName);
    return this.registeredTools.has(toolKey);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<DynamicToolRegistrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart auto-update if interval changed
    if (newConfig.updateInterval || newConfig.enableAutoUpdate !== undefined) {
      this.stopAutoUpdate();
      this.startAutoUpdate();
    }
  }

  /**
   * Setup event listeners for MCP registry
   */
  private setupEventListeners(): void {
    this.mcpRegistry.on('server-connected', async ({ serverId }) => {
      if (this.config.enableAutoUpdate) {
        try {
          await this.registerServerTools(serverId);
        } catch (error) {
          // Emit error but don't throw - this is an auto-update
          this.emit('tool-error', {
            serverId,
            toolName: 'AUTO_REGISTER',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    });

    this.mcpRegistry.on('server-disconnected', async ({ serverId }) => {
      await this.unregisterServerTools(serverId);
    });

    this.mcpRegistry.on('capabilities-updated', async ({ serverId }) => {
      if (this.config.enableAutoUpdate) {
        try {
          await this.registerServerTools(serverId);
        } catch (error) {
          this.emit('tool-error', {
            serverId,
            toolName: 'AUTO_UPDATE',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    });
  }

  /**
   * Start auto-update interval
   */
  private startAutoUpdate(): void {
    if (!this.config.enableAutoUpdate || this.updateInterval) {
      return;
    }

    this.updateInterval = setInterval(async () => {
      // Update capabilities for all connected servers
      const servers = this.mcpRegistry.getServers();
      
      for (const [serverId, connection] of servers) {
        if (connection.status === 'connected') {
          try {
            await this.registerServerTools(serverId);
          } catch (error) {
            // Auto-update errors are logged but don't interrupt the process
          }
        }
      }
    }, this.config.updateInterval);
  }

  /**
   * Stop auto-update interval
   */
  private stopAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Generate tool key for internal storage
   */
  private generateToolKey(serverId: string, toolName: string): string {
    return `${serverId}:${toolName}`;
  }

  /**
   * Detect naming conflicts
   */
  private detectConflict(serverId: string, toolName: string): ToolConflict | null {
    const conflictingServers = Array.from(this.registeredTools.values())
      .filter(metadata => metadata.toolName === toolName && metadata.serverId !== serverId)
      .map(metadata => metadata.serverId);

    if (conflictingServers.length === 0) {
      return null;
    }

    return {
      toolName,
      conflictingServers: [...conflictingServers, serverId],
      resolutionStrategy: this.config.conflictResolution,
    };
  }

  /**
   * Resolve node prefix for conflict resolution
   */
  private resolveNodePrefix(serverId: string, toolName: string, conflict: ToolConflict | null): string {
    if (!conflict) {
      return serverId;
    }

    switch (this.config.conflictResolution) {
      case 'prefix':
        return `${serverId}_${toolName}`;
      case 'version':
        const existingVersions = Array.from(this.registeredTools.values())
          .filter(metadata => metadata.toolName === toolName)
          .map(metadata => metadata.version);
        return `${serverId}_v${existingVersions.length + 1}`;
      default:
        return serverId;
    }
  }

  /**
   * Generate version for tool
   */
  private generateVersion(tool: MCPToolCapability, existingTool?: DynamicToolMetadata): string {
    if (!existingTool) {
      return '1.0.0';
    }

    switch (this.config.versioningStrategy) {
      case 'timestamp':
        return new Date().toISOString();
      case 'incremental':
        const current = parseFloat(existingTool.version);
        return (current + 0.1).toFixed(1);
      case 'semantic':
      default:
        const [major, minor, patch] = existingTool.version.split('.').map(Number);
        return `${major}.${minor}.${patch + 1}`;
    }
  }

  /**
   * Create tool executor function
   */
  private createToolExecutor(
    serverId: string,
    tool: MCPToolCapability,
    serverConnection: MCPServerConnection,
    metadata: DynamicToolMetadata
  ): (args: any) => Promise<any> {
    return async (args: any) => {
      if (!serverConnection.client) {
        throw new UserError(`MCP server '${serverId}' is not connected`);
      }

      try {
        // Call the tool on the MCP server
        const result = await serverConnection.client.request(
          { method: 'tools/call' },
          {
            method: 'tools/call',
            params: {
              name: tool.name,
              arguments: args,
            },
          }
        );

        return result;
      } catch (error) {
        throw new UserError(`MCP tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
  }

  /**
   * Generate tool base URL for routing
   */
  private generateToolBaseURL(serverId: string): string {
    return `/api/v1/mcp/${serverId}`;
  }

  /**
   * Generate default headers for routing
   */
  private generateDefaultHeaders(serverId: string): Record<string, string> {
    return {
      'X-MCP-Server-Id': serverId,
      'X-MCP-Source': 'dynamic-registration',
    };
  }

  /**
   * Remove tool from conflicts
   */
  private removeFromConflicts(serverId: string, toolName: string): void {
    const conflict = this.conflicts.get(toolName);
    if (!conflict) {
      return;
    }

    conflict.conflictingServers = conflict.conflictingServers.filter(id => id !== serverId);
    
    if (conflict.conflictingServers.length <= 1) {
      this.conflicts.delete(toolName);
    }
  }

  /**
   * Cleanup and stop all operations
   */
  async cleanup(): Promise<void> {
    this.stopAutoUpdate();
    
    // Clear all registered tools
    this.registeredTools.clear();
    this.nodeTypes.clear();
    this.toolExecutors.clear();
    this.conflicts.clear();
    
    this.removeAllListeners();
  }
}

/**
 * Export a default instance that can be used throughout the application
 */
export default DynamicToolRegistrationManager;