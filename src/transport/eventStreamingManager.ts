/**
 * Event Streaming Manager for n8n Fork Integration
 *
 * Manages real-time event streaming for workflow execution updates,
 * progress monitoring, and bidirectional communication with n8n fork.
 */

import { EventEmitter } from 'events';
import { N8nWebSocketClient, WorkflowExecutionEvent, WebSocketConfig } from './websocketClient.js';
import { z } from 'zod';

// Event streaming schemas
export const WorkflowExecutionStatusSchema = z.object({
  executionId: z.string(),
  workflowId: z.string(),
  status: z.enum(['running', 'success', 'error', 'waiting', 'canceled']),
  progress: z.number().min(0).max(100).optional(),
  currentNode: z.string().optional(),
  startTime: z.string(),
  endTime: z.string().optional(),
  error: z.string().optional(),
  data: z.any().optional(),
});

export const NodeExecutionUpdateSchema = z.object({
  executionId: z.string(),
  nodeId: z.string(),
  nodeName: z.string(),
  status: z.enum(['running', 'success', 'error', 'waiting']),
  startTime: z.string(),
  endTime: z.string().optional(),
  executionTime: z.number().optional(),
  inputData: z.any().optional(),
  outputData: z.any().optional(),
  error: z.string().optional(),
});

export const ProgressUpdateSchema = z.object({
  executionId: z.string(),
  workflowId: z.string(),
  progress: z.number().min(0).max(100),
  currentNodeIndex: z.number(),
  totalNodes: z.number(),
  currentNodeName: z.string(),
  estimatedTimeRemaining: z.number().optional(),
});

export type WorkflowExecutionStatus = z.infer<typeof WorkflowExecutionStatusSchema>;
export type NodeExecutionUpdate = z.infer<typeof NodeExecutionUpdateSchema>;
export type ProgressUpdate = z.infer<typeof ProgressUpdateSchema>;

export interface EventStreamingConfig {
  wsConfig: WebSocketConfig;
  bufferSize: number;
  retryAttempts: number;
  enableProgressTracking: boolean;
  enableMetrics: boolean;
  eventFilters?: string[];
}

export interface ExecutionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  currentActiveExecutions: number;
  nodeExecutionCounts: Record<string, number>;
}

/**
 * Event Streaming Manager
 *
 * Coordinates real-time event streaming between n8n fork WebSocket
 * and MCP server event system.
 */
export class EventStreamingManager extends EventEmitter {
  private wsClient: N8nWebSocketClient;
  private config: EventStreamingConfig;
  private activeExecutions: Map<string, WorkflowExecutionStatus> = new Map();
  private executionHistory: WorkflowExecutionStatus[] = [];
  private metrics: ExecutionMetrics;
  private eventBuffer: WorkflowExecutionEvent[] = [];
  private isStreaming: boolean = false;

  constructor(config: EventStreamingConfig) {
    super();
    this.config = config;
    this.wsClient = new N8nWebSocketClient(config.wsConfig);
    this.metrics = this.initializeMetrics();
    this.setupEventHandlers();
  }

  /**
   * Start event streaming
   */
  public async startStreaming(): Promise<void> {
    try {
      await this.wsClient.connect();
      this.isStreaming = true;
      
      // Subscribe to all workflow execution events
      await this.wsClient.subscribeToExecutions();
      
      this.emit('streamingStarted', {
        timestamp: new Date().toISOString(),
        config: this.config,
      });

    } catch (error) {
      this.emit('streamingError', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Stop event streaming
   */
  public async stopStreaming(): Promise<void> {
    this.isStreaming = false;
    await this.wsClient.disconnect();
    
    this.emit('streamingStopped', {
      timestamp: new Date().toISOString(),
      metrics: this.getMetrics(),
    });
  }

  /**
   * Subscribe to specific workflow updates
   */
  public async subscribeToWorkflow(workflowId: string): Promise<void> {
    await this.wsClient.subscribeToWorkflow(workflowId);
    
    this.emit('workflowSubscribed', {
      workflowId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Unsubscribe from workflow updates
   */
  public async unsubscribeFromWorkflow(workflowId: string): Promise<void> {
    await this.wsClient.unsubscribeFromWorkflow(workflowId);
    
    this.emit('workflowUnsubscribed', {
      workflowId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get current execution status
   */
  public getExecutionStatus(executionId: string): WorkflowExecutionStatus | null {
    return this.activeExecutions.get(executionId) || null;
  }

  /**
   * Get all active executions
   */
  public getActiveExecutions(): WorkflowExecutionStatus[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get execution history
   */
  public getExecutionHistory(limit?: number): WorkflowExecutionStatus[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return [...this.executionHistory];
  }

  /**
   * Get streaming metrics
   */
  public getMetrics(): ExecutionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): {
    isConnected: boolean;
    isStreaming: boolean;
    connectionState: any;
  } {
    return {
      isConnected: this.wsClient.isConnected(),
      isStreaming: this.isStreaming,
      connectionState: this.wsClient.getConnectionState(),
    };
  }

  /**
   * Send command to n8n fork
   */
  public async sendCommand(command: any): Promise<void> {
    await this.wsClient.sendMessage(command);
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.wsClient.on('connected', () => {
      this.emit('connected', {
        timestamp: new Date().toISOString(),
      });
    });

    this.wsClient.on('disconnected', (data) => {
      this.emit('disconnected', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    });

    this.wsClient.on('workflowEvent', (event: WorkflowExecutionEvent) => {
      this.handleWorkflowEvent(event);
    });

    this.wsClient.on('heartbeat', (heartbeat) => {
      this.emit('heartbeat', heartbeat);
    });

    this.wsClient.on('error', (error) => {
      this.emit('error', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    });

    this.wsClient.on('reconnecting', (data) => {
      this.emit('reconnecting', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    });

    this.wsClient.on('maxReconnectAttemptsReached', () => {
      this.emit('maxReconnectAttemptsReached', {
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Handle workflow execution events
   */
  private handleWorkflowEvent(event: WorkflowExecutionEvent): void {
    try {
      const { type, data } = event;
      
      // Buffer event if needed
      if (this.config.bufferSize > 0) {
        this.eventBuffer.push(event);
        if (this.eventBuffer.length > this.config.bufferSize) {
          this.eventBuffer.shift();
        }
      }

      switch (type) {
        case 'workflowExecutionStarted':
          this.handleExecutionStarted(data);
          break;
          
        case 'workflowExecutionCompleted':
          this.handleExecutionCompleted(data);
          break;
          
        case 'nodeExecutionStarted':
          this.handleNodeExecutionStarted(data);
          break;
          
        case 'nodeExecutionCompleted':
          this.handleNodeExecutionCompleted(data);
          break;
      }

      // Emit the processed event
      this.emit('workflowEvent', {
        ...event,
        processedAt: new Date().toISOString(),
      });

    } catch (error) {
      this.emit('eventProcessingError', {
        event,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Handle workflow execution started
   */
  private handleExecutionStarted(data: any): void {
    const executionStatus: WorkflowExecutionStatus = {
      executionId: data.executionId,
      workflowId: data.workflowId || 'unknown',
      status: 'running',
      progress: 0,
      startTime: data.timestamp,
    };

    this.activeExecutions.set(data.executionId, executionStatus);
    this.metrics.totalExecutions++;
    this.metrics.currentActiveExecutions++;

    this.emit('executionStarted', {
      execution: executionStatus,
      timestamp: new Date().toISOString(),
    });

    if (this.config.enableProgressTracking) {
      this.emit('progressUpdate', this.createProgressUpdate(executionStatus));
    }
  }

  /**
   * Handle workflow execution completed
   */
  private handleExecutionCompleted(data: any): void {
    const executionId = data.executionId;
    const activeExecution = this.activeExecutions.get(executionId);
    
    if (activeExecution) {
      const completedExecution: WorkflowExecutionStatus = {
        ...activeExecution,
        status: data.status === 'error' ? 'error' : 'success',
        progress: 100,
        endTime: data.timestamp,
        error: data.error,
        data: data.data,
      };

      // Move to history
      this.executionHistory.push(completedExecution);
      this.activeExecutions.delete(executionId);
      
      // Update metrics
      if (completedExecution.status === 'success') {
        this.metrics.successfulExecutions++;
      } else {
        this.metrics.failedExecutions++;
      }
      this.metrics.currentActiveExecutions--;

      // Calculate execution time and update average
      if (completedExecution.endTime) {
        const executionTime = new Date(completedExecution.endTime).getTime() - 
                             new Date(completedExecution.startTime).getTime();
        this.updateAverageExecutionTime(executionTime);
      }

      this.emit('executionCompleted', {
        execution: completedExecution,
        timestamp: new Date().toISOString(),
      });

      if (this.config.enableProgressTracking) {
        this.emit('progressUpdate', this.createProgressUpdate(completedExecution));
      }

      // Trim history if it gets too large
      if (this.executionHistory.length > 1000) {
        this.executionHistory = this.executionHistory.slice(-500);
      }
    }
  }

  /**
   * Handle node execution started
   */
  private handleNodeExecutionStarted(data: any): void {
    const executionId = data.executionId;
    const activeExecution = this.activeExecutions.get(executionId);
    
    if (activeExecution) {
      activeExecution.currentNode = data.nodeName;
      
      const nodeUpdate: NodeExecutionUpdate = {
        executionId,
        nodeId: data.nodeId,
        nodeName: data.nodeName,
        status: 'running',
        startTime: data.timestamp,
      };

      this.emit('nodeExecutionStarted', {
        nodeUpdate,
        execution: activeExecution,
        timestamp: new Date().toISOString(),
      });

      // Update node execution counts
      this.metrics.nodeExecutionCounts[data.nodeName] = 
        (this.metrics.nodeExecutionCounts[data.nodeName] || 0) + 1;
    }
  }

  /**
   * Handle node execution completed
   */
  private handleNodeExecutionCompleted(data: any): void {
    const executionId = data.executionId;
    const activeExecution = this.activeExecutions.get(executionId);
    
    if (activeExecution) {
      const nodeUpdate: NodeExecutionUpdate = {
        executionId,
        nodeId: data.nodeId,
        nodeName: data.nodeName,
        status: data.status === 'error' ? 'error' : 'success',
        startTime: data.timestamp,
        endTime: data.timestamp,
        error: data.error,
      };

      this.emit('nodeExecutionCompleted', {
        nodeUpdate,
        execution: activeExecution,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Create progress update
   */
  private createProgressUpdate(execution: WorkflowExecutionStatus): ProgressUpdate {
    return {
      executionId: execution.executionId,
      workflowId: execution.workflowId,
      progress: execution.progress || 0,
      currentNodeIndex: 0, // TODO: Calculate from workflow structure
      totalNodes: 1, // TODO: Get from workflow definition
      currentNodeName: execution.currentNode || 'Unknown',
    };
  }

  /**
   * Update average execution time
   */
  private updateAverageExecutionTime(newExecutionTime: number): void {
    const totalCompletedExecutions = this.metrics.successfulExecutions + this.metrics.failedExecutions;
    
    if (totalCompletedExecutions === 1) {
      this.metrics.averageExecutionTime = newExecutionTime;
    } else {
      this.metrics.averageExecutionTime = 
        (this.metrics.averageExecutionTime * (totalCompletedExecutions - 1) + newExecutionTime) / 
        totalCompletedExecutions;
    }
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): ExecutionMetrics {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      currentActiveExecutions: 0,
      nodeExecutionCounts: {},
    };
  }
}

/**
 * Create event streaming manager with default configuration
 */
export function createEventStreamingManager(
  wsConfig: WebSocketConfig,
  options: Partial<EventStreamingConfig> = {}
): EventStreamingManager {
  const config: EventStreamingConfig = {
    wsConfig,
    bufferSize: 100,
    retryAttempts: 5,
    enableProgressTracking: true,
    enableMetrics: true,
    ...options,
  };

  return new EventStreamingManager(config);
}

/**
 * Default event streaming configuration
 */
export const DEFAULT_STREAMING_CONFIG: Partial<EventStreamingConfig> = {
  bufferSize: 100,
  retryAttempts: 5,
  enableProgressTracking: true,
  enableMetrics: true,
};