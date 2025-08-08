/**
 * Capability Synchronizer
 * 
 * Real-time synchronization system for MCP server capabilities using WebSocket/SSE.
 * Monitors capability changes and propagates updates without server restart.
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { MCPServerRegistry, MCPServerCapabilities, MCPServerConnection } from './mcpServerRegistry.js';
import { DynamicToolRegistrationManager } from './dynamicToolRegistration.js';
import { EventStreamingManager } from '../transport/eventStreamingManager.js';
import { ConnectionManager } from '../transport/connectionManager.js';
import { N8nWebSocketClient } from '../transport/websocketClient.js';

/**
 * Capability change event types
 */
export enum CapabilityChangeType {
  TOOL_ADDED = 'tool_added',
  TOOL_REMOVED = 'tool_removed',
  TOOL_UPDATED = 'tool_updated',
  RESOURCE_ADDED = 'resource_added',
  RESOURCE_REMOVED = 'resource_removed',
  RESOURCE_UPDATED = 'resource_updated',
  PROMPT_ADDED = 'prompt_added',
  PROMPT_REMOVED = 'prompt_removed',
  PROMPT_UPDATED = 'prompt_updated',
  SERVER_CAPABILITIES_UPDATED = 'server_capabilities_updated',
}

/**
 * Capability change event data
 */
export interface CapabilityChangeEvent {
  id: string;
  timestamp: Date;
  serverId: string;
  type: CapabilityChangeType;
  data: {
    before?: any;
    after?: any;
    metadata?: Record<string, any>;
  };
  source: 'polling' | 'notification' | 'websocket' | 'manual';
  version: string;
}

/**
 * Synchronization status for each server
 */
export interface SynchronizationStatus {
  serverId: string;
  lastSync: Date;
  syncInterval: number;
  status: 'active' | 'paused' | 'error' | 'disconnected';
  errorCount: number;
  lastError?: string;
  capabilityVersion: string;
  changeCount: number;
  averageSyncTime: number;
}

/**
 * Capability synchronization configuration
 */
export interface CapabilitySynchronizationConfig {
  pollingInterval: number; // ms
  enablePolling: boolean;
  enableWebSocketSync: boolean;
  enableNotifications: boolean;
  batchUpdateDelay: number; // ms
  maxRetries: number;
  retryBackoffMultiplier: number;
  compressionEnabled: boolean;
  persistChanges: boolean;
  changeHistoryLimit: number;
  enableMetrics: boolean;
}

/**
 * Default synchronization configuration
 */
const DEFAULT_SYNC_CONFIG: CapabilitySynchronizationConfig = {
  pollingInterval: 30000, // 30 seconds
  enablePolling: true,
  enableWebSocketSync: true,
  enableNotifications: true,
  batchUpdateDelay: 1000, // 1 second
  maxRetries: 3,
  retryBackoffMultiplier: 2,
  compressionEnabled: true,
  persistChanges: true,
  changeHistoryLimit: 1000,
  enableMetrics: true,
};

/**
 * Synchronization events
 */
export interface CapabilitySynchronizerEvents {
  'capability-change': CapabilityChangeEvent;
  'sync-started': { serverId: string; timestamp: Date };
  'sync-completed': { serverId: string; changeCount: number; duration: number };
  'sync-error': { serverId: string; error: Error; retryCount: number };
  'batch-update': { serverId: string; changes: CapabilityChangeEvent[] };
  'connection-status': { serverId: string; connected: boolean };
  'metrics-updated': { serverId: string; status: SynchronizationStatus };
}

/**
 * Capability Synchronizer
 * 
 * Manages real-time synchronization of MCP server capabilities
 */
export class CapabilitySynchronizer extends EventEmitter {
  private mcpRegistry: MCPServerRegistry;
  private toolRegistrationManager: DynamicToolRegistrationManager;
  private eventStreamingManager: EventStreamingManager;
  private connectionManager: ConnectionManager;
  private config: CapabilitySynchronizationConfig;

  private synchronizationStatus = new Map<string, SynchronizationStatus>();
  private changeHistory = new Map<string, CapabilityChangeEvent[]>();
  private pollingIntervals = new Map<string, NodeJS.Timeout>();
  private batchUpdateTimers = new Map<string, NodeJS.Timeout>();
  private websocketClients = new Map<string, N8nWebSocketClient>();
  private retryCounters = new Map<string, number>();

  constructor(
    mcpRegistry: MCPServerRegistry,
    toolRegistrationManager: DynamicToolRegistrationManager,
    eventStreamingManager: EventStreamingManager,
    connectionManager: ConnectionManager,
    config: Partial<CapabilitySynchronizationConfig> = {}
  ) {
    super();
    
    this.mcpRegistry = mcpRegistry;
    this.toolRegistrationManager = toolRegistrationManager;
    this.eventStreamingManager = eventStreamingManager;
    this.connectionManager = connectionManager;
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };

    this.setupEventListeners();
    this.initializeExistingServers();
  }

  /**
   * Start synchronization for a specific server
   */
  async startSynchronization(serverId: string): Promise<void> {
    const serverConnection = this.mcpRegistry.getServer(serverId);
    if (!serverConnection) {
      throw new Error(`Server '${serverId}' not found in registry`);
    }

    // Initialize synchronization status
    const status: SynchronizationStatus = {
      serverId,
      lastSync: new Date(),
      syncInterval: this.config.pollingInterval,
      status: 'active',
      errorCount: 0,
      capabilityVersion: serverConnection.capabilities?.version || '1.0.0',
      changeCount: 0,
      averageSyncTime: 0,
    };

    this.synchronizationStatus.set(serverId, status);
    this.changeHistory.set(serverId, []);
    this.retryCounters.set(serverId, 0);

    // Start different synchronization methods
    if (this.config.enablePolling) {
      this.startPollingSync(serverId);
    }

    if (this.config.enableWebSocketSync) {
      await this.startWebSocketSync(serverId);
    }

    if (this.config.enableNotifications) {
      this.startNotificationSync(serverId);
    }

    this.emit('sync-started', { serverId, timestamp: new Date() });
  }

  /**
   * Stop synchronization for a specific server
   */
  async stopSynchronization(serverId: string): Promise<void> {
    // Stop polling
    const pollingInterval = this.pollingIntervals.get(serverId);
    if (pollingInterval) {
      clearInterval(pollingInterval);
      this.pollingIntervals.delete(serverId);
    }

    // Stop batch update timer
    const batchTimer = this.batchUpdateTimers.get(serverId);
    if (batchTimer) {
      clearTimeout(batchTimer);
      this.batchUpdateTimers.delete(serverId);
    }

    // Close WebSocket connection
    const websocketClient = this.websocketClients.get(serverId);
    if (websocketClient) {
      await websocketClient.disconnect();
      this.websocketClients.delete(serverId);
    }

    // Update status
    const status = this.synchronizationStatus.get(serverId);
    if (status) {
      status.status = 'disconnected';
      this.emit('metrics-updated', { serverId, status });
    }

    // Clean up
    this.synchronizationStatus.delete(serverId);
    this.retryCounters.delete(serverId);

    this.emit('connection-status', { serverId, connected: false });
  }

  /**
   * Force synchronization for a server
   */
  async forceSynchronization(serverId: string): Promise<void> {
    const serverConnection = this.mcpRegistry.getServer(serverId);
    if (!serverConnection) {
      throw new Error(`Server '${serverId}' not found`);
    }

    const status = this.synchronizationStatus.get(serverId);
    if (!status) {
      throw new Error(`Synchronization not started for server '${serverId}'`);
    }

    await this.performCapabilitySync(serverId, 'manual');
  }

  /**
   * Get synchronization status for all servers
   */
  getSynchronizationStatus(): Map<string, SynchronizationStatus> {
    return new Map(this.synchronizationStatus);
  }

  /**
   * Get change history for a server
   */
  getChangeHistory(serverId: string): CapabilityChangeEvent[] {
    return this.changeHistory.get(serverId) || [];
  }

  /**
   * Get recent changes across all servers
   */
  getRecentChanges(limit: number = 100): CapabilityChangeEvent[] {
    const allChanges: CapabilityChangeEvent[] = [];
    
    for (const changes of this.changeHistory.values()) {
      allChanges.push(...changes);
    }

    return allChanges
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CapabilitySynchronizationConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Restart polling if interval changed
    if (newConfig.pollingInterval && newConfig.pollingInterval !== oldConfig.pollingInterval) {
      for (const serverId of this.pollingIntervals.keys()) {
        this.stopPollingSync(serverId);
        if (this.config.enablePolling) {
          this.startPollingSync(serverId);
        }
      }
    }

    // Update WebSocket connections if needed
    if (newConfig.enableWebSocketSync !== oldConfig.enableWebSocketSync) {
      for (const serverId of this.websocketClients.keys()) {
        if (this.config.enableWebSocketSync) {
          this.startWebSocketSync(serverId);
        } else {
          this.stopWebSocketSync(serverId);
        }
      }
    }
  }

  /**
   * Setup event listeners for registry and tool manager
   */
  private setupEventListeners(): void {
    // MCP Registry events
    this.mcpRegistry.on('server-connected', async ({ serverId }) => {
      await this.startSynchronization(serverId);
    });

    this.mcpRegistry.on('server-disconnected', async ({ serverId }) => {
      await this.stopSynchronization(serverId);
    });

    this.mcpRegistry.on('capabilities-updated', ({ serverId, capabilities }) => {
      this.handleCapabilitiesUpdated(serverId, capabilities);
    });

    // Tool Registration events
    this.toolRegistrationManager.on('tool-registered', ({ serverId, toolName, nodeType }) => {
      this.recordCapabilityChange(serverId, {
        type: CapabilityChangeType.TOOL_ADDED,
        data: { after: { toolName, nodeType } },
        source: 'notification',
      });
    });

    this.toolRegistrationManager.on('tool-unregistered', ({ serverId, toolName, nodeTypeName }) => {
      this.recordCapabilityChange(serverId, {
        type: CapabilityChangeType.TOOL_REMOVED,
        data: { before: { toolName, nodeTypeName } },
        source: 'notification',
      });
    });

    this.toolRegistrationManager.on('tool-updated', ({ serverId, toolName, oldNodeType, newNodeType }) => {
      this.recordCapabilityChange(serverId, {
        type: CapabilityChangeType.TOOL_UPDATED,
        data: { before: oldNodeType, after: newNodeType },
        source: 'notification',
      });
    });
  }

  /**
   * Initialize synchronization for existing servers
   */
  private async initializeExistingServers(): Promise<void> {
    const servers = this.mcpRegistry.getServers();
    
    for (const [serverId, connection] of servers) {
      if (connection.status === 'connected') {
        try {
          await this.startSynchronization(serverId);
        } catch (error) {
          // Log error but continue with other servers
          console.error(`Failed to initialize synchronization for server '${serverId}':`, error);
        }
      }
    }
  }

  /**
   * Start polling-based synchronization
   */
  private startPollingSync(serverId: string): void {
    if (this.pollingIntervals.has(serverId)) {
      return; // Already polling
    }

    const interval = setInterval(async () => {
      try {
        await this.performCapabilitySync(serverId, 'polling');
      } catch (error) {
        this.handleSyncError(serverId, error instanceof Error ? error : new Error(String(error)));
      }
    }, this.config.pollingInterval);

    this.pollingIntervals.set(serverId, interval);
  }

  /**
   * Stop polling-based synchronization
   */
  private stopPollingSync(serverId: string): void {
    const interval = this.pollingIntervals.get(serverId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(serverId);
    }
  }

  /**
   * Start WebSocket-based synchronization
   */
  private async startWebSocketSync(serverId: string): Promise<void> {
    try {
      const serverConnection = this.mcpRegistry.getServer(serverId);
      if (!serverConnection) {
        throw new Error(`Server '${serverId}' not found`);
      }

      // Create WebSocket client for capability notifications
      const websocketClient = new N8nWebSocketClient({
        url: this.generateWebSocketUrl(serverId),
        autoReconnect: true,
        maxReconnectAttempts: this.config.maxRetries,
        reconnectInterval: 5000,
      });

      // Setup event listeners
      websocketClient.on('message', (message) => {
        this.handleWebSocketMessage(serverId, message);
      });

      websocketClient.on('connected', () => {
        this.emit('connection-status', { serverId, connected: true });
      });

      websocketClient.on('disconnected', () => {
        this.emit('connection-status', { serverId, connected: false });
      });

      websocketClient.on('error', (error) => {
        this.handleSyncError(serverId, error);
      });

      // Connect
      await websocketClient.connect();
      this.websocketClients.set(serverId, websocketClient);

    } catch (error) {
      // WebSocket sync is optional, log error but don't fail
      console.warn(`Failed to start WebSocket sync for server '${serverId}':`, error);
    }
  }

  /**
   * Stop WebSocket-based synchronization
   */
  private async stopWebSocketSync(serverId: string): Promise<void> {
    const websocketClient = this.websocketClients.get(serverId);
    if (websocketClient) {
      await websocketClient.disconnect();
      this.websocketClients.delete(serverId);
    }
  }

  /**
   * Start notification-based synchronization
   */
  private startNotificationSync(serverId: string): void {
    // This would integrate with MCP server notifications
    // For now, it's implemented as part of the registry event handling
  }

  /**
   * Perform capability synchronization
   */
  private async performCapabilitySync(serverId: string, source: 'polling' | 'notification' | 'websocket' | 'manual'): Promise<void> {
    const status = this.synchronizationStatus.get(serverId);
    if (!status) {
      throw new Error(`Synchronization status not found for server '${serverId}'`);
    }

    const startTime = Date.now();
    status.lastSync = new Date();

    try {
      // Get current capabilities from the server
      const serverConnection = this.mcpRegistry.getServer(serverId);
      if (!serverConnection || !serverConnection.client) {
        throw new Error(`Server '${serverId}' is not connected`);
      }

      // Discover current capabilities
      const currentCapabilities = await this.discoverCurrentCapabilities(serverId, serverConnection);
      const previousCapabilities = serverConnection.capabilities;

      // Compare and detect changes
      const changes = this.detectCapabilityChanges(serverId, previousCapabilities, currentCapabilities, source);

      if (changes.length > 0) {
        // Apply changes with batching
        await this.applyCapabilityChanges(serverId, changes);
        status.changeCount += changes.length;
      }

      // Update metrics
      const duration = Date.now() - startTime;
      status.averageSyncTime = status.averageSyncTime 
        ? (status.averageSyncTime + duration) / 2 
        : duration;
      status.status = 'active';
      status.errorCount = 0;

      // Reset retry counter on success
      this.retryCounters.set(serverId, 0);

      this.emit('sync-completed', { serverId, changeCount: changes.length, duration });
      this.emit('metrics-updated', { serverId, status });

    } catch (error) {
      this.handleSyncError(serverId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Discover current capabilities from MCP server
   */
  private async discoverCurrentCapabilities(serverId: string, serverConnection: any): Promise<MCPServerCapabilities> {
    // This would implement the actual capability discovery logic
    // For now, we'll use the existing registry method
    const capabilities: MCPServerCapabilities = {
      tools: [],
      resources: [],
      prompts: [],
      resourceTemplates: [],
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    try {
      // Discover tools
      const toolsResponse = await serverConnection.client.request(
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
      // Tools might not be supported
    }

    try {
      // Discover resources
      const resourcesResponse = await serverConnection.client.request(
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
      // Resources might not be supported
    }

    return capabilities;
  }

  /**
   * Detect changes between capability sets
   */
  private detectCapabilityChanges(
    serverId: string,
    previous: MCPServerCapabilities | null,
    current: MCPServerCapabilities,
    source: 'polling' | 'notification' | 'websocket' | 'manual'
  ): CapabilityChangeEvent[] {
    const changes: CapabilityChangeEvent[] = [];

    if (!previous) {
      // First sync - treat everything as added
      for (const tool of current.tools) {
        changes.push(this.createCapabilityChangeEvent(serverId, CapabilityChangeType.TOOL_ADDED, { after: tool }, source));
      }
      for (const resource of current.resources) {
        changes.push(this.createCapabilityChangeEvent(serverId, CapabilityChangeType.RESOURCE_ADDED, { after: resource }, source));
      }
      for (const prompt of current.prompts) {
        changes.push(this.createCapabilityChangeEvent(serverId, CapabilityChangeType.PROMPT_ADDED, { after: prompt }, source));
      }
      return changes;
    }

    // Compare tools
    const previousToolNames = new Set(previous.tools.map(t => t.name));
    const currentToolNames = new Set(current.tools.map(t => t.name));
    
    // Added tools
    for (const tool of current.tools) {
      if (!previousToolNames.has(tool.name)) {
        changes.push(this.createCapabilityChangeEvent(serverId, CapabilityChangeType.TOOL_ADDED, { after: tool }, source));
      }
    }
    
    // Removed tools
    for (const tool of previous.tools) {
      if (!currentToolNames.has(tool.name)) {
        changes.push(this.createCapabilityChangeEvent(serverId, CapabilityChangeType.TOOL_REMOVED, { before: tool }, source));
      }
    }

    // Updated tools (simplified - could be more sophisticated)
    for (const currentTool of current.tools) {
      const previousTool = previous.tools.find(t => t.name === currentTool.name);
      if (previousTool && JSON.stringify(previousTool) !== JSON.stringify(currentTool)) {
        changes.push(this.createCapabilityChangeEvent(
          serverId,
          CapabilityChangeType.TOOL_UPDATED,
          { before: previousTool, after: currentTool },
          source
        ));
      }
    }

    // Similar logic for resources and prompts would go here...

    return changes;
  }

  /**
   * Create a capability change event
   */
  private createCapabilityChangeEvent(
    serverId: string,
    type: CapabilityChangeType,
    data: { before?: any; after?: any; metadata?: Record<string, any> },
    source: 'polling' | 'notification' | 'websocket' | 'manual'
  ): CapabilityChangeEvent {
    return {
      id: `${serverId}_${type}_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      timestamp: new Date(),
      serverId,
      type,
      data,
      source,
      version: '1.0.0',
    };
  }

  /**
   * Apply capability changes
   */
  private async applyCapabilityChanges(serverId: string, changes: CapabilityChangeEvent[]): Promise<void> {
    // Batch changes to avoid rapid-fire updates
    const existingTimer = this.batchUpdateTimers.get(serverId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      try {
        // Process all pending changes
        for (const change of changes) {
          await this.processCapabilityChange(change);
          this.recordCapabilityChange(serverId, change);
        }

        this.emit('batch-update', { serverId, changes });
        this.batchUpdateTimers.delete(serverId);
      } catch (error) {
        this.handleSyncError(serverId, error instanceof Error ? error : new Error(String(error)));
      }
    }, this.config.batchUpdateDelay);

    this.batchUpdateTimers.set(serverId, timer);
  }

  /**
   * Process a single capability change
   */
  private async processCapabilityChange(change: CapabilityChangeEvent): Promise<void> {
    switch (change.type) {
      case CapabilityChangeType.TOOL_ADDED:
        if (change.data.after) {
          await this.toolRegistrationManager.registerTool(change.serverId, change.data.after);
        }
        break;
      case CapabilityChangeType.TOOL_REMOVED:
        if (change.data.before) {
          await this.toolRegistrationManager.unregisterTool(change.serverId, change.data.before.name);
        }
        break;
      case CapabilityChangeType.TOOL_UPDATED:
        if (change.data.after) {
          await this.toolRegistrationManager.registerTool(change.serverId, change.data.after);
        }
        break;
      // Handle other change types...
    }
  }

  /**
   * Record capability change in history
   */
  private recordCapabilityChange(serverId: string, change: CapabilityChangeEvent | Omit<CapabilityChangeEvent, 'id' | 'timestamp' | 'serverId' | 'version'>): void {
    const fullChange: CapabilityChangeEvent = 'id' in change ? change : {
      id: `${serverId}_${change.type}_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      timestamp: new Date(),
      serverId,
      version: '1.0.0',
      ...change,
    };

    const history = this.changeHistory.get(serverId) || [];
    history.unshift(fullChange);

    // Limit history size
    if (history.length > this.config.changeHistoryLimit) {
      history.splice(this.config.changeHistoryLimit);
    }

    this.changeHistory.set(serverId, history);
    this.emit('capability-change', fullChange);
  }

  /**
   * Handle capabilities updated event
   */
  private handleCapabilitiesUpdated(serverId: string, capabilities: MCPServerCapabilities): void {
    this.recordCapabilityChange(serverId, {
      type: CapabilityChangeType.SERVER_CAPABILITIES_UPDATED,
      data: { after: capabilities },
      source: 'notification',
    });
  }

  /**
   * Handle WebSocket message
   */
  private handleWebSocketMessage(serverId: string, message: any): void {
    try {
      // Parse and process capability change notifications
      if (message.type === 'capability_change') {
        this.recordCapabilityChange(serverId, {
          type: message.changeType,
          data: message.data,
          source: 'websocket',
        });
      }
    } catch (error) {
      console.warn(`Failed to process WebSocket message from server '${serverId}':`, error);
    }
  }

  /**
   * Handle synchronization errors
   */
  private handleSyncError(serverId: string, error: Error): void {
    const status = this.synchronizationStatus.get(serverId);
    if (status) {
      status.errorCount++;
      status.lastError = error.message;
      status.status = 'error';
      this.emit('metrics-updated', { serverId, status });
    }

    const retryCount = this.retryCounters.get(serverId) || 0;
    this.retryCounters.set(serverId, retryCount + 1);

    this.emit('sync-error', { serverId, error, retryCount });

    // Implement retry logic if needed
    if (retryCount < this.config.maxRetries) {
      const retryDelay = Math.pow(this.config.retryBackoffMultiplier, retryCount) * 1000;
      setTimeout(() => {
        this.performCapabilitySync(serverId, 'manual').catch(() => {
          // Error already handled above
        });
      }, retryDelay);
    }
  }

  /**
   * Generate WebSocket URL for capability notifications
   */
  private generateWebSocketUrl(serverId: string): string {
    return `ws://localhost:8080/mcp/${serverId}/capabilities`;
  }

  /**
   * Cleanup and stop all synchronization
   */
  async cleanup(): Promise<void> {
    // Stop all polling intervals
    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    // Stop all batch timers
    for (const timer of this.batchUpdateTimers.values()) {
      clearTimeout(timer);
    }
    this.batchUpdateTimers.clear();

    // Close all WebSocket connections
    for (const client of this.websocketClients.values()) {
      await client.disconnect();
    }
    this.websocketClients.clear();

    // Clear data
    this.synchronizationStatus.clear();
    this.changeHistory.clear();
    this.retryCounters.clear();

    this.removeAllListeners();
  }
}

/**
 * Export default instance that can be used throughout the application
 */
export default CapabilitySynchronizer;