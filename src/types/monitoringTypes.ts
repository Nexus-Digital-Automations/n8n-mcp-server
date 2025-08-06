// Monitoring and resource tracking type definitions

export interface SystemResourceUsage {
  cpu: {
    totalUsage: number; // Percentage 0-100
    processUsage: number; // n8n process CPU usage
    loadAverage: number[]; // 1, 5, 15 minute load averages
    coreCount: number;
  };
  memory: {
    totalMemory: number; // Total system memory in bytes
    freeMemory: number; // Free memory in bytes
    usedMemory: number; // Used memory in bytes
    processMemory: {
      heapUsed: number; // Node.js heap used
      heapTotal: number; // Node.js heap total
      external: number; // External memory usage
      rss: number; // Resident set size
    };
    utilization: number; // Memory utilization percentage
  };
  disk: {
    totalSpace: number; // Total disk space in bytes
    freeSpace: number; // Free disk space in bytes
    usedSpace: number; // Used disk space in bytes
    utilization: number; // Disk utilization percentage
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
  uptime: number; // Process uptime in seconds
  timestamp: string; // ISO timestamp
}

export interface WorkflowResourceUsage {
  workflowId: string;
  workflowName: string;
  isActive: boolean;
  executionCount: number;
  resourceMetrics: {
    averageExecutionTime: number; // Average execution time in milliseconds
    lastExecutionTime: number; // Last execution time in milliseconds
    totalExecutionTime: number; // Total execution time across all runs
    memoryUsage: {
      average: number; // Average memory usage during executions
      peak: number; // Peak memory usage observed
      current: number; // Current memory usage if running
    };
    cpuUsage: {
      average: number; // Average CPU usage during executions
      peak: number; // Peak CPU usage observed
      current: number; // Current CPU usage if running
    };
  };
  executionStats: {
    successfulRuns: number;
    failedRuns: number;
    totalRuns: number;
    successRate: number; // Percentage
    lastExecution: string; // ISO timestamp
    averageRunsPerHour: number;
  };
  nodePerformance: Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    averageExecutionTime: number;
    executionCount: number;
    errorRate: number;
  }>;
}

export interface InstanceHealthMetrics {
  overall: {
    status: 'healthy' | 'warning' | 'critical' | 'degraded';
    score: number; // 0-100 health score
    issues: string[];
    recommendations: string[];
  };
  performance: {
    responseTime: number; // API response time in milliseconds
    throughput: number; // Executions per minute
    errorRate: number; // Error percentage
    availabilityUptime: number; // Uptime percentage
  };
  resources: {
    memoryPressure: boolean;
    cpuThrottling: boolean;
    diskSpaceWarning: boolean;
    networkLatency: number;
  };
  dependencies: Array<{
    name: string;
    type: 'database' | 'external_api' | 'file_system' | 'network';
    status: 'online' | 'offline' | 'degraded';
    responseTime: number;
    errorCount: number;
  }>;
  alerts: Array<{
    id: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    timestamp: string;
    resolved: boolean;
  }>;
}

export interface ResourceMonitoringConfig {
  monitoring: {
    enabled: boolean;
    intervalMs: number; // Monitoring interval in milliseconds
    retentionDays: number; // Data retention period
    alertThresholds: {
      cpuUsage: number; // CPU usage threshold percentage
      memoryUsage: number; // Memory usage threshold percentage
      diskUsage: number; // Disk usage threshold percentage
      executionTime: number; // Execution time threshold in milliseconds
      errorRate: number; // Error rate threshold percentage
    };
  };
  collection: {
    systemMetrics: boolean;
    workflowMetrics: boolean;
    nodeMetrics: boolean;
    healthChecks: boolean;
  };
  storage: {
    inMemory: boolean;
    persistToDisk: boolean;
    maxDataPoints: number;
    compressionEnabled: boolean;
  };
}

export interface MonitoringDataPoint {
  timestamp: string;
  metricType: 'system' | 'workflow' | 'health' | 'performance';
  data: Record<string, unknown>;
  tags: Record<string, string>;
}

export interface PerformanceAlert {
  id: string;
  type: 'resource_threshold' | 'execution_failure' | 'response_time' | 'health_check';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  triggeredAt: string;
  resolvedAt?: string;
  metadata: {
    workflowId?: string;
    executionId?: string;
    nodeId?: string;
    threshold?: number;
    actualValue?: number;
    duration?: number;
  };
  actions: Array<{
    type: 'auto_scaling' | 'notification' | 'restart' | 'throttle';
    description: string;
    executed: boolean;
    result?: string;
  }>;
}

export interface MonitoringReport {
  reportId: string;
  generatedAt: string;
  timeRange: {
    start: string;
    end: string;
    duration: string;
  };
  summary: {
    totalWorkflows: number;
    activeWorkflows: number;
    totalExecutions: number;
    successfulExecutions: number;
    averageExecutionTime: number;
    systemUptimePercentage: number;
    alertsGenerated: number;
  };
  resourceTrends: {
    cpuTrend: 'increasing' | 'decreasing' | 'stable';
    memoryTrend: 'increasing' | 'decreasing' | 'stable';
    executionTrend: 'increasing' | 'decreasing' | 'stable';
  };
  topPerformers: {
    fastestWorkflows: WorkflowResourceUsage[];
    slowestWorkflows: WorkflowResourceUsage[];
    mostActiveWorkflows: WorkflowResourceUsage[];
    leastReliableWorkflows: WorkflowResourceUsage[];
  };
  recommendations: Array<{
    category: 'performance' | 'reliability' | 'cost' | 'security';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    estimatedImpact: string;
    implementationEffort: 'low' | 'medium' | 'high';
  }>;
}

export interface ResourceThresholds {
  cpu: {
    warning: number; // CPU usage warning threshold (percentage)
    critical: number; // CPU usage critical threshold (percentage)
  };
  memory: {
    warning: number; // Memory usage warning threshold (percentage)
    critical: number; // Memory usage critical threshold (percentage)
  };
  disk: {
    warning: number; // Disk usage warning threshold (percentage)
    critical: number; // Disk usage critical threshold (percentage)
  };
  executionTime: {
    warning: number; // Execution time warning threshold (milliseconds)
    critical: number; // Execution time critical threshold (milliseconds)
  };
  errorRate: {
    warning: number; // Error rate warning threshold (percentage)
    critical: number; // Error rate critical threshold (percentage)
  };
  responseTime: {
    warning: number; // API response time warning threshold (milliseconds)
    critical: number; // API response time critical threshold (milliseconds)
  };
}

export interface MonitoringMetrics {
  system: SystemResourceUsage;
  workflows: WorkflowResourceUsage[];
  health: InstanceHealthMetrics;
  alerts: PerformanceAlert[];
  dataPoints: MonitoringDataPoint[];
}

export interface SystemDiagnostics {
  timestamp: string;
  overall: {
    status: 'healthy' | 'warning' | 'critical' | 'degraded';
    issues: string[];
    recommendations: string[];
  };
  connectivity: {
    apiConnectivity: boolean;
    responseTime: number;
    error?: string;
  };
  resources: SystemResourceUsage;
  environment: {
    nodeVersion: string;
    platform: string;
    architecture: string;
    uptime: number;
  };
}

export interface HealthCheckResponse {
  status: 'healthy' | 'warning' | 'critical' | 'degraded';
  version: string;
  uptime: number;
  database: {
    status: 'connected' | 'disconnected' | 'error';
    responseTime: number;
  };
  redis?: {
    status: 'connected' | 'disconnected' | 'error';
    responseTime: number;
  };
  filesystem: {
    status: 'accessible' | 'error';
    permissions: 'read-write' | 'read-only' | 'no-access';
  };
}

export interface MetricsResponse {
  timestamp: string;
  executions: {
    total: number;
    successful: number;
    failed: number;
    running: number;
    waiting: number;
  };
  workflows: {
    total: number;
    active: number;
    inactive: number;
    withIssues: number;
  };
  performance: {
    averageExecutionTime: number;
    throughput: number;
    errorRate: number;
  };
  system: SystemResourceUsage;
}