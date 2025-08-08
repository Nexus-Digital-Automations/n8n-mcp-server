/**
 * Progress Monitor for n8n Fork Workflow Executions
 *
 * Provides detailed progress tracking, performance monitoring, and real-time
 * status updates for workflow executions with predictive analytics.
 */

import { EventEmitter } from 'events';
import { EventStreamingManager, WorkflowExecutionStatus, NodeExecutionUpdate, ProgressUpdate } from './eventStreamingManager.js';
import { z } from 'zod';

// Progress monitoring schemas
export const WorkflowProgressSchema = z.object({
  executionId: z.string(),
  workflowId: z.string(),
  workflowName: z.string().optional(),
  overallProgress: z.number().min(0).max(100),
  currentPhase: z.enum(['initializing', 'executing', 'completing', 'completed', 'failed']),
  nodeProgress: z.array(z.object({
    nodeId: z.string(),
    nodeName: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
    progress: z.number().min(0).max(100),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    executionTime: z.number().optional(),
    error: z.string().optional(),
  })),
  startTime: z.string(),
  estimatedEndTime: z.string().optional(),
  actualEndTime: z.string().optional(),
  estimatedDuration: z.number().optional(),
  actualDuration: z.number().optional(),
  performance: z.object({
    averageNodeTime: z.number(),
    slowestNode: z.string().optional(),
    fastestNode: z.string().optional(),
    bottlenecks: z.array(z.string()),
  }),
});

export const PerformanceMetricsSchema = z.object({
  executionId: z.string(),
  workflowId: z.string(),
  metrics: z.object({
    totalExecutionTime: z.number(),
    nodeExecutionTimes: z.record(z.number()),
    memoryUsage: z.number().optional(),
    cpuUsage: z.number().optional(),
    networkRequests: z.number().optional(),
    errorCount: z.number(),
    retryCount: z.number(),
  }),
  benchmarks: z.object({
    averageExecutionTime: z.number(),
    percentile95: z.number(),
    percentile99: z.number(),
    comparedToAverage: z.number(),
  }),
});

export type WorkflowProgress = z.infer<typeof WorkflowProgressSchema>;
export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

export interface ProgressMonitorConfig {
  enablePredictiveAnalytics: boolean;
  enablePerformanceTracking: boolean;
  historicalDataLimit: number;
  progressUpdateInterval: number;
  benchmarkingEnabled: boolean;
  alertThresholds: {
    slowExecutionMultiplier: number;
    highFailureRate: number;
    maxExecutionTime: number;
  };
}

export interface ExecutionAlert {
  type: 'slow_execution' | 'high_failure_rate' | 'node_timeout' | 'resource_limit';
  executionId: string;
  workflowId: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  data: any;
}

/**
 * Progress Monitor
 *
 * Monitors workflow execution progress with predictive analytics,
 * performance tracking, and intelligent alerting.
 */
export class ProgressMonitor extends EventEmitter {
  private eventStreamingManager: EventStreamingManager;
  private config: ProgressMonitorConfig;
  private activeProgressTracking: Map<string, WorkflowProgress> = new Map();
  private historicalExecutions: WorkflowProgress[] = [];
  private performanceData: Map<string, PerformanceMetrics> = new Map();
  private workflowBenchmarks: Map<string, any> = new Map();
  private progressUpdateTimer: NodeJS.Timeout | null = null;

  constructor(eventStreamingManager: EventStreamingManager, config: ProgressMonitorConfig) {
    super();
    this.eventStreamingManager = eventStreamingManager;
    this.config = config;
    this.setupEventListeners();
    this.startProgressUpdates();
  }

  /**
   * Get current progress for an execution
   */
  public getExecutionProgress(executionId: string): WorkflowProgress | null {
    return this.activeProgressTracking.get(executionId) || null;
  }

  /**
   * Get all active execution progress
   */
  public getAllActiveProgress(): WorkflowProgress[] {
    return Array.from(this.activeProgressTracking.values());
  }

  /**
   * Get historical execution data
   */
  public getHistoricalExecutions(workflowId?: string, limit?: number): WorkflowProgress[] {
    let filtered = this.historicalExecutions;
    
    if (workflowId) {
      filtered = filtered.filter(exec => exec.workflowId === workflowId);
    }
    
    if (limit) {
      filtered = filtered.slice(-limit);
    }
    
    return filtered;
  }

  /**
   * Get performance metrics for an execution
   */
  public getPerformanceMetrics(executionId: string): PerformanceMetrics | null {
    return this.performanceData.get(executionId) || null;
  }

  /**
   * Get workflow benchmarks
   */
  public getWorkflowBenchmarks(workflowId: string): any {
    return this.workflowBenchmarks.get(workflowId) || null;
  }

  /**
   * Get predicted completion time
   */
  public getPredictedCompletionTime(executionId: string): Date | null {
    const progress = this.activeProgressTracking.get(executionId);
    if (!progress || !this.config.enablePredictiveAnalytics) {
      return null;
    }

    const benchmark = this.workflowBenchmarks.get(progress.workflowId);
    if (!benchmark) {
      return null;
    }

    const elapsedTime = Date.now() - new Date(progress.startTime).getTime();
    const completionRatio = progress.overallProgress / 100;
    
    if (completionRatio > 0) {
      const estimatedTotalTime = elapsedTime / completionRatio;
      const estimatedEndTime = new Date(new Date(progress.startTime).getTime() + estimatedTotalTime);
      return estimatedEndTime;
    }

    return null;
  }

  /**
   * Setup event listeners for streaming manager
   */
  private setupEventListeners(): void {
    this.eventStreamingManager.on('executionStarted', (data) => {
      this.handleExecutionStarted(data.execution);
    });

    this.eventStreamingManager.on('executionCompleted', (data) => {
      this.handleExecutionCompleted(data.execution);
    });

    this.eventStreamingManager.on('nodeExecutionStarted', (data) => {
      this.handleNodeExecutionStarted(data.nodeUpdate, data.execution);
    });

    this.eventStreamingManager.on('nodeExecutionCompleted', (data) => {
      this.handleNodeExecutionCompleted(data.nodeUpdate, data.execution);
    });

    this.eventStreamingManager.on('progressUpdate', (progressUpdate: ProgressUpdate) => {
      this.handleProgressUpdate(progressUpdate);
    });
  }

  /**
   * Handle execution started
   */
  private handleExecutionStarted(execution: WorkflowExecutionStatus): void {
    const progress: WorkflowProgress = {
      executionId: execution.executionId,
      workflowId: execution.workflowId,
      overallProgress: 0,
      currentPhase: 'initializing',
      nodeProgress: [],
      startTime: execution.startTime,
      performance: {
        averageNodeTime: 0,
        bottlenecks: [],
      },
    };

    this.activeProgressTracking.set(execution.executionId, progress);
    this.emit('progressStarted', { progress, timestamp: new Date().toISOString() });
  }

  /**
   * Handle execution completed
   */
  private handleExecutionCompleted(execution: WorkflowExecutionStatus): void {
    const progress = this.activeProgressTracking.get(execution.executionId);
    if (!progress) return;

    // Update progress with completion data
    progress.overallProgress = 100;
    progress.currentPhase = execution.status === 'success' ? 'completed' : 'failed';
    progress.actualEndTime = execution.endTime;
    
    if (execution.endTime) {
      progress.actualDuration = new Date(execution.endTime).getTime() - new Date(progress.startTime).getTime();
    }

    // Calculate performance metrics
    if (this.config.enablePerformanceTracking) {
      this.calculatePerformanceMetrics(progress);
    }

    // Update benchmarks
    if (this.config.benchmarkingEnabled) {
      this.updateWorkflowBenchmarks(progress);
    }

    // Check for alerts
    this.checkForAlerts(progress);

    // Move to historical data
    this.historicalExecutions.push({ ...progress });
    this.activeProgressTracking.delete(execution.executionId);

    // Trim historical data if needed
    if (this.historicalExecutions.length > this.config.historicalDataLimit) {
      this.historicalExecutions = this.historicalExecutions.slice(-this.config.historicalDataLimit);
    }

    this.emit('progressCompleted', { progress, timestamp: new Date().toISOString() });
  }

  /**
   * Handle node execution started
   */
  private handleNodeExecutionStarted(nodeUpdate: NodeExecutionUpdate, execution: WorkflowExecutionStatus): void {
    const progress = this.activeProgressTracking.get(execution.executionId);
    if (!progress) return;

    progress.currentPhase = 'executing';

    // Find or create node progress entry
    let nodeProgress = progress.nodeProgress.find(np => np.nodeId === nodeUpdate.nodeId);
    if (!nodeProgress) {
      nodeProgress = {
        nodeId: nodeUpdate.nodeId,
        nodeName: nodeUpdate.nodeName,
        status: 'running',
        progress: 0,
        startTime: nodeUpdate.startTime,
      };
      progress.nodeProgress.push(nodeProgress);
    } else {
      nodeProgress.status = 'running';
      nodeProgress.startTime = nodeUpdate.startTime;
      nodeProgress.progress = 0;
    }

    this.updateOverallProgress(progress);
    this.emit('nodeProgressStarted', { 
      progress, 
      nodeProgress, 
      timestamp: new Date().toISOString() 
    });
  }

  /**
   * Handle node execution completed
   */
  private handleNodeExecutionCompleted(nodeUpdate: NodeExecutionUpdate, execution: WorkflowExecutionStatus): void {
    const progress = this.activeProgressTracking.get(execution.executionId);
    if (!progress) return;

    // Update node progress
    const nodeProgress = progress.nodeProgress.find(np => np.nodeId === nodeUpdate.nodeId);
    if (nodeProgress) {
      nodeProgress.status = nodeUpdate.status === 'success' ? 'completed' : 'failed';
      nodeProgress.progress = 100;
      nodeProgress.endTime = nodeUpdate.endTime;
      nodeProgress.error = nodeUpdate.error;

      if (nodeUpdate.startTime && nodeUpdate.endTime) {
        nodeProgress.executionTime = new Date(nodeUpdate.endTime).getTime() - 
                                   new Date(nodeUpdate.startTime).getTime();
      }
    }

    this.updateOverallProgress(progress);
    this.updatePerformanceData(progress);

    this.emit('nodeProgressCompleted', { 
      progress, 
      nodeProgress, 
      timestamp: new Date().toISOString() 
    });
  }

  /**
   * Handle progress update
   */
  private handleProgressUpdate(progressUpdate: ProgressUpdate): void {
    const progress = this.activeProgressTracking.get(progressUpdate.executionId);
    if (!progress) return;

    // Update with new progress information
    progress.overallProgress = progressUpdate.progress;
    
    // Update estimated completion time if predictive analytics enabled
    if (this.config.enablePredictiveAnalytics) {
      const predictedTime = this.getPredictedCompletionTime(progressUpdate.executionId);
      if (predictedTime) {
        progress.estimatedEndTime = predictedTime.toISOString();
        progress.estimatedDuration = predictedTime.getTime() - new Date(progress.startTime).getTime();
      }
    }

    this.emit('progressUpdated', { progress, timestamp: new Date().toISOString() });
  }

  /**
   * Update overall progress based on node completion
   */
  private updateOverallProgress(progress: WorkflowProgress): void {
    if (progress.nodeProgress.length === 0) {
      progress.overallProgress = 0;
      return;
    }

    const totalProgress = progress.nodeProgress.reduce((sum, node) => sum + node.progress, 0);
    progress.overallProgress = Math.round(totalProgress / progress.nodeProgress.length);

    // Update current phase
    const completedNodes = progress.nodeProgress.filter(np => np.status === 'completed' || np.status === 'failed').length;
    const totalNodes = progress.nodeProgress.length;

    if (completedNodes === 0) {
      progress.currentPhase = 'initializing';
    } else if (completedNodes === totalNodes) {
      progress.currentPhase = 'completing';
    } else {
      progress.currentPhase = 'executing';
    }
  }

  /**
   * Update performance data
   */
  private updatePerformanceData(progress: WorkflowProgress): void {
    const executionTimes = progress.nodeProgress
      .filter(np => np.executionTime !== undefined)
      .map(np => np.executionTime!);

    if (executionTimes.length > 0) {
      progress.performance.averageNodeTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;

      // Find slowest and fastest nodes
      const nodeWithTimes = progress.nodeProgress.filter(np => np.executionTime !== undefined);
      if (nodeWithTimes.length > 0) {
        const slowestNode = nodeWithTimes.reduce((slowest, current) => 
          current.executionTime! > slowest.executionTime! ? current : slowest
        );
        const fastestNode = nodeWithTimes.reduce((fastest, current) => 
          current.executionTime! < fastest.executionTime! ? current : fastest
        );

        progress.performance.slowestNode = slowestNode.nodeName;
        progress.performance.fastestNode = fastestNode.nodeName;

        // Identify bottlenecks (nodes taking >2x average time)
        const avgTime = progress.performance.averageNodeTime;
        progress.performance.bottlenecks = nodeWithTimes
          .filter(np => np.executionTime! > avgTime * 2)
          .map(np => np.nodeName);
      }
    }
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(progress: WorkflowProgress): void {
    const nodeExecutionTimes: Record<string, number> = {};
    let totalExecutionTime = 0;
    let errorCount = 0;

    progress.nodeProgress.forEach(np => {
      if (np.executionTime) {
        nodeExecutionTimes[np.nodeName] = np.executionTime;
        totalExecutionTime += np.executionTime;
      }
      if (np.status === 'failed') {
        errorCount++;
      }
    });

    const benchmark = this.workflowBenchmarks.get(progress.workflowId);
    const metrics: PerformanceMetrics = {
      executionId: progress.executionId,
      workflowId: progress.workflowId,
      metrics: {
        totalExecutionTime: progress.actualDuration || totalExecutionTime,
        nodeExecutionTimes,
        errorCount,
        retryCount: 0, // TODO: Track retries
      },
      benchmarks: {
        averageExecutionTime: benchmark?.averageExecutionTime || totalExecutionTime,
        percentile95: benchmark?.percentile95 || totalExecutionTime,
        percentile99: benchmark?.percentile99 || totalExecutionTime,
        comparedToAverage: benchmark ? 
          (totalExecutionTime / benchmark.averageExecutionTime) : 1,
      },
    };

    this.performanceData.set(progress.executionId, metrics);
  }

  /**
   * Update workflow benchmarks
   */
  private updateWorkflowBenchmarks(progress: WorkflowProgress): void {
    const workflowId = progress.workflowId;
    let benchmark = this.workflowBenchmarks.get(workflowId);

    if (!benchmark) {
      benchmark = {
        workflowId,
        executionCount: 0,
        totalExecutionTime: 0,
        executionTimes: [],
        averageExecutionTime: 0,
        percentile95: 0,
        percentile99: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    if (progress.actualDuration) {
      benchmark.executionCount++;
      benchmark.totalExecutionTime += progress.actualDuration;
      benchmark.executionTimes.push(progress.actualDuration);
      benchmark.averageExecutionTime = benchmark.totalExecutionTime / benchmark.executionCount;

      // Calculate percentiles
      const sortedTimes = [...benchmark.executionTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sortedTimes.length * 0.95);
      const p99Index = Math.floor(sortedTimes.length * 0.99);
      
      benchmark.percentile95 = sortedTimes[p95Index] || benchmark.averageExecutionTime;
      benchmark.percentile99 = sortedTimes[p99Index] || benchmark.averageExecutionTime;
      benchmark.lastUpdated = new Date().toISOString();

      // Keep only recent execution times (last 100)
      if (benchmark.executionTimes.length > 100) {
        benchmark.executionTimes = benchmark.executionTimes.slice(-100);
      }

      this.workflowBenchmarks.set(workflowId, benchmark);
    }
  }

  /**
   * Check for alerts
   */
  private checkForAlerts(progress: WorkflowProgress): void {
    const alerts: ExecutionAlert[] = [];
    const benchmark = this.workflowBenchmarks.get(progress.workflowId);

    // Check for slow execution
    if (benchmark && progress.actualDuration) {
      const slowThreshold = benchmark.averageExecutionTime * this.config.alertThresholds.slowExecutionMultiplier;
      if (progress.actualDuration > slowThreshold) {
        alerts.push({
          type: 'slow_execution',
          executionId: progress.executionId,
          workflowId: progress.workflowId,
          message: `Execution took ${Math.round(progress.actualDuration / 1000)}s, ${Math.round(progress.actualDuration / benchmark.averageExecutionTime * 100)}% of average`,
          severity: progress.actualDuration > slowThreshold * 2 ? 'high' : 'medium',
          timestamp: new Date().toISOString(),
          data: { 
            actualDuration: progress.actualDuration, 
            averageDuration: benchmark.averageExecutionTime 
          },
        });
      }
    }

    // Check for high failure rate
    const failedNodes = progress.nodeProgress.filter(np => np.status === 'failed').length;
    const failureRate = failedNodes / Math.max(progress.nodeProgress.length, 1);
    if (failureRate > this.config.alertThresholds.highFailureRate) {
      alerts.push({
        type: 'high_failure_rate',
        executionId: progress.executionId,
        workflowId: progress.workflowId,
        message: `High failure rate: ${Math.round(failureRate * 100)}% of nodes failed`,
        severity: failureRate > 0.5 ? 'critical' : 'high',
        timestamp: new Date().toISOString(),
        data: { failureRate, failedNodes, totalNodes: progress.nodeProgress.length },
      });
    }

    // Emit alerts
    alerts.forEach(alert => {
      this.emit('alert', alert);
    });
  }

  /**
   * Start periodic progress updates
   */
  private startProgressUpdates(): void {
    this.progressUpdateTimer = setInterval(() => {
      const activeExecutions = Array.from(this.activeProgressTracking.values());
      
      activeExecutions.forEach(progress => {
        // Update estimated times for predictive analytics
        if (this.config.enablePredictiveAnalytics && progress.currentPhase === 'executing') {
          const predictedTime = this.getPredictedCompletionTime(progress.executionId);
          if (predictedTime) {
            progress.estimatedEndTime = predictedTime.toISOString();
            progress.estimatedDuration = predictedTime.getTime() - new Date(progress.startTime).getTime();
          }
        }

        this.emit('progressTick', { progress, timestamp: new Date().toISOString() });
      });
    }, this.config.progressUpdateInterval);
  }

  /**
   * Stop progress monitor
   */
  public stop(): void {
    if (this.progressUpdateTimer) {
      clearInterval(this.progressUpdateTimer);
      this.progressUpdateTimer = null;
    }
  }
}

/**
 * Create progress monitor with default configuration
 */
export function createProgressMonitor(
  eventStreamingManager: EventStreamingManager,
  options: Partial<ProgressMonitorConfig> = {}
): ProgressMonitor {
  const config: ProgressMonitorConfig = {
    enablePredictiveAnalytics: true,
    enablePerformanceTracking: true,
    historicalDataLimit: 1000,
    progressUpdateInterval: 1000,
    benchmarkingEnabled: true,
    alertThresholds: {
      slowExecutionMultiplier: 2.0,
      highFailureRate: 0.3,
      maxExecutionTime: 300000, // 5 minutes
    },
    ...options,
  };

  return new ProgressMonitor(eventStreamingManager, config);
}

/**
 * Default progress monitor configuration
 */
export const DEFAULT_PROGRESS_CONFIG: ProgressMonitorConfig = {
  enablePredictiveAnalytics: true,
  enablePerformanceTracking: true,
  historicalDataLimit: 1000,
  progressUpdateInterval: 1000,
  benchmarkingEnabled: true,
  alertThresholds: {
    slowExecutionMultiplier: 2.0,
    highFailureRate: 0.3,
    maxExecutionTime: 300000,
  },
};