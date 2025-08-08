/**
 * Discovery Manager
 * 
 * Main integration controller that coordinates all dynamic MCP tool discovery components.
 * Provides unified API for MCP tool registration, execution, and real-time synchronization.
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { FastMCP, UserError } from 'fastmcp';
import { MCPServerRegistry, MCPServerConfig, MCPToolCapability, MCPServerCapabilities } from './mcpServerRegistry.js';
import { DynamicToolRegistrationManager, DynamicToolMetadata, ToolConflict } from './dynamicToolRegistration.js';
import { ToolToNodeConverter, N8nNodeTypeDescription, ConversionContext } from './toolToNodeConverter.js';
import { CapabilitySynchronizer, CapabilityChangeEvent, SynchronizationStatus } from './capabilitySynchronizer.js';
import { EventStreamingManager } from '../transport/eventStreamingManager.js';
import { ConnectionManager } from '../transport/connectionManager.js';

/**
 * Discovery system configuration
 */
export interface DiscoveryManagerConfig {
  enableAutoDiscovery: boolean;
  discoveryInterval: number; // ms
  enableHotReloading: boolean;
  enableRealTimeSync: boolean;
  enableCapabilityVersioning: boolean;
  maxConcurrentConnections: number;
  connectionTimeout: number; // ms
  retryAttempts: number;
  enableMetrics: boolean;
  enableCaching: boolean;
  cacheTimeout: number; // ms
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DiscoveryManagerConfig = {
  enableAutoDiscovery: true,
  discoveryInterval: 60000, // 1 minute
  enableHotReloading: true,
  enableRealTimeSync: true,
  enableCapabilityVersioning: true,
  maxConcurrentConnections: 10,
  connectionTimeout: 30000, // 30 seconds
  retryAttempts: 3,
  enableMetrics: true,
  enableCaching: true,
  cacheTimeout: 300000, // 5 minutes
};

/**
 * Discovery system events
 */
export interface DiscoveryManagerEvents {
  'discovery-started': { timestamp: Date; serversCount: number };
  'discovery-completed': { timestamp: Date; discoveredTools: number; errors: number };
  'server-registered': { serverId: string; config: MCPServerConfig };
  'server-unregistered': { serverId: string; reason: string };
  'tool-discovered': { serverId: string; toolName: string; nodeType: N8nNodeTypeDescription };
  'capability-synchronized': { serverId: string; changeCount: number };
  'error': { source: string; error: Error };
  'metrics-updated': { metrics: DiscoveryMetrics };
}

/**
 * Discovery system metrics
 */
export interface DiscoveryMetrics {
  totalServers: number;
  connectedServers: number;
  totalTools: number;
  totalNodeTypes: number;
  totalCapabilityChanges: number;
  averageResponseTime: number;
  errorRate: number;
  lastDiscoveryTime: Date;
  systemUptime: number;
}

/**
 * Tool execution context for the discovery manager
 */
export interface DiscoveryExecutionContext {
  serverId: string;
  toolName: string;
  nodeTypeName: string;
  parameters: any;
  executionId?: string;
  timestamp: Date;
  metadata: DynamicToolMetadata;
}

/**
 * Discovery Manager
 * 
 * Orchestrates dynamic MCP tool discovery, registration, and execution
 */
export class DiscoveryManager extends EventEmitter {
  private config: DiscoveryManagerConfig;
  private mcpRegistry: MCPServerRegistry;
  private toolRegistrationManager: DynamicToolRegistrationManager;
  private capabilitySynchronizer: CapabilitySynchronizer;
  private eventStreamingManager: EventStreamingManager;
  private connectionManager: ConnectionManager;

  private discoveryInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();
  private metrics: DiscoveryMetrics = {
    totalServers: 0,
    connectedServers: 0,
    totalTools: 0,
    totalNodeTypes: 0,
    totalCapabilityChanges: 0,
    averageResponseTime: 0,
    errorRate: 0,
    lastDiscoveryTime: new Date(),
    systemUptime: 0,
  };

  constructor(
    eventStreamingManager: EventStreamingManager,
    connectionManager: ConnectionManager,
    config: Partial<DiscoveryManagerConfig> = {}
  ) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventStreamingManager = eventStreamingManager;
    this.connectionManager = connectionManager;

    // Initialize core components
    this.mcpRegistry = new MCPServerRegistry();
    this.toolRegistrationManager = new DynamicToolRegistrationManager(this.mcpRegistry);
    this.capabilitySynchronizer = new CapabilitySynchronizer(
      this.mcpRegistry,
      this.toolRegistrationManager,
      this.eventStreamingManager,
      this.connectionManager
    );

    this.setupEventListeners();
    this.startDiscoverySystem();
  }

  /**
   * Register MCP server with the discovery system
   */
  async registerMCPServer(config: MCPServerConfig): Promise<void> {
    try {
      await this.mcpRegistry.registerServer(config);
      this.emit('server-registered', { serverId: config.id, config });
      this.updateMetrics();
    } catch (error) {
      this.emit('error', {
        source: 'server-registration',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Unregister MCP server from the discovery system
   */
  async unregisterMCPServer(serverId: string, reason = 'Manual removal'): Promise<void> {
    try {
      await this.mcpRegistry.unregisterServer(serverId);
      await this.capabilitySynchronizer.stopSynchronization(serverId);
      this.emit('server-unregistered', { serverId, reason });
      this.updateMetrics();
    } catch (error) {
      this.emit('error', {
        source: 'server-unregistration',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Register discovery tools with FastMCP server
   */
  registerWithFastMCP(server: FastMCP): void {
    // Tool to register new MCP servers
    server.addTool({
      name: 'register-mcp-server',
      description: 'Register a new MCP server for dynamic tool discovery',
      parameters: z.object({
        id: z.string().min(1, 'Server ID is required'),
        name: z.string().min(1, 'Server name is required'),
        description: z.string().optional(),
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
        enabled: z.boolean().default(true),
      }),
    }, async ({ id, name, description, transport, enabled }: any) => {
      const config: MCPServerConfig = {
        id,
        name,
        description,
        version: '1.0.0',
        transport,
        enabled,
      };

      await this.registerMCPServer(config);
      return {
        success: true,
        serverId: id,
        message: `MCP server '${name}' registered successfully`,
      };
    });

    // Tool to list discovered tools
    server.addTool({
      name: 'list-discovered-tools',
      description: 'List all dynamically discovered MCP tools and their n8n node types',
      parameters: z.object({
        serverId: z.string().optional(),
        includeMetadata: z.boolean().default(false),
      }),
    }, async ({ serverId, includeMetadata }: any) => {
      const nodeTypes = this.toolRegistrationManager.getNodeTypes();
      const filteredNodeTypes = serverId 
        ? nodeTypes.filter(nt => nt.name.startsWith(serverId))
        : nodeTypes;

      const result = {
        tools: filteredNodeTypes.map(nodeType => ({
          nodeTypeName: nodeType.name,
          displayName: nodeType.displayName,
          description: nodeType.description,
          serverId: this.extractServerIdFromNodeName(nodeType.name),
          metadata: includeMetadata ? this.getToolMetadataFromNodeType(nodeType.name) : undefined,
        })),
        totalTools: filteredNodeTypes.length,
        discoveredAt: new Date().toISOString(),
      };

      return result;
    });

    // Tool to execute dynamic MCP tools
    server.addTool({
      name: 'execute-mcp-tool',
      description: 'Execute a dynamically discovered MCP tool',
      parameters: z.object({
        nodeTypeName: z.string().min(1, 'Node type name is required'),
        parameters: z.record(z.any()).default({}),
        executionId: z.string().optional(),
      }),
    }, async ({ nodeTypeName, parameters, executionId }: any) => {
      return await this.executeMCPTool(nodeTypeName, parameters, executionId);
    });

    // Tool to get synchronization status
    server.addTool({
      name: 'get-sync-status',
      description: 'Get real-time synchronization status for all MCP servers',
      parameters: z.object({
        serverId: z.string().optional(),
      }),
    }, async ({ serverId }: any) => {
      const syncStatus = this.capabilitySynchronizer.getSynchronizationStatus();
      
      if (serverId) {
        const status = syncStatus.get(serverId);
        return status ? { [serverId]: status } : { error: `Server '${serverId}' not found` };
      }
      
      return Object.fromEntries(syncStatus);
    });

    // Tool to force capability synchronization
    server.addTool({
      name: 'force-capability-sync',
      description: 'Force capability synchronization for an MCP server',
      parameters: z.object({
        serverId: z.string().min(1, 'Server ID is required'),
      }),
    }, async ({ serverId }: any) => {
      await this.capabilitySynchronizer.forceSynchronization(serverId);
      return {
        success: true,
        serverId,
        message: 'Capability synchronization completed',
        timestamp: new Date().toISOString(),
      };
    });

    // Tool to get discovery metrics
    server.addTool({
      name: 'get-discovery-metrics',
      description: 'Get comprehensive metrics about the discovery system',
      parameters: z.object({
        includeHistory: z.boolean().default(false),
      }),
    }, async ({ includeHistory }: any) => {
      const metrics = this.getMetrics();
      const conflicts = this.toolRegistrationManager.getConflicts();
      
      const result: any = {
        metrics,
        conflicts,
        lastUpdated: new Date().toISOString(),
      };

      if (includeHistory) {
        result.changeHistory = this.capabilitySynchronizer.getRecentChanges(50);
      }

      return result;
    });

    console.log('🔧 Discovery management tools registered with FastMCP');
  }

  /**
   * Execute a dynamically discovered MCP tool
   */
  async executeMCPTool(nodeTypeName: string, parameters: any, executionId?: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Create execution context
      const context: DiscoveryExecutionContext = {
        serverId: this.extractServerIdFromNodeName(nodeTypeName),
        toolName: this.extractToolNameFromNodeName(nodeTypeName),
        nodeTypeName,
        parameters,
        executionId,
        timestamp: new Date(),
        metadata: this.getToolMetadataFromNodeType(nodeTypeName),
      };

      // Execute the tool
      const result = await this.toolRegistrationManager.executeTool(nodeTypeName, parameters);
      
      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateExecutionMetrics(responseTime, true);
      
      return {
        success: true,
        result,
        executionContext: {
          nodeTypeName,
          serverId: context.serverId,
          toolName: context.toolName,
          executionId: context.executionId,
          responseTime,
          timestamp: context.timestamp.toISOString(),
        },
      };

    } catch (error) {
      // Update error metrics
      const responseTime = Date.now() - startTime;
      this.updateExecutionMetrics(responseTime, false);
      
      throw new UserError(`MCP tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get current discovery metrics
   */
  getMetrics(): DiscoveryMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get registered MCP servers
   */
  getMCPServers(): Map<string, any> {
    return this.mcpRegistry.getServers();
  }

  /**
   * Get capability change history
   */
  getCapabilityChangeHistory(serverId?: string, limit = 100): CapabilityChangeEvent[] {
    if (serverId) {
      return this.capabilitySynchronizer.getChangeHistory(serverId);
    }
    return this.capabilitySynchronizer.getRecentChanges(limit);
  }

  /**
   * Update system configuration
   */
  updateConfig(newConfig: Partial<DiscoveryManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart discovery if interval changed
    if (newConfig.discoveryInterval) {
      this.stopDiscoverySystem();
      this.startDiscoverySystem();
    }
    
    // Update component configurations
    this.toolRegistrationManager.updateConfig({
      enableAutoUpdate: this.config.enableAutoDiscovery,
      updateInterval: this.config.discoveryInterval,
    });
    
    this.capabilitySynchronizer.updateConfig({
      enablePolling: this.config.enableAutoDiscovery,
      pollingInterval: this.config.discoveryInterval,
      enableWebSocketSync: this.config.enableRealTimeSync,
    });
  }

  /**
   * Setup event listeners for all components
   */
  private setupEventListeners(): void {
    // MCP Registry events
    this.mcpRegistry.on('server-connected', ({ serverId, capabilities }) => {
      this.emit('server-registered', { serverId, config: this.mcpRegistry.getServer(serverId)!.config });
    });

    this.mcpRegistry.on('server-disconnected', ({ serverId, reason }) => {
      this.emit('server-unregistered', { serverId, reason });
    });

    this.mcpRegistry.on('server-error', ({ serverId, error }) => {
      this.emit('error', { source: `server-${serverId}`, error });
    });

    // Tool Registration events
    this.toolRegistrationManager.on('tool-registered', ({ serverId, toolName, nodeType }) => {
      this.emit('tool-discovered', { serverId, toolName, nodeType });
      this.updateMetrics();
    });

    this.toolRegistrationManager.on('tool-unregistered', ({ serverId, toolName }) => {
      this.updateMetrics();
    });

    // Capability Synchronization events
    this.capabilitySynchronizer.on('sync-completed', ({ serverId, changeCount }) => {
      this.emit('capability-synchronized', { serverId, changeCount });
      this.metrics.totalCapabilityChanges += changeCount;
    });

    this.capabilitySynchronizer.on('sync-error', ({ serverId, error }) => {
      this.emit('error', { source: `sync-${serverId}`, error });
    });
  }

  /**
   * Start the discovery system
   */
  private startDiscoverySystem(): void {
    if (!this.config.enableAutoDiscovery || this.discoveryInterval) {
      return;
    }

    this.discoveryInterval = setInterval(() => {
      this.performDiscoveryRound();
    }, this.config.discoveryInterval);

    this.emit('discovery-started', {
      timestamp: new Date(),
      serversCount: this.mcpRegistry.getServers().size,
    });
  }

  /**
   * Stop the discovery system
   */
  private stopDiscoverySystem(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
  }

  /**
   * Perform a discovery round
   */
  private async performDiscoveryRound(): Promise<void> {
    const startTime = Date.now();
    let discoveredTools = 0;
    let errors = 0;

    const servers = this.mcpRegistry.getServers();
    
    for (const [serverId, connection] of servers) {
      if (connection.status === 'connected') {
        try {
          const toolsBefore = this.toolRegistrationManager.getAllToolMetadata().length;
          await this.toolRegistrationManager.registerServerTools(serverId);
          const toolsAfter = this.toolRegistrationManager.getAllToolMetadata().length;
          
          discoveredTools += (toolsAfter - toolsBefore);
        } catch (error) {
          errors++;
          this.emit('error', {
            source: `discovery-${serverId}`,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    }

    this.metrics.lastDiscoveryTime = new Date();
    
    this.emit('discovery-completed', {
      timestamp: new Date(),
      discoveredTools,
      errors,
    });
  }

  /**
   * Update system metrics
   */
  private updateMetrics(): void {
    const servers = this.mcpRegistry.getServers();
    const toolMetadata = this.toolRegistrationManager.getAllToolMetadata();
    const nodeTypes = this.toolRegistrationManager.getNodeTypes();

    this.metrics.totalServers = servers.size;
    this.metrics.connectedServers = Array.from(servers.values())
      .filter(conn => conn.status === 'connected').length;
    this.metrics.totalTools = toolMetadata.length;
    this.metrics.totalNodeTypes = nodeTypes.length;
    this.metrics.systemUptime = Date.now() - this.startTime;

    if (this.config.enableMetrics) {
      this.emit('metrics-updated', { metrics: this.metrics });
    }
  }

  /**
   * Update execution metrics
   */
  private updateExecutionMetrics(responseTime: number, success: boolean): void {
    // Update average response time
    this.metrics.averageResponseTime = this.metrics.averageResponseTime
      ? (this.metrics.averageResponseTime + responseTime) / 2
      : responseTime;

    // Update error rate (simplified calculation)
    if (!success) {
      this.metrics.errorRate = Math.min(this.metrics.errorRate + 0.01, 1.0);
    } else {
      this.metrics.errorRate = Math.max(this.metrics.errorRate - 0.001, 0.0);
    }
  }

  /**
   * Extract server ID from node type name
   */
  private extractServerIdFromNodeName(nodeTypeName: string): string {
    return nodeTypeName.split('_')[0];
  }

  /**
   * Extract tool name from node type name
   */
  private extractToolNameFromNodeName(nodeTypeName: string): string {
    const parts = nodeTypeName.split('_');
    return parts.slice(1).join('_');
  }

  /**
   * Get tool metadata from node type name
   */
  private getToolMetadataFromNodeType(nodeTypeName: string): DynamicToolMetadata {
    const serverId = this.extractServerIdFromNodeName(nodeTypeName);
    const toolName = this.extractToolNameFromNodeName(nodeTypeName);
    
    return this.toolRegistrationManager.getToolMetadata(serverId, toolName) || {
      serverId,
      toolName,
      nodeTypeName,
      version: '1.0.0',
      registeredAt: new Date(),
      lastUpdated: new Date(),
      callCount: 0,
      errorCount: 0,
      status: 'active',
    };
  }

  /**
   * Cleanup and stop all operations
   */
  async cleanup(): Promise<void> {
    this.stopDiscoverySystem();
    
    // Cleanup all components
    await this.capabilitySynchronizer.cleanup();
    await this.toolRegistrationManager.cleanup();
    await this.mcpRegistry.cleanup();
    
    this.removeAllListeners();
  }
}

/**
 * Create discovery manager instance
 */
export function createDiscoveryManager(
  eventStreamingManager: EventStreamingManager,
  connectionManager: ConnectionManager,
  config?: Partial<DiscoveryManagerConfig>
): DiscoveryManager {
  return new DiscoveryManager(eventStreamingManager, connectionManager, config);
}

/**
 * Export default instance
 */
export default DiscoveryManager;