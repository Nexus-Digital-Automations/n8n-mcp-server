/**
 * Execution Control Types for n8n MCP Server
 *
 * Defines types and interfaces for sophisticated execution control including
 * cancellation, retry mechanisms, and partial workflow execution.
 */

import { N8nExecution, N8nNode } from './n8n.js';

/**
 * Execution control states
 */
export type ExecutionState = 
  | 'pending'
  | 'running' 
  | 'paused'
  | 'pausing'
  | 'stopping'
  | 'stopped'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'waiting'
  | 'retrying'
  | 'partial';

/**
 * Execution control actions
 */
export type ExecutionAction = 
  | 'start'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'cancel'
  | 'retry'
  | 'retry-from-node'
  | 'skip-node'
  | 'execute-partial';

/**
 * Execution control priority levels
 */
export type ExecutionPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Execution cancellation reasons
 */
export type CancellationReason = 
  | 'user-requested'
  | 'timeout'
  | 'resource-limit'
  | 'error-threshold'
  | 'dependency-failure'
  | 'system-shutdown'
  | 'policy-violation';

/**
 * Retry strategy types
 */
export type RetryStrategy = 
  | 'immediate'
  | 'linear'
  | 'exponential'
  | 'custom';

/**
 * Node execution state
 */
export interface NodeExecutionState {
  /** Node identifier */
  nodeId: string;
  
  /** Node name */
  nodeName: string;
  
  /** Node type */
  nodeType: string;
  
  /** Current state */
  state: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';
  
  /** Execution start time */
  startedAt?: string;
  
  /** Execution completion time */
  completedAt?: string;
  
  /** Execution duration in milliseconds */
  duration?: number;
  
  /** Number of retry attempts */
  retryCount: number;
  
  /** Maximum allowed retries */
  maxRetries: number;
  
  /** Error information if failed */
  error?: {
    message: string;
    stack?: string;
    code?: string;
    type: string;
  };
  
  /** Node execution data */
  data?: {
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
  
  /** Whether node can be retried */
  canRetry: boolean;
  
  /** Whether node can be skipped */
  canSkip: boolean;
}

/**
 * Execution checkpoint for resume functionality
 */
export interface ExecutionCheckpoint {
  /** Checkpoint identifier */
  checkpointId: string;
  
  /** Execution ID */
  executionId: string;
  
  /** Checkpoint timestamp */
  timestamp: string;
  
  /** Checkpoint description */
  description: string;
  
  /** Completed nodes at checkpoint */
  completedNodes: string[];
  
  /** Current execution state */
  executionState: Record<string, unknown>;
  
  /** Node states at checkpoint */
  nodeStates: NodeExecutionState[];
  
  /** Checkpoint metadata */
  metadata: Record<string, unknown>;
}

/**
 * Execution control configuration
 */
export interface ExecutionControlConfig {
  /** Maximum execution time in milliseconds */
  maxExecutionTime?: number;
  
  /** Maximum retry attempts for the entire execution */
  maxExecutionRetries?: number;
  
  /** Default retry strategy */
  defaultRetryStrategy?: RetryStrategy;
  
  /** Retry delay configuration */
  retryDelay?: {
    initial: number;
    multiplier: number;
    maximum: number;
  };
  
  /** Whether to create checkpoints */
  enableCheckpoints?: boolean;
  
  /** Checkpoint interval in nodes */
  checkpointInterval?: number;
  
  /** Whether to allow partial execution */
  allowPartialExecution?: boolean;
  
  /** Resource limits */
  resourceLimits?: {
    maxMemory?: number;
    maxCpu?: number;
    maxDiskSpace?: number;
  };
  
  /** Timeout configuration */
  timeouts?: {
    nodeTimeout?: number;
    connectionTimeout?: number;
    responseTimeout?: number;
  };
}

/**
 * Enhanced execution information with control data
 */
export interface EnhancedExecution extends N8nExecution {
  /** Enhanced execution state */
  enhancedState: ExecutionState;
  
  /** Execution priority */
  priority: ExecutionPriority;
  
  /** Node execution states */
  nodeStates: NodeExecutionState[];
  
  /** Available checkpoints */
  checkpoints: ExecutionCheckpoint[];
  
  /** Execution control configuration */
  controlConfig: ExecutionControlConfig;
  
  /** Cancellation information */
  cancellation?: {
    reason: CancellationReason;
    requestedAt: string;
    requestedBy: string;
    cancelledAt?: string;
  };
  
  /** Retry information */
  retryInfo?: {
    strategy: RetryStrategy;
    attemptCount: number;
    maxAttempts: number;
    nextRetryAt?: string;
    originalExecutionId?: string;
  };
  
  /** Partial execution information */
  partialExecution?: {
    targetNodes: string[];
    startFromNode?: string;
    skipNodes?: string[];
    executeUntilNode?: string;
  };
  
  /** Execution progress */
  progress: {
    totalNodes: number;
    completedNodes: number;
    failedNodes: number;
    skippedNodes: number;
    percentComplete: number;
  };
  
  /** Performance metrics */
  metrics: {
    totalDuration?: number;
    nodeExecutionTimes: Record<string, number>;
    memoryUsage?: number;
    cpuUsage?: number;
  };
}

/**
 * Execution control request
 */
export interface ExecutionControlRequest {
  /** Execution ID */
  executionId: string;
  
  /** Control action to perform */
  action: ExecutionAction;
  
  /** Request timestamp */
  requestedAt: string;
  
  /** User who requested the action */
  requestedBy: string;
  
  /** Action-specific parameters */
  parameters?: {
    /** For retry actions */
    retryStrategy?: RetryStrategy;
    retryDelay?: number;
    maxRetries?: number;
    
    /** For partial execution */
    targetNodes?: string[];
    startFromNode?: string;
    skipNodes?: string[];
    executeUntilNode?: string;
    
    /** For cancellation */
    reason?: CancellationReason;
    force?: boolean;
    
    /** For pause/resume */
    timeout?: number;
    preserveState?: boolean;
  };
  
  /** Request metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Execution control response
 */
export interface ExecutionControlResponse {
  /** Whether the action was successful */
  success: boolean;
  
  /** Response message */
  message: string;
  
  /** Updated execution state */
  executionState?: ExecutionState;
  
  /** Execution ID */
  executionId: string;
  
  /** Action that was performed */
  action: ExecutionAction;
  
  /** Response timestamp */
  timestamp: string;
  
  /** Additional response data */
  data?: {
    /** New execution ID for retries */
    newExecutionId?: string;
    
    /** Checkpoint ID for pause operations */
    checkpointId?: string;
    
    /** Estimated completion time */
    estimatedCompletion?: string;
    
    /** Affected nodes */
    affectedNodes?: string[];
    
    /** Performance impact */
    performanceImpact?: {
      estimatedDelay?: number;
      resourceUsage?: Record<string, number>;
    };
  };
  
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Batch execution control request
 */
export interface BatchExecutionControlRequest {
  /** Execution IDs to control */
  executionIds: string[];
  
  /** Control action to perform on all executions */
  action: ExecutionAction;
  
  /** Request timestamp */
  requestedAt: string;
  
  /** User who requested the action */
  requestedBy: string;
  
  /** Whether to continue on individual failures */
  continueOnFailure: boolean;
  
  /** Action-specific parameters (applied to all executions) */
  parameters?: ExecutionControlRequest['parameters'];
  
  /** Request metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Batch execution control response
 */
export interface BatchExecutionControlResponse {
  /** Overall success status */
  success: boolean;
  
  /** Response message */
  message: string;
  
  /** Total number of executions processed */
  totalExecutions: number;
  
  /** Number of successful operations */
  successfulOperations: number;
  
  /** Number of failed operations */
  failedOperations: number;
  
  /** Individual execution results */
  results: Array<{
    executionId: string;
    success: boolean;
    message: string;
    newState?: ExecutionState;
    error?: string;
  }>;
  
  /** Response timestamp */
  timestamp: string;
  
  /** Batch operation metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Execution monitoring configuration
 */
export interface ExecutionMonitoringConfig {
  /** Enable real-time monitoring */
  enableRealTimeMonitoring: boolean;
  
  /** Monitoring interval in milliseconds */
  monitoringInterval: number;
  
  /** Performance metrics to collect */
  metricsToCollect: Array<'cpu' | 'memory' | 'disk' | 'network' | 'duration'>;
  
  /** Alert thresholds */
  alertThresholds: {
    executionTime?: number;
    memoryUsage?: number;
    cpuUsage?: number;
    errorRate?: number;
  };
  
  /** Notification settings */
  notifications: {
    onFailure: boolean;
    onTimeout: boolean;
    onCompletion: boolean;
    onThresholdExceeded: boolean;
  };
}

/**
 * Execution analytics data
 */
export interface ExecutionAnalytics {
  /** Execution ID */
  executionId: string;
  
  /** Analytics timestamp */
  timestamp: string;
  
  /** Performance metrics */
  performance: {
    totalDuration: number;
    nodeExecutionTimes: Record<string, number>;
    memoryPeak: number;
    cpuAverage: number;
    networkTraffic?: number;
  };
  
  /** Execution flow analysis */
  flow: {
    criticalPath: string[];
    parallelNodes: string[][];
    bottlenecks: Array<{
      nodeId: string;
      duration: number;
      type: 'cpu' | 'memory' | 'io' | 'network';
    }>;
  };
  
  /** Error analysis */
  errors: Array<{
    nodeId: string;
    errorType: string;
    errorMessage: string;
    retryCount: number;
    resolution?: 'retry' | 'skip' | 'manual';
  }>;
  
  /** Optimization suggestions */
  optimizations: Array<{
    type: 'performance' | 'reliability' | 'cost';
    description: string;
    estimatedImpact: string;
    priority: 'low' | 'medium' | 'high';
  }>;
}

/**
 * Execution history entry
 */
export interface ExecutionHistoryEntry {
  /** Entry timestamp */
  timestamp: string;
  
  /** Execution state at this point */
  state: ExecutionState;
  
  /** Event type */
  event: 'started' | 'paused' | 'resumed' | 'completed' | 'failed' | 'cancelled' | 'retried';
  
  /** Event description */
  description: string;
  
  /** User who triggered the event */
  triggeredBy?: string;
  
  /** Event metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Complete execution control context
 */
export interface ExecutionControlContext {
  /** Enhanced execution information */
  execution: EnhancedExecution;
  
  /** Control configuration */
  config: ExecutionControlConfig;
  
  /** Monitoring configuration */
  monitoring: ExecutionMonitoringConfig;
  
  /** Execution history */
  history: ExecutionHistoryEntry[];
  
  /** Analytics data */
  analytics?: ExecutionAnalytics;
  
  /** Active control requests */
  activeRequests: ExecutionControlRequest[];
  
  /** Available actions for current state */
  availableActions: ExecutionAction[];
}