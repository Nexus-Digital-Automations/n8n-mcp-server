import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import {
  SystemResourceUsage,
  WorkflowResourceUsage,
  InstanceHealthMetrics,
  ResourceMonitoringConfig,
  MonitoringDataPoint,
  PerformanceAlert,
  ResourceThresholds,
  MonitoringMetrics,
} from '../types/monitoringTypes.js';

const stat = promisify(fs.stat);

export class ResourceMonitor {
  private config: ResourceMonitoringConfig;
  private dataPoints: MonitoringDataPoint[] = [];
  private alerts: PerformanceAlert[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private startTime: number;
  private executionHistory: Map<string, Array<{ timestamp: number; duration: number; success: boolean }>> = new Map();

  constructor(config?: Partial<ResourceMonitoringConfig>) {
    this.startTime = Date.now();
    this.config = {
      monitoring: {
        enabled: true,
        intervalMs: 30000, // 30 seconds default
        retentionDays: 7,
        alertThresholds: {
          cpuUsage: 80,
          memoryUsage: 85,
          diskUsage: 90,
          executionTime: 300000, // 5 minutes
          errorRate: 10,
        },
      },
      collection: {
        systemMetrics: true,
        workflowMetrics: true,
        nodeMetrics: true,
        healthChecks: true,
      },
      storage: {
        inMemory: true,
        persistToDisk: false,
        maxDataPoints: 10000,
        compressionEnabled: false,
      },
      ...config,
    };
  }

  async startMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (!this.config.monitoring.enabled) {
      return;
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        console.error('Error collecting metrics:', error);
      }
    }, this.config.monitoring.intervalMs);

    console.log(`Resource monitoring started with ${this.config.monitoring.intervalMs}ms interval`);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Resource monitoring stopped');
    }
  }

  private async collectMetrics(): Promise<void> {
    const timestamp = new Date().toISOString();

    if (this.config.collection.systemMetrics) {
      const systemMetrics = await this.getSystemResourceUsage();
      this.addDataPoint({
        timestamp,
        metricType: 'system',
        data: systemMetrics as unknown as Record<string, unknown>,
        tags: { source: 'system' },
      });
      
      await this.checkResourceThresholds(systemMetrics);
    }

    // Clean up old data points
    this.cleanupOldDataPoints();
  }

  async getSystemResourceUsage(): Promise<SystemResourceUsage> {
    const cpuUsage = await this.getCPUUsage();
    const memoryInfo = this.getMemoryUsage();
    const diskInfo = await this.getDiskUsage();
    const networkInfo = await this.getNetworkUsage();

    return {
      cpu: {
        totalUsage: cpuUsage.totalUsage,
        processUsage: cpuUsage.processUsage,
        loadAverage: os.loadavg(),
        coreCount: os.cpus().length,
      },
      memory: {
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        usedMemory: os.totalmem() - os.freemem(),
        processMemory: memoryInfo,
        utilization: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
      },
      disk: diskInfo,
      network: networkInfo,
      uptime: (Date.now() - this.startTime) / 1000,
      timestamp: new Date().toISOString(),
    };
  }

  private async getCPUUsage(): Promise<{ totalUsage: number; processUsage: number }> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime();

      setTimeout(() => {
        const currentUsage = process.cpuUsage(startUsage);
        const currentTime = process.hrtime(startTime);
        
        const elapsedTime = currentTime[0] * 1000000 + currentTime[1] / 1000; // microseconds
        const totalCPUTime = currentUsage.user + currentUsage.system;
        const processUsage = (totalCPUTime / elapsedTime) * 100;

        // System CPU usage approximation based on load average
        const loadAvg = os.loadavg()[0];
        const coreCount = os.cpus().length;
        const totalUsage = Math.min((loadAvg / coreCount) * 100, 100);

        resolve({
          totalUsage: Math.round(totalUsage * 100) / 100,
          processUsage: Math.round(processUsage * 100) / 100,
        });
      }, 100);
    });
  }

  private getMemoryUsage(): SystemResourceUsage['memory']['processMemory'] {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
  }

  private async getDiskUsage(): Promise<SystemResourceUsage['disk']> {
    try {
      const stats = await stat(process.cwd());
      
      // This is a simplified implementation
      // In production, you'd use platform-specific methods to get actual disk usage
      const totalSpace = 1000000000000; // 1TB placeholder
      const freeSpace = 500000000000; // 500GB placeholder
      const usedSpace = totalSpace - freeSpace;
      
      return {
        totalSpace,
        freeSpace,
        usedSpace,
        utilization: (usedSpace / totalSpace) * 100,
      };
    } catch (error) {
      return {
        totalSpace: 0,
        freeSpace: 0,
        usedSpace: 0,
        utilization: 0,
      };
    }
  }

  private async getNetworkUsage(): Promise<SystemResourceUsage['network']> {
    // Simplified network usage - in production you'd read from /proc/net/dev on Linux
    // or use platform-specific APIs
    return {
      bytesReceived: 0,
      bytesSent: 0,
      packetsReceived: 0,
      packetsSent: 0,
    };
  }

  async getWorkflowResourceUsage(workflowId: string, workflowName: string, isActive: boolean): Promise<WorkflowResourceUsage> {
    const executionHistory = this.executionHistory.get(workflowId) || [];
    const recentExecutions = executionHistory.filter(exec => 
      Date.now() - exec.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    const successfulRuns = recentExecutions.filter(exec => exec.success).length;
    const totalRuns = recentExecutions.length;
    const totalExecutionTime = recentExecutions.reduce((sum, exec) => sum + exec.duration, 0);
    const averageExecutionTime = totalRuns > 0 ? totalExecutionTime / totalRuns : 0;

    return {
      workflowId,
      workflowName,
      isActive,
      executionCount: totalRuns,
      resourceMetrics: {
        averageExecutionTime: Math.round(averageExecutionTime),
        lastExecutionTime: recentExecutions.length > 0 ? recentExecutions[recentExecutions.length - 1].duration : 0,
        totalExecutionTime: Math.round(totalExecutionTime),
        memoryUsage: {
          average: 50000000, // 50MB placeholder
          peak: 100000000, // 100MB placeholder
          current: isActive ? 75000000 : 0, // 75MB placeholder
        },
        cpuUsage: {
          average: 15, // 15% placeholder
          peak: 80, // 80% placeholder
          current: isActive ? 25 : 0, // 25% placeholder
        },
      },
      executionStats: {
        successfulRuns,
        failedRuns: totalRuns - successfulRuns,
        totalRuns,
        successRate: totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 100,
        lastExecution: recentExecutions.length > 0 
          ? new Date(recentExecutions[recentExecutions.length - 1].timestamp).toISOString()
          : new Date().toISOString(),
        averageRunsPerHour: this.calculateRunsPerHour(recentExecutions),
      },
      nodePerformance: [], // Would be populated with actual node performance data
    };
  }

  private calculateRunsPerHour(executions: Array<{ timestamp: number; duration: number; success: boolean }>): number {
    if (executions.length === 0) return 0;
    
    const timeSpanHours = (Date.now() - executions[0].timestamp) / (1000 * 60 * 60);
    return timeSpanHours > 0 ? executions.length / timeSpanHours : 0;
  }

  async getInstanceHealthMetrics(): Promise<InstanceHealthMetrics> {
    const systemUsage = await this.getSystemResourceUsage();
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Analyze system health
    if (systemUsage.cpu.totalUsage > 80) {
      issues.push('High CPU usage detected');
      recommendations.push('Consider scaling horizontally or optimizing workflow execution');
    }
    
    if (systemUsage.memory.utilization > 85) {
      issues.push('High memory usage detected');
      recommendations.push('Monitor memory-intensive workflows and consider increasing available memory');
    }
    
    if (systemUsage.disk.utilization > 90) {
      issues.push('Low disk space warning');
      recommendations.push('Clean up old execution data and logs');
    }

    const healthScore = this.calculateHealthScore(systemUsage, issues.length);
    const status = this.determineHealthStatus(healthScore, issues.length);

    return {
      overall: {
        status,
        score: healthScore,
        issues,
        recommendations,
      },
      performance: {
        responseTime: 150, // Placeholder - would measure actual API response time
        throughput: 10, // Placeholder - executions per minute
        errorRate: 2, // Placeholder - error percentage
        availabilityUptime: 99.5, // Placeholder - uptime percentage
      },
      resources: {
        memoryPressure: systemUsage.memory.utilization > 85,
        cpuThrottling: systemUsage.cpu.totalUsage > 90,
        diskSpaceWarning: systemUsage.disk.utilization > 90,
        networkLatency: 50, // Placeholder
      },
      dependencies: [
        {
          name: 'Database',
          type: 'database',
          status: 'online',
          responseTime: 25,
          errorCount: 0,
        },
        {
          name: 'File System',
          type: 'file_system',
          status: 'online',
          responseTime: 10,
          errorCount: 0,
        },
      ],
      alerts: this.alerts.filter(alert => !alert.resolvedAt).map(alert => ({
        id: alert.id,
        severity: alert.severity as 'info' | 'warning' | 'error' | 'critical',
        message: alert.description,
        timestamp: alert.triggeredAt,
        resolved: Boolean(alert.resolvedAt),
      })),
    };
  }

  private calculateHealthScore(systemUsage: SystemResourceUsage, issueCount: number): number {
    let score = 100;
    
    // Deduct points based on resource usage
    score -= Math.max(0, systemUsage.cpu.totalUsage - 50) * 0.5;
    score -= Math.max(0, systemUsage.memory.utilization - 60) * 0.3;
    score -= Math.max(0, systemUsage.disk.utilization - 70) * 0.2;
    
    // Deduct points for issues
    score -= issueCount * 10;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private determineHealthStatus(score: number, issueCount: number): 'healthy' | 'warning' | 'critical' | 'degraded' {
    if (score >= 90 && issueCount === 0) return 'healthy';
    if (score >= 70 && issueCount <= 1) return 'warning';
    if (score >= 50) return 'degraded';
    return 'critical';
  }

  private async checkResourceThresholds(systemUsage: SystemResourceUsage): Promise<void> {
    const thresholds = this.config.monitoring.alertThresholds;
    
    if (systemUsage.cpu.totalUsage > thresholds.cpuUsage) {
      await this.createAlert({
        type: 'resource_threshold',
        severity: systemUsage.cpu.totalUsage > 95 ? 'critical' : 'high',
        title: 'High CPU Usage',
        description: `CPU usage is ${systemUsage.cpu.totalUsage.toFixed(1)}%, exceeding threshold of ${thresholds.cpuUsage}%`,
        metadata: {
          threshold: thresholds.cpuUsage,
          actualValue: systemUsage.cpu.totalUsage,
        },
      });
    }
    
    if (systemUsage.memory.utilization > thresholds.memoryUsage) {
      await this.createAlert({
        type: 'resource_threshold',
        severity: systemUsage.memory.utilization > 95 ? 'critical' : 'high',
        title: 'High Memory Usage',
        description: `Memory usage is ${systemUsage.memory.utilization.toFixed(1)}%, exceeding threshold of ${thresholds.memoryUsage}%`,
        metadata: {
          threshold: thresholds.memoryUsage,
          actualValue: systemUsage.memory.utilization,
        },
      });
    }
  }

  private async createAlert(alertData: Partial<PerformanceAlert>): Promise<void> {
    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: alertData.type || 'resource_threshold',
      severity: alertData.severity || 'medium',
      title: alertData.title || 'Performance Alert',
      description: alertData.description || 'Performance threshold exceeded',
      triggeredAt: new Date().toISOString(),
      metadata: alertData.metadata || {},
      actions: [],
    };
    
    this.alerts.push(alert);
    
    // Keep only recent alerts
    this.alerts = this.alerts.filter(a => 
      Date.now() - new Date(a.triggeredAt).getTime() < 24 * 60 * 60 * 1000
    );
  }

  recordWorkflowExecution(workflowId: string, duration: number, success: boolean): void {
    if (!this.executionHistory.has(workflowId)) {
      this.executionHistory.set(workflowId, []);
    }
    
    const history = this.executionHistory.get(workflowId)!;
    history.push({
      timestamp: Date.now(),
      duration,
      success,
    });
    
    // Keep only last 1000 executions per workflow
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
  }

  private addDataPoint(dataPoint: MonitoringDataPoint): void {
    this.dataPoints.push(dataPoint);
    
    // Enforce max data points limit
    if (this.dataPoints.length > this.config.storage.maxDataPoints) {
      this.dataPoints.splice(0, this.dataPoints.length - this.config.storage.maxDataPoints);
    }
  }

  private cleanupOldDataPoints(): void {
    const cutoffTime = Date.now() - (this.config.monitoring.retentionDays * 24 * 60 * 60 * 1000);
    this.dataPoints = this.dataPoints.filter(dp => 
      new Date(dp.timestamp).getTime() > cutoffTime
    );
  }

  getMetrics(): MonitoringMetrics {
    return {
      system: (this.dataPoints
        .filter(dp => dp.metricType === 'system')
        .slice(-1)[0]?.data as unknown as SystemResourceUsage) || {} as SystemResourceUsage,
      workflows: [],
      health: {} as InstanceHealthMetrics,
      alerts: this.alerts,
      dataPoints: this.dataPoints,
    };
  }

  getDataPoints(metricType?: string, limit?: number): MonitoringDataPoint[] {
    let points = this.dataPoints;
    
    if (metricType) {
      points = points.filter(dp => dp.metricType === metricType);
    }
    
    if (limit) {
      points = points.slice(-limit);
    }
    
    return points;
  }

  getAlerts(severity?: string, resolved?: boolean): PerformanceAlert[] {
    let alerts = this.alerts;
    
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }
    
    if (resolved !== undefined) {
      alerts = alerts.filter(alert => Boolean(alert.resolvedAt) === resolved);
    }
    
    return alerts.sort((a, b) => 
      new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
    );
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolvedAt) {
      alert.resolvedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  updateConfig(newConfig: Partial<ResourceMonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.monitoringInterval) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  getConfig(): ResourceMonitoringConfig {
    return { ...this.config };
  }
}