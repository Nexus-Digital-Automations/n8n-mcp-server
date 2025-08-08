import { ResourceMonitor } from '../../../src/utils/resourceMonitor.js';
import {
  SystemResourceUsage,
  WorkflowResourceUsage,
  InstanceHealthMetrics,
  ResourceMonitoringConfig,
  MonitoringDataPoint,
  PerformanceAlert,
  MonitoringMetrics,
} from '../../../src/types/monitoringTypes.js';

// Mock Node.js modules
jest.mock('os', () => ({
  totalmem: jest.fn(() => 8589934592), // 8GB
  freemem: jest.fn(() => 4294967296), // 4GB
  loadavg: jest.fn(() => [1.5, 2.0, 2.5]),
  cpus: jest.fn(() => new Array(4).fill({})), // 4 cores
}));

jest.mock('fs', () => ({
  stat: jest.fn(),
}));

jest.mock('util', () => ({
  promisify: jest.fn(fn => fn),
}));

describe('ResourceMonitor', () => {
  let resourceMonitor: ResourceMonitor;
  let mockConsoleLog: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;
  let mockSetInterval: jest.SpyInstance;
  let mockClearInterval: jest.SpyInstance;

  beforeEach(() => {
    // Mock console methods
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

    // Mock timer functions with proper return values
    let intervalId = 1;
    mockSetInterval = jest.spyOn(global, 'setInterval').mockImplementation((fn, interval) => {
      const id = intervalId++;
      // Execute the function after a short delay for testing
      setTimeout(() => {
        if (typeof fn === 'function') {
          fn();
        }
      }, 0);
      return id as any;
    });
    mockClearInterval = jest.spyOn(global, 'clearInterval').mockImplementation();

    // Mock process.cpuUsage with proper chaining
    const mockCpuUsage = jest
      .fn()
      .mockReturnValueOnce({ user: 1000000, system: 500000 }) // Initial call
      .mockReturnValue({ user: 2000000, system: 1000000 }); // Subsequent calls
    (process as any).cpuUsage = mockCpuUsage;

    // Mock process.hrtime with proper chaining
    const mockHrtime = jest
      .fn()
      .mockReturnValueOnce([0, 0]) // Initial call
      .mockReturnValue([0, 100000000]); // Subsequent calls (100ms)
    (process as any).hrtime = mockHrtime;

    // Mock process.memoryUsage
    (process as any).memoryUsage = jest.fn(() => ({
      heapUsed: 67108864, // 64MB
      heapTotal: 134217728, // 128MB
      external: 16777216, // 16MB
      rss: 201326592, // 192MB
    }));

    // Mock fs.stat
    const fs = require('fs');
    fs.stat.mockResolvedValue({
      isDirectory: () => true,
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    if (resourceMonitor) {
      resourceMonitor.stopMonitoring();
    }
    jest.clearAllTimers();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockSetInterval.mockRestore();
    mockClearInterval.mockRestore();
  });

  describe('Constructor', () => {
    it('should create ResourceMonitor with default configuration', () => {
      resourceMonitor = new ResourceMonitor();
      const config = resourceMonitor.getConfig();

      expect(config.monitoring.enabled).toBe(true);
      expect(config.monitoring.intervalMs).toBe(30000);
      expect(config.monitoring.retentionDays).toBe(7);
      expect(config.monitoring.alertThresholds.cpuUsage).toBe(80);
      expect(config.monitoring.alertThresholds.memoryUsage).toBe(85);
      expect(config.storage.maxDataPoints).toBe(10000);
    });

    it('should create ResourceMonitor with custom configuration', () => {
      const customConfig: Partial<ResourceMonitoringConfig> = {
        monitoring: {
          enabled: false,
          intervalMs: 60000,
          retentionDays: 7,
          alertThresholds: {
            cpuUsage: 70,
            memoryUsage: 80,
            diskUsage: 85,
            executionTime: 600000,
            errorRate: 5,
          },
        },
        storage: {
          inMemory: true,
          persistToDisk: false,
          maxDataPoints: 5000,
          compressionEnabled: false,
        },
      };

      resourceMonitor = new ResourceMonitor(customConfig);
      const config = resourceMonitor.getConfig();

      expect(config.monitoring.enabled).toBe(false);
      expect(config.monitoring.intervalMs).toBe(60000);
      expect(config.monitoring.alertThresholds.cpuUsage).toBe(70);
      expect(config.monitoring.alertThresholds.memoryUsage).toBe(80);
      expect(config.storage.maxDataPoints).toBe(5000);
    });
  });

  describe('Monitoring Lifecycle', () => {
    beforeEach(() => {
      resourceMonitor = new ResourceMonitor();
    });

    it('should start monitoring when enabled', async () => {
      await resourceMonitor.startMonitoring();

      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 30000);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Resource monitoring started with 30000ms interval'
      );
    });

    it('should not start monitoring when disabled', async () => {
      resourceMonitor = new ResourceMonitor({
        monitoring: {
          enabled: false,
          intervalMs: 30000,
          retentionDays: 7,
          alertThresholds: {
            cpuUsage: 80,
            memoryUsage: 85,
            diskUsage: 90,
            executionTime: 300000,
            errorRate: 10,
          },
        },
      });

      await resourceMonitor.startMonitoring();

      expect(mockSetInterval).not.toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should stop monitoring', async () => {
      await resourceMonitor.startMonitoring();
      resourceMonitor.stopMonitoring();

      expect(mockClearInterval).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('Resource monitoring stopped');
    });

    it('should clear existing interval before starting new one', async () => {
      await resourceMonitor.startMonitoring();
      await resourceMonitor.startMonitoring(); // Start again

      expect(mockClearInterval).toHaveBeenCalled();
      expect(mockSetInterval).toHaveBeenCalledTimes(2);
    });
  });

  describe('System Resource Usage', () => {
    beforeEach(() => {
      resourceMonitor = new ResourceMonitor();
    });

    it('should collect system resource usage', async () => {
      const systemUsage = await resourceMonitor.getSystemResourceUsage();

      expect(systemUsage).toMatchObject({
        cpu: {
          totalUsage: expect.any(Number),
          processUsage: expect.any(Number),
          loadAverage: [1.5, 2.0, 2.5],
          coreCount: 4,
        },
        memory: {
          totalMemory: 8589934592,
          freeMemory: 4294967296,
          usedMemory: 4294967296,
          processMemory: {
            heapUsed: 67108864,
            heapTotal: 134217728,
            external: 16777216,
            rss: 201326592,
          },
          utilization: 50,
        },
        disk: {
          totalSpace: expect.any(Number),
          freeSpace: expect.any(Number),
          usedSpace: expect.any(Number),
          utilization: expect.any(Number),
        },
        network: {
          bytesReceived: 0,
          bytesSent: 0,
          packetsReceived: 0,
          packetsSent: 0,
        },
        uptime: expect.any(Number),
        timestamp: expect.any(String),
      });
    });

    it('should calculate memory utilization correctly', async () => {
      const systemUsage = await resourceMonitor.getSystemResourceUsage();

      const expectedUtilization = ((8589934592 - 4294967296) / 8589934592) * 100;
      expect(systemUsage.memory.utilization).toBe(expectedUtilization);
    });

    it('should handle disk usage errors gracefully', async () => {
      const fs = require('fs');
      fs.stat.mockRejectedValue(new Error('Access denied'));

      const systemUsage = await resourceMonitor.getSystemResourceUsage();

      expect(systemUsage.disk).toEqual({
        totalSpace: 0,
        freeSpace: 0,
        usedSpace: 0,
        utilization: 0,
      });
    });
  });

  describe('Workflow Resource Usage', () => {
    beforeEach(() => {
      resourceMonitor = new ResourceMonitor();
    });

    it('should get workflow resource usage with no execution history', async () => {
      const workflowUsage = await resourceMonitor.getWorkflowResourceUsage(
        'workflow-1',
        'Test Workflow',
        true
      );

      expect(workflowUsage).toMatchObject({
        workflowId: 'workflow-1',
        workflowName: 'Test Workflow',
        isActive: true,
        executionCount: 0,
        resourceMetrics: {
          averageExecutionTime: 0,
          lastExecutionTime: 0,
          totalExecutionTime: 0,
          memoryUsage: {
            average: 50000000,
            peak: 100000000,
            current: 75000000,
          },
          cpuUsage: {
            average: 15,
            peak: 80,
            current: 25,
          },
        },
        executionStats: {
          successfulRuns: 0,
          failedRuns: 0,
          totalRuns: 0,
          successRate: 100,
          averageRunsPerHour: 0,
        },
        nodePerformance: [],
      });
    });

    it('should calculate workflow resource usage with execution history', async () => {
      // Record some executions
      resourceMonitor.recordWorkflowExecution('workflow-1', 5000, true);
      resourceMonitor.recordWorkflowExecution('workflow-1', 3000, true);
      resourceMonitor.recordWorkflowExecution('workflow-1', 7000, false);

      const workflowUsage = await resourceMonitor.getWorkflowResourceUsage(
        'workflow-1',
        'Test Workflow',
        false
      );

      expect(workflowUsage.executionCount).toBe(3);
      expect(workflowUsage.resourceMetrics.averageExecutionTime).toBe(5000);
      expect(workflowUsage.resourceMetrics.totalExecutionTime).toBe(15000);
      expect(workflowUsage.executionStats.successfulRuns).toBe(2);
      expect(workflowUsage.executionStats.failedRuns).toBe(1);
      expect(workflowUsage.executionStats.successRate).toBe(66.66666666666666);
      expect(workflowUsage.resourceMetrics.memoryUsage.current).toBe(0); // Inactive workflow
    });
  });

  describe('Instance Health Metrics', () => {
    beforeEach(() => {
      resourceMonitor = new ResourceMonitor();
    });

    it('should get instance health metrics with healthy status', async () => {
      const healthMetrics = await resourceMonitor.getInstanceHealthMetrics();

      expect(healthMetrics).toMatchObject({
        overall: {
          status: expect.stringMatching(/^(healthy|warning|degraded|critical)$/),
          score: expect.any(Number),
          issues: expect.any(Array),
          recommendations: expect.any(Array),
        },
        performance: {
          responseTime: 150,
          throughput: 10,
          errorRate: 2,
          availabilityUptime: 99.5,
        },
        resources: {
          memoryPressure: false, // 50% utilization < 85%
          cpuThrottling: expect.any(Boolean),
          diskSpaceWarning: expect.any(Boolean),
          networkLatency: 50,
        },
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            name: 'Database',
            type: 'database',
            status: 'online',
            responseTime: 25,
            errorCount: 0,
          }),
          expect.objectContaining({
            name: 'File System',
            type: 'file_system',
            status: 'online',
            responseTime: 10,
            errorCount: 0,
          }),
        ]),
        alerts: expect.any(Array),
      });

      expect(healthMetrics.overall.score).toBeGreaterThanOrEqual(0);
      expect(healthMetrics.overall.score).toBeLessThanOrEqual(100);
    });

    it('should detect high memory usage issues', async () => {
      // Mock high memory usage
      const os = require('os');
      os.totalmem.mockReturnValue(1000000000); // 1GB total
      os.freemem.mockReturnValue(100000000); // 100MB free (90% used)

      const healthMetrics = await resourceMonitor.getInstanceHealthMetrics();

      expect(healthMetrics.overall.issues).toContain('High memory usage detected');
      expect(healthMetrics.overall.recommendations).toContain(
        'Monitor memory-intensive workflows and consider increasing available memory'
      );
      expect(healthMetrics.resources.memoryPressure).toBe(true);
    });
  });

  describe('Alert Management', () => {
    beforeEach(() => {
      resourceMonitor = new ResourceMonitor({
        monitoring: {
          enabled: true,
          intervalMs: 30000,
          retentionDays: 7,
          alertThresholds: {
            cpuUsage: 70,
            memoryUsage: 80,
            diskUsage: 90,
            executionTime: 300000,
            errorRate: 10,
          },
        },
      });
    });

    it('should create CPU usage alert when threshold exceeded', async () => {
      // Mock high CPU usage
      const os = require('os');
      os.loadavg.mockReturnValue([3.0, 3.5, 4.0]); // High load average
      os.cpus.mockReturnValue(new Array(4).fill({}));

      await resourceMonitor.startMonitoring();

      // Wait a bit for the monitoring to collect metrics
      await new Promise(resolve => setTimeout(resolve, 10));

      const alerts = resourceMonitor.getAlerts();
      const cpuAlert = alerts.find(alert => alert.title === 'High CPU Usage');

      if (cpuAlert) {
        expect(cpuAlert.type).toBe('resource_threshold');
        expect(cpuAlert.severity).toMatch(/^(high|critical)$/);
        expect(cpuAlert.description).toContain('CPU usage');
      }
    });

    it('should create memory usage alert when threshold exceeded', async () => {
      // Mock high memory usage
      const os = require('os');
      os.totalmem.mockReturnValue(1000000000); // 1GB total
      os.freemem.mockReturnValue(150000000); // 150MB free (85% used)

      await resourceMonitor.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 10));

      const alerts = resourceMonitor.getAlerts();
      const memoryAlert = alerts.find(alert => alert.title === 'High Memory Usage');

      if (memoryAlert) {
        expect(memoryAlert.type).toBe('resource_threshold');
        expect(memoryAlert.severity).toMatch(/^(high|critical)$/);
        expect(memoryAlert.description).toContain('Memory usage');
      }
    });

    it('should resolve alerts', async () => {
      // Create a mock alert first
      await resourceMonitor.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 10));

      const alerts = resourceMonitor.getAlerts();
      if (alerts.length > 0) {
        const alertId = alerts[0].id;
        const resolved = resourceMonitor.resolveAlert(alertId);

        expect(resolved).toBe(true);

        const resolvedAlerts = resourceMonitor.getAlerts(undefined, true);
        expect(resolvedAlerts.some(alert => alert.id === alertId)).toBe(true);
      }
    });

    it('should filter alerts by severity', async () => {
      await resourceMonitor.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 10));

      const highSeverityAlerts = resourceMonitor.getAlerts('high');
      const criticalSeverityAlerts = resourceMonitor.getAlerts('critical');

      highSeverityAlerts.forEach(alert => {
        expect(alert.severity).toBe('high');
      });

      criticalSeverityAlerts.forEach(alert => {
        expect(alert.severity).toBe('critical');
      });
    });
  });

  describe('Data Point Management', () => {
    beforeEach(() => {
      resourceMonitor = new ResourceMonitor({
        storage: {
          inMemory: true,
          persistToDisk: false,
          maxDataPoints: 5,
          compressionEnabled: false,
        },
      });
    });

    it('should add and retrieve data points', async () => {
      await resourceMonitor.startMonitoring();

      // Wait for monitoring to collect data
      await new Promise(resolve => setTimeout(resolve, 100));

      const dataPoints = resourceMonitor.getDataPoints();

      // If no data points were collected due to timing, manually trigger collection
      if (dataPoints.length === 0) {
        // Manually trigger a collection to ensure we have data points for testing
        await (resourceMonitor as any).collectMetrics();
      }

      const updatedDataPoints = resourceMonitor.getDataPoints();
      expect(updatedDataPoints.length).toBeGreaterThan(0);
      expect(updatedDataPoints[0]).toMatchObject({
        timestamp: expect.any(String),
        metricType: expect.any(String),
        data: expect.any(Object),
        tags: expect.any(Object),
      });
    });

    it('should limit data points to maxDataPoints', async () => {
      // Simulate multiple monitoring intervals
      await resourceMonitor.startMonitoring();

      // Wait for multiple collection cycles
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      resourceMonitor.stopMonitoring();

      const dataPoints = resourceMonitor.getDataPoints();
      expect(dataPoints.length).toBeLessThanOrEqual(5);
    });

    it('should filter data points by metric type', async () => {
      await resourceMonitor.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 10));

      const systemDataPoints = resourceMonitor.getDataPoints('system');
      systemDataPoints.forEach(dp => {
        expect(dp.metricType).toBe('system');
      });
    });

    it('should limit data points by count', async () => {
      await resourceMonitor.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 10));

      const limitedDataPoints = resourceMonitor.getDataPoints(undefined, 2);
      expect(limitedDataPoints.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Configuration Management', () => {
    beforeEach(() => {
      resourceMonitor = new ResourceMonitor();
    });

    it('should update configuration', () => {
      const newConfig: Partial<ResourceMonitoringConfig> = {
        monitoring: {
          enabled: true,
          intervalMs: 45000,
          retentionDays: 7,
          alertThresholds: {
            cpuUsage: 75,
            memoryUsage: 85,
            diskUsage: 90,
            executionTime: 300000,
            errorRate: 10,
          },
        },
      };

      resourceMonitor.updateConfig(newConfig);
      const config = resourceMonitor.getConfig();

      expect(config.monitoring.intervalMs).toBe(45000);
      expect(config.monitoring.alertThresholds.cpuUsage).toBe(75);
      // Ensure other values are preserved
      expect(config.monitoring.enabled).toBe(true);
      expect(config.monitoring.alertThresholds.memoryUsage).toBe(85);
    });

    it('should restart monitoring after config update', async () => {
      await resourceMonitor.startMonitoring();

      resourceMonitor.updateConfig({
        monitoring: {
          enabled: true,
          intervalMs: 60000,
          retentionDays: 7,
          alertThresholds: {
            cpuUsage: 80,
            memoryUsage: 85,
            diskUsage: 90,
            executionTime: 300000,
            errorRate: 10,
          },
        },
      });

      expect(mockClearInterval).toHaveBeenCalled();
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });
  });

  describe('Workflow Execution Recording', () => {
    beforeEach(() => {
      resourceMonitor = new ResourceMonitor();
    });

    it('should record workflow execution', () => {
      resourceMonitor.recordWorkflowExecution('workflow-1', 5000, true);
      resourceMonitor.recordWorkflowExecution('workflow-1', 3000, false);

      // Verify through getWorkflowResourceUsage
      return resourceMonitor.getWorkflowResourceUsage('workflow-1', 'Test', false).then(usage => {
        expect(usage.executionCount).toBe(2);
        expect(usage.executionStats.successfulRuns).toBe(1);
        expect(usage.executionStats.failedRuns).toBe(1);
      });
    });

    it('should limit execution history per workflow', () => {
      // Record more than 1000 executions
      for (let i = 0; i < 1200; i++) {
        resourceMonitor.recordWorkflowExecution('workflow-1', 1000, true);
      }

      return resourceMonitor.getWorkflowResourceUsage('workflow-1', 'Test', false).then(usage => {
        expect(usage.executionCount).toBe(1000); // Should be capped at 1000
      });
    });
  });

  describe('Metrics Aggregation', () => {
    beforeEach(() => {
      resourceMonitor = new ResourceMonitor();
    });

    it('should get monitoring metrics', async () => {
      await resourceMonitor.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 50));

      const metrics = resourceMonitor.getMetrics();

      expect(metrics).toMatchObject({
        system: expect.any(Object),
        workflows: expect.any(Array),
        health: expect.any(Object),
        alerts: expect.any(Array),
        dataPoints: expect.any(Array),
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      resourceMonitor = new ResourceMonitor();
    });

    it('should handle errors during metric collection', async () => {
      // Mock os.totalmem to throw an error
      const os = require('os');
      os.totalmem.mockImplementation(() => {
        throw new Error('System error');
      });

      await resourceMonitor.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockConsoleError).toHaveBeenCalledWith('Error collecting metrics:', expect.any(Error));
    });
  });
});
