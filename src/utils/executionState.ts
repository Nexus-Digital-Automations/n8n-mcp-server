/**
 * Execution State Management Utilities for n8n MCP Server
 *
 * Provides utilities for managing execution state, checkpoints, retry logic,
 * and execution flow control for sophisticated workflow execution control.
 */

import { EventEmitter } from 'events';
import { N8nExecution, N8nNode } from '../types/n8n.js';
import {
  ExecutionState,
  ExecutionAction,
  ExecutionPriority,
  CancellationReason,
  RetryStrategy,
  NodeExecutionState,
  ExecutionCheckpoint,
  ExecutionControlConfig,
  EnhancedExecution,
  ExecutionControlRequest,
  ExecutionControlResponse,
  ExecutionHistoryEntry,
  ExecutionAnalytics,
  ExecutionControlContext,
} from '../types/executionTypes.js';

/**
 * Execution state transition matrix
 */
const STATE_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  pending: ['running', 'cancelled'],
  running: ['pausing', 'stopping', 'cancelled', 'completed', 'failed', 'waiting'],
  paused: ['running', 'stopping', 'cancelled'],
  pausing: ['paused', 'running'],
  stopping: ['stopped', 'cancelled'],
  stopped: ['running', 'cancelled'],
  cancelled: [],
  completed: ['retrying'],
  failed: ['retrying', 'cancelled'],
  timeout: ['retrying', 'cancelled'],
  waiting: ['running', 'cancelled', 'timeout'],
  retrying: ['running', 'failed', 'cancelled'],
  partial: ['running', 'completed', 'failed', 'cancelled'],
};

/**
 * Available actions for each execution state
 */
const STATE_ACTIONS: Record<ExecutionState, ExecutionAction[]> = {
  pending: ['start', 'cancel'],
  running: ['pause', 'stop', 'cancel'],
  paused: ['resume', 'stop', 'cancel'],
  pausing: ['stop', 'cancel'],
  stopping: ['cancel'],
  stopped: ['start', 'cancel'],
  cancelled: ['retry'],
  completed: ['retry'],
  failed: ['retry', 'retry-from-node'],
  timeout: ['retry', 'cancel'],
  waiting: ['resume', 'cancel'],
  retrying: ['stop', 'cancel'],
  partial: ['resume', 'stop', 'cancel', 'execute-partial'],
};

/**
 * Execution State Manager
 *
 * Manages execution state transitions, checkpoints, and execution flow control.
 */
export class ExecutionStateManager extends EventEmitter {
  private executions = new Map<string, ExecutionControlContext>();
  private checkpoints = new Map<string, ExecutionCheckpoint>();
  private activeRequests = new Map<string, ExecutionControlRequest[]>();

  constructor() {
    super();
  }

  /**
   * Initialize execution tracking
   */
  initializeExecution(
    execution: N8nExecution,
    config: Partial<ExecutionControlConfig> = {}
  ): EnhancedExecution {
    const enhancedExecution: EnhancedExecution = {
      ...execution,
      enhancedState: this.mapN8nStatusToExecutionState(execution.status),
      priority: 'normal',
      nodeStates: [],
      checkpoints: [],
      controlConfig: {
        maxExecutionTime: 3600000, // 1 hour default
        maxExecutionRetries: 3,
        defaultRetryStrategy: 'exponential',
        retryDelay: {
          initial: 1000,
          multiplier: 2,
          maximum: 30000,
        },
        enableCheckpoints: true,
        checkpointInterval: 5,
        allowPartialExecution: true,
        ...config,
      },
      progress: {
        totalNodes: execution.workflowData?.nodes?.length || 0,
        completedNodes: 0,
        failedNodes: 0,
        skippedNodes: 0,
        percentComplete: 0,
      },
      metrics: {
        nodeExecutionTimes: {},
      },
    };

    // Initialize node states if workflow data is available
    if (execution.workflowData?.nodes) {
      enhancedExecution.nodeStates = execution.workflowData.nodes.map(node => 
        this.createNodeExecutionState(node)
      );
    }

    const context: ExecutionControlContext = {
      execution: enhancedExecution,
      config: enhancedExecution.controlConfig,
      monitoring: {
        enableRealTimeMonitoring: true,
        monitoringInterval: 5000,
        metricsToCollect: ['cpu', 'memory', 'duration'],
        alertThresholds: {
          executionTime: config.maxExecutionTime || 3600000,
          memoryUsage: 1024 * 1024 * 1024, // 1GB
          cpuUsage: 80,
          errorRate: 10,
        },
        notifications: {
          onFailure: true,
          onTimeout: true,
          onCompletion: false,
          onThresholdExceeded: true,
        },
      },
      history: [
        {
          timestamp: new Date().toISOString(),
          state: enhancedExecution.enhancedState,
          event: 'started',
          description: 'Execution tracking initialized',
        },
      ],
      activeRequests: [],
      availableActions: STATE_ACTIONS[enhancedExecution.enhancedState] || [],
    };

    this.executions.set(execution.id, context);
    this.emit('executionInitialized', enhancedExecution);

    return enhancedExecution;
  }

  /**
   * Update execution state
   */
  updateExecutionState(
    executionId: string,
    newState: ExecutionState,
    metadata?: Record<string, unknown>
  ): boolean {
    const context = this.executions.get(executionId);
    if (!context) {
      return false;
    }

    const currentState = context.execution.enhancedState;
    
    // Validate state transition
    if (!this.isValidStateTransition(currentState, newState)) {
      this.emit('invalidStateTransition', {
        executionId,
        from: currentState,
        to: newState,
      });
      return false;
    }

    // Update state
    const previousState = context.execution.enhancedState;
    context.execution.enhancedState = newState;
    context.availableActions = STATE_ACTIONS[newState] || [];

    // Add history entry
    context.history.push({
      timestamp: new Date().toISOString(),
      state: newState,
      event: this.getEventTypeFromStateTransition(previousState, newState),
      description: `State changed from ${previousState} to ${newState}`,
      metadata,
    });

    // Update progress
    this.updateExecutionProgress(context);

    this.emit('stateChanged', {
      executionId,
      previousState,
      newState,
      context,
    });

    return true;
  }

  /**
   * Create execution checkpoint
   */
  createCheckpoint(
    executionId: string,
    description: string,
    metadata: Record<string, unknown> = {}
  ): ExecutionCheckpoint | null {
    const context = this.executions.get(executionId);
    if (!context) {
      return null;
    }

    const checkpointId = `checkpoint_${executionId}_${Date.now()}`;
    const checkpoint: ExecutionCheckpoint = {
      checkpointId,
      executionId,
      timestamp: new Date().toISOString(),
      description,
      completedNodes: context.execution.nodeStates
        .filter(node => node.state === 'completed')
        .map(node => node.nodeId),
      executionState: { ...context.execution },
      nodeStates: [...context.execution.nodeStates],
      metadata,
    };

    this.checkpoints.set(checkpointId, checkpoint);
    context.execution.checkpoints.push(checkpoint);

    this.emit('checkpointCreated', checkpoint);

    return checkpoint;
  }

  /**
   * Restore execution from checkpoint
   */
  restoreFromCheckpoint(checkpointId: string): boolean {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return false;
    }

    const context = this.executions.get(checkpoint.executionId);
    if (!context) {
      return false;
    }

    // Restore node states
    context.execution.nodeStates = [...checkpoint.nodeStates];
    
    // Reset nodes that were running or failed to pending
    context.execution.nodeStates.forEach(node => {
      if (node.state === 'running' || node.state === 'failed') {
        node.state = 'pending';
        node.completedAt = undefined;
        node.error = undefined;
      }
    });

    // Update execution state
    this.updateExecutionState(
      checkpoint.executionId,
      'pending',
      { restoredFromCheckpoint: checkpointId }
    );

    this.emit('checkpointRestored', {
      executionId: checkpoint.executionId,
      checkpointId,
    });

    return true;
  }

  /**
   * Calculate retry delay based on strategy
   */
  calculateRetryDelay(
    strategy: RetryStrategy,
    attemptCount: number,
    config: ExecutionControlConfig
  ): number {
    const retryConfig = config.retryDelay || {
      initial: 1000,
      multiplier: 2,
      maximum: 30000,
    };

    switch (strategy) {
      case 'immediate':
        return 0;
      
      case 'linear':
        return Math.min(
          retryConfig.initial * attemptCount,
          retryConfig.maximum
        );
      
      case 'exponential':
        return Math.min(
          retryConfig.initial * Math.pow(retryConfig.multiplier, attemptCount - 1),
          retryConfig.maximum
        );
      
      case 'custom':
        // Custom strategies can be implemented by overriding this method
        return retryConfig.initial;
      
      default:
        return retryConfig.initial;
    }
  }

  /**
   * Check if execution can be retried
   */
  canRetryExecution(executionId: string): boolean {
    const context = this.executions.get(executionId);
    if (!context) {
      return false;
    }

    const { execution } = context;
    const retryCount = execution.retryInfo?.attemptCount || 0;
    const maxRetries = execution.controlConfig.maxExecutionRetries || 3;

    return (
      ['failed', 'timeout', 'cancelled'].includes(execution.enhancedState) &&
      retryCount < maxRetries
    );
  }

  /**
   * Check if node can be retried
   */
  canRetryNode(executionId: string, nodeId: string): boolean {
    const context = this.executions.get(executionId);
    if (!context) {
      return false;
    }

    const nodeState = context.execution.nodeStates.find(n => n.nodeId === nodeId);
    if (!nodeState) {
      return false;
    }

    return (
      nodeState.state === 'failed' &&
      nodeState.canRetry &&
      nodeState.retryCount < nodeState.maxRetries
    );
  }

  /**
   * Get execution analytics
   */
  getExecutionAnalytics(executionId: string): ExecutionAnalytics | null {
    const context = this.executions.get(executionId);
    if (!context) {
      return null;
    }

    const { execution } = context;
    const completedNodes = execution.nodeStates.filter(n => n.state === 'completed');
    const failedNodes = execution.nodeStates.filter(n => n.state === 'failed');

    // Calculate performance metrics
    const nodeExecutionTimes: Record<string, number> = {};
    let totalDuration = 0;
    let memoryPeak = 0;
    let cpuAverage = 0;

    completedNodes.forEach(node => {
      if (node.duration) {
        nodeExecutionTimes[node.nodeId] = node.duration;
        totalDuration += node.duration;
      }
    });

    // Find critical path (longest execution path)
    const criticalPath = this.calculateCriticalPath(execution.nodeStates);

    // Identify bottlenecks
    const bottlenecks = completedNodes
      .filter(node => node.duration && node.duration > 5000) // Nodes taking > 5 seconds
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 5)
      .map(node => ({
        nodeId: node.nodeId,
        duration: node.duration || 0,
        type: 'cpu' as const, // Could be enhanced to detect actual bottleneck type
      }));

    return {
      executionId,
      timestamp: new Date().toISOString(),
      performance: {
        totalDuration,
        nodeExecutionTimes,
        memoryPeak,
        cpuAverage,
      },
      flow: {
        criticalPath,
        parallelNodes: [], // Could be calculated from workflow connections
        bottlenecks,
      },
      errors: failedNodes.map(node => ({
        nodeId: node.nodeId,
        errorType: node.error?.type || 'unknown',
        errorMessage: node.error?.message || 'Unknown error',
        retryCount: node.retryCount,
        resolution: node.retryCount < node.maxRetries ? 'retry' : 'manual',
      })),
      optimizations: this.generateOptimizationSuggestions(execution),
    };
  }

  /**
   * Process execution control request
   */
  async processControlRequest(
    request: ExecutionControlRequest
  ): Promise<ExecutionControlResponse> {
    const context = this.executions.get(request.executionId);
    if (!context) {
      return {
        success: false,
        message: `Execution ${request.executionId} not found`,
        executionId: request.executionId,
        action: request.action,
        timestamp: new Date().toISOString(),
        error: {
          code: 'EXECUTION_NOT_FOUND',
          message: 'The specified execution ID was not found',
        },
      };
    }

    // Check if action is allowed in current state
    if (!context.availableActions.includes(request.action)) {
      return {
        success: false,
        message: `Action ${request.action} not allowed in state ${context.execution.enhancedState}`,
        executionId: request.executionId,
        action: request.action,
        timestamp: new Date().toISOString(),
        error: {
          code: 'INVALID_ACTION',
          message: `Action not allowed in current state`,
          details: {
            currentState: context.execution.enhancedState,
            allowedActions: context.availableActions,
          },
        },
      };
    }

    // Add request to active requests
    if (!this.activeRequests.has(request.executionId)) {
      this.activeRequests.set(request.executionId, []);
    }
    this.activeRequests.get(request.executionId)!.push(request);

    try {
      const response = await this.executeControlAction(context, request);
      
      // Remove request from active requests
      const activeReqs = this.activeRequests.get(request.executionId) || [];
      const index = activeReqs.indexOf(request);
      if (index > -1) {
        activeReqs.splice(index, 1);
      }

      return response;
    } catch (error) {
      // Remove request from active requests on error
      const activeReqs = this.activeRequests.get(request.executionId) || [];
      const index = activeReqs.indexOf(request);
      if (index > -1) {
        activeReqs.splice(index, 1);
      }

      return {
        success: false,
        message: `Failed to execute action: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionId: request.executionId,
        action: request.action,
        timestamp: new Date().toISOString(),
        error: {
          code: 'ACTION_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Get execution context
   */
  getExecutionContext(executionId: string): ExecutionControlContext | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * Clean up completed or old executions
   */
  cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoffTime = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [executionId, context] of this.executions.entries()) {
      const executionTime = new Date(context.execution.startedAt).getTime();
      const isCompleted = ['completed', 'failed', 'cancelled'].includes(
        context.execution.enhancedState
      );

      if (isCompleted && executionTime < cutoffTime) {
        this.executions.delete(executionId);
        this.activeRequests.delete(executionId);
        
        // Clean up associated checkpoints
        context.execution.checkpoints.forEach(checkpoint => {
          this.checkpoints.delete(checkpoint.checkpointId);
        });
        
        cleaned++;
      }
    }

    this.emit('cleanupCompleted', { cleanedExecutions: cleaned });
    return cleaned;
  }

  // Private helper methods

  private mapN8nStatusToExecutionState(status: string): ExecutionState {
    switch (status) {
      case 'running':
        return 'running';
      case 'success':
        return 'completed';
      case 'error':
        return 'failed';
      case 'waiting':
        return 'waiting';
      default:
        return 'pending';
    }
  }

  private createNodeExecutionState(node: N8nNode): NodeExecutionState {
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      state: 'pending',
      retryCount: 0,
      maxRetries: 3,
      canRetry: true,
      canSkip: !['trigger', 'webhook'].includes(node.type.toLowerCase()),
    };
  }

  private isValidStateTransition(from: ExecutionState, to: ExecutionState): boolean {
    return STATE_TRANSITIONS[from]?.includes(to) || false;
  }

  private getEventTypeFromStateTransition(from: ExecutionState, to: ExecutionState): ExecutionHistoryEntry['event'] {
    if (from === 'pending' && to === 'running') return 'started';
    if (from === 'running' && to === 'paused') return 'paused';
    if (from === 'paused' && to === 'running') return 'resumed';
    if (to === 'completed') return 'completed';
    if (to === 'failed') return 'failed';
    if (to === 'cancelled') return 'cancelled';
    if (to === 'retrying') return 'retried';
    return 'started';
  }

  private updateExecutionProgress(context: ExecutionControlContext): void {
    const { execution } = context;
    const totalNodes = execution.nodeStates.length;
    
    if (totalNodes === 0) {
      execution.progress.percentComplete = 0;
      return;
    }

    const completed = execution.nodeStates.filter(n => n.state === 'completed').length;
    const failed = execution.nodeStates.filter(n => n.state === 'failed').length;
    const skipped = execution.nodeStates.filter(n => n.state === 'skipped').length;

    execution.progress.completedNodes = completed;
    execution.progress.failedNodes = failed;
    execution.progress.skippedNodes = skipped;
    execution.progress.percentComplete = Math.round(((completed + failed + skipped) / totalNodes) * 100);
  }

  private calculateCriticalPath(nodeStates: NodeExecutionState[]): string[] {
    // Simplified critical path calculation
    // In a real implementation, this would analyze workflow connections
    return nodeStates
      .filter(node => node.duration && node.duration > 1000)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10)
      .map(node => node.nodeId);
  }

  private generateOptimizationSuggestions(execution: EnhancedExecution): ExecutionAnalytics['optimizations'] {
    const suggestions: ExecutionAnalytics['optimizations'] = [];

    // Suggest optimizations based on execution patterns
    const longRunningNodes = execution.nodeStates.filter(
      node => node.duration && node.duration > 10000
    );

    if (longRunningNodes.length > 0) {
      suggestions.push({
        type: 'performance',
        description: `${longRunningNodes.length} nodes are taking longer than 10 seconds to execute`,
        estimatedImpact: 'Reducing execution time by 30-50%',
        priority: 'high',
      });
    }

    const failedNodes = execution.nodeStates.filter(node => node.state === 'failed');
    if (failedNodes.length > 0) {
      suggestions.push({
        type: 'reliability',
        description: 'Consider adding error handling and retry logic for failed nodes',
        estimatedImpact: 'Improving workflow reliability by 60-80%',
        priority: 'high',
      });
    }

    return suggestions;
  }

  private async executeControlAction(
    context: ExecutionControlContext,
    request: ExecutionControlRequest
  ): Promise<ExecutionControlResponse> {
    const { execution } = context;
    
    switch (request.action) {
      case 'pause':
        return this.handlePauseAction(context, request);
      case 'resume':
        return this.handleResumeAction(context, request);
      case 'stop':
        return this.handleStopAction(context, request);
      case 'cancel':
        return this.handleCancelAction(context, request);
      case 'retry':
        return this.handleRetryAction(context, request);
      case 'retry-from-node':
        return this.handleRetryFromNodeAction(context, request);
      default:
        throw new Error(`Unsupported action: ${request.action}`);
    }
  }

  private async handlePauseAction(
    context: ExecutionControlContext,
    request: ExecutionControlRequest
  ): Promise<ExecutionControlResponse> {
    // Create checkpoint before pausing
    const checkpoint = this.createCheckpoint(
      request.executionId,
      'Execution paused by user',
      { pausedBy: request.requestedBy }
    );

    this.updateExecutionState(request.executionId, 'paused');

    return {
      success: true,
      message: 'Execution paused successfully',
      executionState: 'paused',
      executionId: request.executionId,
      action: request.action,
      timestamp: new Date().toISOString(),
      data: {
        checkpointId: checkpoint?.checkpointId,
      },
    };
  }

  private async handleResumeAction(
    context: ExecutionControlContext,
    request: ExecutionControlRequest
  ): Promise<ExecutionControlResponse> {
    this.updateExecutionState(request.executionId, 'running');

    return {
      success: true,
      message: 'Execution resumed successfully',
      executionState: 'running',
      executionId: request.executionId,
      action: request.action,
      timestamp: new Date().toISOString(),
    };
  }

  private async handleStopAction(
    context: ExecutionControlContext,
    request: ExecutionControlRequest
  ): Promise<ExecutionControlResponse> {
    this.updateExecutionState(request.executionId, 'stopped');

    return {
      success: true,
      message: 'Execution stopped successfully',
      executionState: 'stopped',
      executionId: request.executionId,
      action: request.action,
      timestamp: new Date().toISOString(),
    };
  }

  private async handleCancelAction(
    context: ExecutionControlContext,
    request: ExecutionControlRequest
  ): Promise<ExecutionControlResponse> {
    const reason = request.parameters?.reason || 'user-requested';
    
    context.execution.cancellation = {
      reason: reason as CancellationReason,
      requestedAt: request.requestedAt,
      requestedBy: request.requestedBy,
      cancelledAt: new Date().toISOString(),
    };

    this.updateExecutionState(request.executionId, 'cancelled');

    return {
      success: true,
      message: `Execution cancelled successfully (${reason})`,
      executionState: 'cancelled',
      executionId: request.executionId,
      action: request.action,
      timestamp: new Date().toISOString(),
    };
  }

  private async handleRetryAction(
    context: ExecutionControlContext,
    request: ExecutionControlRequest
  ): Promise<ExecutionControlResponse> {
    const strategy = request.parameters?.retryStrategy || context.execution.controlConfig.defaultRetryStrategy || 'exponential';
    const currentRetryCount = context.execution.retryInfo?.attemptCount || 0;
    const maxRetries = request.parameters?.maxRetries || context.execution.controlConfig.maxExecutionRetries || 3;

    if (currentRetryCount >= maxRetries) {
      return {
        success: false,
        message: `Maximum retry attempts (${maxRetries}) exceeded`,
        executionId: request.executionId,
        action: request.action,
        timestamp: new Date().toISOString(),
        error: {
          code: 'MAX_RETRIES_EXCEEDED',
          message: 'The execution has reached the maximum number of retry attempts',
        },
      };
    }

    // Calculate retry delay
    const retryDelay = this.calculateRetryDelay(strategy, currentRetryCount + 1, context.execution.controlConfig);
    
    // Update retry information
    context.execution.retryInfo = {
      strategy,
      attemptCount: currentRetryCount + 1,
      maxAttempts: maxRetries,
      nextRetryAt: new Date(Date.now() + retryDelay).toISOString(),
      originalExecutionId: context.execution.retryInfo?.originalExecutionId || context.execution.id,
    };

    // Reset node states for retry
    context.execution.nodeStates.forEach(node => {
      if (node.state === 'failed') {
        node.state = 'pending';
        node.error = undefined;
        node.completedAt = undefined;
      }
    });

    this.updateExecutionState(request.executionId, 'retrying');

    return {
      success: true,
      message: `Execution retry scheduled (attempt ${currentRetryCount + 1}/${maxRetries})`,
      executionState: 'retrying',
      executionId: request.executionId,
      action: request.action,
      timestamp: new Date().toISOString(),
      data: {
        estimatedCompletion: context.execution.retryInfo.nextRetryAt,
        performanceImpact: {
          estimatedDelay: retryDelay,
        },
      },
    };
  }

  private async handleRetryFromNodeAction(
    context: ExecutionControlContext,
    request: ExecutionControlRequest
  ): Promise<ExecutionControlResponse> {
    const startFromNode = request.parameters?.startFromNode;
    if (!startFromNode) {
      return {
        success: false,
        message: 'startFromNode parameter is required for retry-from-node action',
        executionId: request.executionId,
        action: request.action,
        timestamp: new Date().toISOString(),
        error: {
          code: 'MISSING_PARAMETER',
          message: 'The startFromNode parameter is required',
        },
      };
    }

    const nodeState = context.execution.nodeStates.find(n => n.nodeId === startFromNode);
    if (!nodeState) {
      return {
        success: false,
        message: `Node ${startFromNode} not found in execution`,
        executionId: request.executionId,
        action: request.action,
        timestamp: new Date().toISOString(),
        error: {
          code: 'NODE_NOT_FOUND',
          message: 'The specified node was not found in the execution',
        },
      };
    }

    // Reset nodes from the specified node onwards
    let resetFromFound = false;
    const affectedNodes: string[] = [];

    context.execution.nodeStates.forEach(node => {
      if (node.nodeId === startFromNode) {
        resetFromFound = true;
      }
      
      if (resetFromFound && ['failed', 'completed'].includes(node.state)) {
        node.state = 'pending';
        node.error = undefined;
        node.completedAt = undefined;
        affectedNodes.push(node.nodeId);
      }
    });

    this.updateExecutionState(request.executionId, 'partial');

    return {
      success: true,
      message: `Execution will retry from node ${startFromNode}`,
      executionState: 'partial',
      executionId: request.executionId,
      action: request.action,
      timestamp: new Date().toISOString(),
      data: {
        affectedNodes,
      },
    };
  }
}