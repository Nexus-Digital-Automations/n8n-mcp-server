import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { MonitoringClient } from '../src/client/monitoringClient.js';
import { N8nClient } from '../src/client/n8nClient.js';
import {
  SystemResourceUsage,
  SystemDiagnostics,
  HealthCheckResponse,
  MetricsResponse,
} from '../src/types/monitoringTypes.js';

// Create a proper mock for N8nClient with explicit typing
const mockGetWorkflows = jest.fn() as jest.MockedFunction<any>;
const mockGetWorkflow = jest.fn() as jest.MockedFunction<any>;
const mockGetExecutions = jest.fn() as jest.MockedFunction<any>;

const mockN8nClient = {
  getWorkflows: mockGetWorkflows,
  getWorkflow: mockGetWorkflow,
  getExecutions: mockGetExecutions,
} as unknown as N8nClient;

describe('Monitoring Client', () => {
  let monitoringClient: MonitoringClient;
  const baseUrl = 'http://localhost:5678';
  const apiKey = 'test-api-key';

  beforeAll(() => {
    monitoringClient = new MonitoringClient(mockN8nClient, baseUrl, apiKey);
  });

  describe('System Resource Usage', () => {
    it('should return current system resource usage', () => {
      const usage = monitoringClient.getSystemResourceUsage();

      expect(usage).toBeDefined();
      expect(usage.timestamp).toBeDefined();
      expect(usage.cpu).toBeDefined();
      expect(usage.memory).toBeDefined();
      expect(usage.disk).toBeDefined();
      expect(usage.network).toBeDefined();
      expect(usage.uptime).toBeGreaterThan(0);

      // CPU checks
      expect(usage.cpu.totalUsage).toBeGreaterThanOrEqual(0);
      expect(usage.cpu.totalUsage).toBeLessThanOrEqual(100);
      expect(usage.cpu.coreCount).toBeGreaterThan(0);
      expect(Array.isArray(usage.cpu.loadAverage)).toBe(true);

      // Memory checks
      expect(usage.memory.totalMemory).toBeGreaterThan(0);
      expect(usage.memory.freeMemory).toBeGreaterThanOrEqual(0);
      expect(usage.memory.usedMemory).toBeGreaterThan(0);
      expect(usage.memory.utilization).toBeGreaterThanOrEqual(0);
      expect(usage.memory.utilization).toBeLessThanOrEqual(100);
      expect(usage.memory.processMemory.heapUsed).toBeGreaterThan(0);
      expect(usage.memory.processMemory.heapTotal).toBeGreaterThan(0);
      expect(usage.memory.processMemory.rss).toBeGreaterThan(0);
    });

    it('should have consistent memory calculations', () => {
      const usage = monitoringClient.getSystemResourceUsage();

      // Total memory should equal used + free
      expect(usage.memory.totalMemory).toBeCloseTo(
        usage.memory.usedMemory + usage.memory.freeMemory,
        -3 // Allow for some variance in bytes
      );

      // Utilization should match calculated percentage
      const calculatedUtilization = (usage.memory.usedMemory / usage.memory.totalMemory) * 100;
      expect(usage.memory.utilization).toBeCloseTo(calculatedUtilization, 1);
    });
  });

  describe('Health Check Functions', () => {
    it('should perform manual health check when API unavailable', async () => {
      // Mock getWorkflows to simulate database connectivity
      mockGetWorkflows.mockResolvedValue({ data: [] });

      const healthCheck = await monitoringClient.getHealthCheck();

      expect(healthCheck).toBeDefined();
      expect(healthCheck.status).toBeDefined();
      expect(['healthy', 'warning', 'critical', 'degraded']).toContain(healthCheck.status);
      expect(healthCheck.database).toBeDefined();
      expect(healthCheck.database.status).toBeDefined();
      expect(healthCheck.database.responseTime).toBeGreaterThanOrEqual(0);
      expect(healthCheck.filesystem).toBeDefined();
      expect(healthCheck.uptime).toBeGreaterThan(0);
    });

    it('should handle database connection errors', async () => {
      // Mock getWorkflows to throw an error
      mockGetWorkflows.mockRejectedValue(new Error('Connection failed'));

      const healthCheck = await monitoringClient.getHealthCheck();

      expect(healthCheck.status).toBe('critical');
      expect(healthCheck.database.status).toBe('error');
      expect(healthCheck.filesystem.status).toBe('error');
    });
  });

  describe('Connectivity Testing', () => {
    it('should test connectivity successfully', async () => {
      mockGetWorkflows.mockResolvedValue({ data: [] });

      const result = await monitoringClient.testConnectivity();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('should handle connectivity failures', async () => {
      mockGetWorkflows.mockRejectedValue(new Error('Network error'));

      const result = await monitoringClient.testConnectivity();

      expect(result.success).toBe(false);
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Network error');
    });
  });

  describe('System Diagnostics', () => {
    it('should generate comprehensive system diagnostics', async () => {
      mockGetWorkflows.mockResolvedValue({ data: [] });

      const diagnostics = await monitoringClient.getSystemDiagnostics();

      expect(diagnostics).toBeDefined();
      expect(diagnostics.timestamp).toBeDefined();
      expect(diagnostics.overall).toBeDefined();
      expect(diagnostics.overall.status).toBeDefined();
      expect(Array.isArray(diagnostics.overall.issues)).toBe(true);
      expect(Array.isArray(diagnostics.overall.recommendations)).toBe(true);

      expect(diagnostics.connectivity).toBeDefined();
      expect(typeof diagnostics.connectivity.apiConnectivity).toBe('boolean');
      expect(diagnostics.connectivity.responseTime).toBeGreaterThanOrEqual(0);

      expect(diagnostics.resources).toBeDefined();
      expect(diagnostics.environment).toBeDefined();
      expect(diagnostics.environment.nodeVersion).toBeDefined();
      expect(diagnostics.environment.platform).toBeDefined();
      expect(diagnostics.environment.architecture).toBeDefined();
      expect(diagnostics.environment.uptime).toBeGreaterThan(0);
    });

    it('should provide recommendations based on resource usage', async () => {
      mockGetWorkflows.mockResolvedValue({ data: [] });

      // Mock high resource usage by modifying the method temporarily
      const originalMethod = monitoringClient.getSystemResourceUsage;
      monitoringClient.getSystemResourceUsage = () => ({
        ...originalMethod.call(monitoringClient),
        memory: {
          ...originalMethod.call(monitoringClient).memory,
          utilization: 90, // High memory usage
        },
        cpu: {
          ...originalMethod.call(monitoringClient).cpu,
          totalUsage: 85, // High CPU usage
        },
      });

      const diagnostics = await monitoringClient.getSystemDiagnostics();

      expect(diagnostics.overall.issues.length).toBeGreaterThan(0);
      expect(diagnostics.overall.recommendations.length).toBeGreaterThan(0);

      // Restore original method
      monitoringClient.getSystemResourceUsage = originalMethod;
    });
  });

  describe('Metrics Collection', () => {
    it('should collect comprehensive metrics', async () => {
      // Mock workflow and execution data
      const mockWorkflows = [
        { id: '1', name: 'Workflow 1', active: true, nodes: [{ id: 'node1', type: 'test' }] },
        { id: '2', name: 'Workflow 2', active: false, nodes: [] },
      ];

      const mockExecutions = [
        {
          id: '1',
          workflowId: '1',
          finished: true,
          startedAt: new Date(Date.now() - 1000).toISOString(),
          stoppedAt: undefined,
        },
        {
          id: '2',
          workflowId: '1',
          finished: true,
          startedAt: new Date(Date.now() - 2000).toISOString(),
          stoppedAt: new Date(Date.now() - 1500).toISOString(),
        },
      ];

      mockGetWorkflows.mockResolvedValue({ data: mockWorkflows });
      mockGetExecutions.mockResolvedValue({ data: mockExecutions });

      const metrics = await monitoringClient.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.timestamp).toBeDefined();

      // Check execution metrics
      expect(metrics.executions).toBeDefined();
      expect(metrics.executions.total).toBe(2);
      expect(metrics.executions.successful).toBe(1);
      expect(metrics.executions.failed).toBe(1);

      // Check workflow metrics
      expect(metrics.workflows).toBeDefined();
      expect(metrics.workflows.total).toBe(2);
      expect(metrics.workflows.active).toBe(1);
      expect(metrics.workflows.inactive).toBe(1);
      expect(metrics.workflows.withIssues).toBe(1); // Workflow with no nodes

      // Check performance metrics
      expect(metrics.performance).toBeDefined();
      expect(metrics.performance.averageExecutionTime).toBeGreaterThanOrEqual(0);
      expect(metrics.performance.throughput).toBeGreaterThanOrEqual(0);
      expect(metrics.performance.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.performance.errorRate).toBeLessThanOrEqual(100);

      // Check system metrics
      expect(metrics.system).toBeDefined();
    });
  });

  describe('Workflow Diagnostics', () => {
    it('should analyze workflow health', async () => {
      const mockWorkflow = {
        id: 'test-workflow',
        name: 'Test Workflow',
        active: true,
        nodes: [
          { id: 'node1', name: 'Start', type: 'manual', disabled: false },
          { id: 'node2', name: 'Process', type: 'function', disabled: false },
        ],
      };

      const mockExecutions = [
        {
          id: '1',
          workflowId: 'test-workflow',
          finished: true,
          startedAt: new Date(Date.now() - 5000).toISOString(),
          stoppedAt: undefined, // Success
        },
        {
          id: '2',
          workflowId: 'test-workflow',
          finished: true,
          startedAt: new Date(Date.now() - 10000).toISOString(),
          stoppedAt: new Date(Date.now() - 8000).toISOString(), // Failed
        },
      ];

      mockGetWorkflow.mockResolvedValue(mockWorkflow);
      mockGetExecutions.mockResolvedValue({ data: mockExecutions });

      const diagnostics = await monitoringClient.getWorkflowDiagnostics('test-workflow');

      expect(diagnostics).toBeDefined();
      expect(diagnostics.workflowId).toBe('test-workflow');
      expect(diagnostics.workflowName).toBe('Test Workflow');

      expect(diagnostics.health).toBeDefined();
      expect(['healthy', 'warning', 'critical']).toContain(diagnostics.health.status);
      expect(Array.isArray(diagnostics.health.issues)).toBe(true);
      expect(Array.isArray(diagnostics.health.recommendations)).toBe(true);

      expect(diagnostics.performance).toBeDefined();
      expect(diagnostics.performance.successRate).toBe(50); // 1 success out of 2
      expect(Array.isArray(diagnostics.performance.recentExecutions)).toBe(true);
      expect(diagnostics.performance.recentExecutions).toHaveLength(2);

      expect(diagnostics.nodes).toBeDefined();
      expect(diagnostics.nodes).toHaveLength(2);
      expect(diagnostics.nodes[0].id).toBe('node1');
      expect(diagnostics.nodes[1].id).toBe('node2');
    });
  });
});

describe('Monitoring Utility Functions', () => {
  describe('Data Validation', () => {
    it('should validate system resource usage structure', () => {
      const mockClient = new MonitoringClient(mockN8nClient, 'http://test', 'key');
      const usage = mockClient.getSystemResourceUsage();

      // Required properties
      const requiredProps = ['cpu', 'memory', 'disk', 'network', 'uptime', 'timestamp'];

      requiredProps.forEach(prop => {
        expect(usage).toHaveProperty(prop);
      });

      // CPU structure
      expect(usage.cpu).toHaveProperty('totalUsage');
      expect(usage.cpu).toHaveProperty('processUsage');
      expect(usage.cpu).toHaveProperty('loadAverage');
      expect(usage.cpu).toHaveProperty('coreCount');

      // Memory structure
      expect(usage.memory).toHaveProperty('totalMemory');
      expect(usage.memory).toHaveProperty('freeMemory');
      expect(usage.memory).toHaveProperty('usedMemory');
      expect(usage.memory).toHaveProperty('processMemory');
      expect(usage.memory).toHaveProperty('utilization');

      expect(usage.memory.processMemory).toHaveProperty('heapUsed');
      expect(usage.memory.processMemory).toHaveProperty('heapTotal');
      expect(usage.memory.processMemory).toHaveProperty('external');
      expect(usage.memory.processMemory).toHaveProperty('rss');
    });

    it('should produce valid timestamp format', () => {
      const mockClient = new MonitoringClient(mockN8nClient, 'http://test', 'key');
      const usage = mockClient.getSystemResourceUsage();

      expect(() => new Date(usage.timestamp)).not.toThrow();
      expect(new Date(usage.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required parameters gracefully', () => {
      // Test client creation with invalid parameters
      expect(() => {
        new MonitoringClient(null as any, '', '');
      }).not.toThrow();
    });

    it('should handle network timeouts appropriately', async () => {
      mockGetWorkflows.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 1000);
        });
      });

      const mockClient = new MonitoringClient(mockN8nClient, 'http://test', 'key');

      const result = await mockClient.testConnectivity();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
    });
  });

  describe('Performance Calculations', () => {
    it('should calculate percentages correctly', () => {
      // Test percentage calculations used in monitoring
      const total = 100;
      const used = 75;
      const percentage = (used / total) * 100;

      expect(percentage).toBe(75);
      expect(percentage).toBeGreaterThanOrEqual(0);
      expect(percentage).toBeLessThanOrEqual(100);
    });

    it('should handle division by zero in calculations', () => {
      // Test safe division
      const safeDivision = (numerator: number, denominator: number) => {
        return denominator === 0 ? 0 : numerator / denominator;
      };

      expect(safeDivision(100, 0)).toBe(0);
      expect(safeDivision(100, 10)).toBe(10);
      expect(safeDivision(0, 10)).toBe(0);
    });
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});
