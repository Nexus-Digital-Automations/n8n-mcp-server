import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { FastMCP } from 'fastmcp';
import {
  ResourceManager,
  createResourceManager,
  parseResourceConfigFromEnv,
  RESOURCE_ENV_CONFIG,
} from '../../../src/resources/resourceManager';
import { N8nClient } from '../../../src/client/n8nClient';

// Mock dependencies
jest.mock('fastmcp');
jest.mock('../../../src/client/n8nClient');
jest.mock('../../../src/resources/workflowResources');
jest.mock('../../../src/resources/executionResources');

// Mock console methods to avoid test output pollution
const mockConsoleLog = jest.fn();
jest.spyOn(console, 'log').mockImplementation(mockConsoleLog);

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;
  let mockServer: jest.Mocked<FastMCP>;
  let mockClient: jest.Mocked<N8nClient>;
  let getClientFn: () => N8nClient | null;

  beforeEach(() => {
    // Create mock instances
    mockServer = {
      addResource: jest.fn(),
      addResourceTemplate: jest.fn(),
    } as unknown as jest.Mocked<FastMCP>;

    mockClient = {
      getWorkflows: jest.fn(),
      getExecutions: jest.fn(),
      getProjects: jest.fn(),
      getUsers: jest.fn(),
      getVariables: jest.fn(),
    } as unknown as jest.Mocked<N8nClient>;

    getClientFn = jest.fn().mockReturnValue(mockClient) as () => N8nClient | null;

    // Clear all mocks
    jest.clearAllMocks();
    mockConsoleLog.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      resourceManager = new ResourceManager();
      expect(resourceManager).toBeInstanceOf(ResourceManager);
    });

    it('should initialize with custom configuration', () => {
      const config = {
        baseUri: 'custom://n8n',
        enableWorkflows: false,
        enableExecutions: false,
        enableCredentials: true,
        enableNodes: false,
        globalCacheDuration: 10000,
        maxItems: 50,
      };

      resourceManager = new ResourceManager(config);
      expect(resourceManager).toBeInstanceOf(ResourceManager);
    });

    it('should merge custom config with defaults', () => {
      const config = {
        maxItems: 200,
        enableCredentials: true,
      };

      resourceManager = new ResourceManager(config);
      expect(resourceManager).toBeInstanceOf(ResourceManager);
    });
  });

  describe('Resource Registration', () => {
    beforeEach(() => {
      resourceManager = new ResourceManager();
    });

    it('should register all enabled resources with default config', () => {
      resourceManager.register(mockServer, getClientFn);

      expect(mockConsoleLog).toHaveBeenCalledWith('📚 Registering n8n MCP resources...');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ All n8n MCP resources registered');
    });

    it('should register workflow resources when enabled', () => {
      const config = { enableWorkflows: true };
      resourceManager = new ResourceManager(config);

      resourceManager.register(mockServer, getClientFn);

      expect(mockConsoleLog).toHaveBeenCalledWith('📚 Registering n8n MCP resources...');
    });

    it('should register execution resources when enabled', () => {
      const config = { enableExecutions: true };
      resourceManager = new ResourceManager(config);

      resourceManager.register(mockServer, getClientFn);

      expect(mockConsoleLog).toHaveBeenCalledWith('📚 Registering n8n MCP resources...');
    });

    it('should register node resources when enabled', () => {
      const config = { enableNodes: true };
      resourceManager = new ResourceManager(config);

      resourceManager.register(mockServer, getClientFn);

      expect(mockServer.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'n8n://nodes/available',
          name: 'n8n Available Nodes',
          mimeType: 'application/json',
        })
      );

      expect(mockServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'n8n://nodes/{nodeType}',
          name: 'n8n Node Documentation',
          mimeType: 'application/json',
        })
      );

      expect(mockConsoleLog).toHaveBeenCalledWith('📦 Node resources registered');
    });

    it('should register credential resources when enabled', () => {
      const config = { enableCredentials: true };
      resourceManager = new ResourceManager(config);

      resourceManager.register(mockServer, getClientFn);

      expect(mockServer.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'n8n://credentials/types',
          name: 'n8n Credential Types',
          mimeType: 'application/json',
        })
      );

      expect(mockServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'n8n://credentials/template/{credType}',
          name: 'n8n Credential Template',
          mimeType: 'application/json',
        })
      );

      expect(mockConsoleLog).toHaveBeenCalledWith('🔐 Credential resources registered');
    });

    it('should register general resources', () => {
      resourceManager.register(mockServer, getClientFn);

      expect(mockServer.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'n8n://info',
          name: 'n8n Instance Information',
          mimeType: 'application/json',
        })
      );

      expect(mockServer.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'n8n://index',
          name: 'n8n Resource Directory',
          mimeType: 'application/json',
        })
      );

      expect(mockConsoleLog).toHaveBeenCalledWith('ℹ️  General resources registered');
    });

    it('should skip resources when disabled', () => {
      const config = {
        enableWorkflows: false,
        enableExecutions: false,
        enableCredentials: false,
        enableNodes: false,
      };
      resourceManager = new ResourceManager(config);

      resourceManager.register(mockServer, getClientFn);

      expect(mockConsoleLog).toHaveBeenCalledWith('📚 Registering n8n MCP resources...');
      expect(mockConsoleLog).toHaveBeenCalledWith('ℹ️  General resources registered');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ All n8n MCP resources registered');
    });
  });

  describe('Node Resources', () => {
    beforeEach(() => {
      resourceManager = new ResourceManager({ enableNodes: true });
      resourceManager.register(mockServer, getClientFn);
    });

    it('should load available nodes resource', async () => {
      const addResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://nodes/available'
      );
      expect(addResourceCall).toBeDefined();
      if (!addResourceCall) throw new Error('Resource call not found');

      const resource = addResourceCall[0];
      const result = await resource.load();

      expect((result as any).text).toBeDefined();
      const data = JSON.parse((result as any).text);
      expect(data.nodes).toBeDefined();
      expect(data.metadata).toBeDefined();
      expect(data.resourceInfo).toBeDefined();
      expect(data.resourceInfo.uri).toBe('n8n://nodes/available');
      expect(data.resourceInfo.type).toBe('n8n-available-nodes');
    });

    it('should load node documentation template', async () => {
      const addTemplateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://nodes/{nodeType}'
      );
      expect(addTemplateCall).toBeDefined();
      if (!addTemplateCall) throw new Error('Template call not found');

      const template = addTemplateCall[0];
      const result = await template.load({ nodeType: 'n8n-nodes-base.httpRequest' });

      expect((result as any).text).toBeDefined();
      const data = JSON.parse((result as any).text);
      expect(data.nodeType).toBe('n8n-nodes-base.httpRequest');
      expect(data.name).toBe('httpRequest');
      expect(data.resourceInfo).toBeDefined();
      expect(data.resourceInfo.type).toBe('n8n-node-documentation');
    });

    it('should validate node template arguments', () => {
      const addTemplateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://nodes/{nodeType}'
      );
      expect(addTemplateCall).toBeDefined();
      if (!addTemplateCall) throw new Error('Template call not found');

      const template = addTemplateCall[0];
      expect(template.arguments).toHaveLength(1);
      expect(template.arguments[0]).toEqual({
        name: 'nodeType',
        description: 'The type of n8n node (e.g., "n8n-nodes-base.httpRequest")',
        required: true,
      });
    });
  });

  describe('Credential Resources', () => {
    beforeEach(() => {
      resourceManager = new ResourceManager({ enableCredentials: true });
      resourceManager.register(mockServer, getClientFn);
    });

    it('should load credential types resource', async () => {
      const addResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://credentials/types'
      );
      expect(addResourceCall).toBeDefined();
      if (!addResourceCall) throw new Error('Resource call not found');

      const resource = addResourceCall[0];
      const result = await resource.load();

      expect((result as any).text).toBeDefined();
      const data = JSON.parse((result as any).text);
      expect(data.credentialTypes).toBeDefined();
      expect(data.metadata).toBeDefined();
      expect(data.resourceInfo).toBeDefined();
      expect(data.resourceInfo.type).toBe('n8n-credential-types');
    });

    it('should load credential template', async () => {
      const addTemplateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://credentials/template/{credType}'
      );
      expect(addTemplateCall).toBeDefined();
      if (!addTemplateCall) throw new Error('Template call not found');

      const template = addTemplateCall[0];
      const result = await template.load({ credType: 'httpBasicAuth' });

      expect((result as any).text).toBeDefined();
      const data = JSON.parse((result as any).text);
      expect(data.credentialType).toBe('httpBasicAuth');
      expect(data.template).toBeDefined();
      expect(data.resourceInfo).toBeDefined();
      expect(data.resourceInfo.type).toBe('n8n-credential-template');
    });

    it('should validate credential template arguments', () => {
      const addTemplateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://credentials/template/{credType}'
      );
      expect(addTemplateCall).toBeDefined();
      if (!addTemplateCall) throw new Error('Template call not found');

      const template = addTemplateCall[0];
      expect(template.arguments).toHaveLength(1);
      expect(template.arguments[0]).toEqual({
        name: 'credType',
        description: 'The credential type name',
        required: true,
      });
    });
  });

  describe('General Resources', () => {
    beforeEach(() => {
      resourceManager = new ResourceManager();
      resourceManager.register(mockServer, getClientFn);
    });

    it('should load instance info resource successfully', async () => {
      mockClient.getWorkflows.mockResolvedValue({
        data: [{ id: '1', name: 'Test Workflow' }],
      } as any);
      mockClient.getExecutions.mockResolvedValue({
        data: [{ id: '1', workflowId: '1' }],
      } as any);
      mockClient.getProjects.mockResolvedValue({
        data: [{ id: '1', name: 'Test Project' }],
      } as any);
      mockClient.getUsers.mockResolvedValue({
        data: [{ id: '1', email: 'test@example.com' }],
      } as any);
      mockClient.getVariables.mockResolvedValue({
        data: [{ id: '1', key: 'test' }],
      } as any);

      const addResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://info'
      );
      expect(addResourceCall).toBeDefined();
      if (!addResourceCall) throw new Error('Resource call not found');

      const resource = addResourceCall[0];
      const result = await resource.load();

      expect((result as any).text).toBeDefined();
      const data = JSON.parse((result as any).text);
      expect(data.status).toBe('connected');
      expect(data.features).toBeDefined();
      expect(data.statistics).toBeDefined();
      expect(data.resourceInfo).toBeDefined();
      expect(data.resourceInfo.type).toBe('n8n-instance-info');
    });

    it('should handle instance info resource errors', async () => {
      mockClient.getWorkflows.mockRejectedValue(new Error('API Error'));

      const addResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://info'
      );
      expect(addResourceCall).toBeDefined();
      if (!addResourceCall) throw new Error('Resource call not found');

      const resource = addResourceCall[0];
      const result = await resource.load();

      expect((result as any).text).toBeDefined();
      const data = JSON.parse((result as any).text);
      expect(data.status).toBe('error');
      expect(data.error).toBe('API Error');
      expect(data.resourceInfo).toBeDefined();
    });

    it('should throw error when client not initialized', async () => {
      (getClientFn as jest.Mock).mockReturnValue(null);

      const addResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://info'
      );
      expect(addResourceCall).toBeDefined();
      if (!addResourceCall) throw new Error('Resource call not found');

      const resource = addResourceCall[0];
      await expect(resource.load()).rejects.toThrow(
        'n8n client not initialized. Run init-n8n first.'
      );
    });

    it('should load resource directory', async () => {
      const addResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://index'
      );
      expect(addResourceCall).toBeDefined();
      if (!addResourceCall) throw new Error('Resource call not found');

      const resource = addResourceCall[0];
      const result = await resource.load();

      expect((result as any).text).toBeDefined();
      const data = JSON.parse((result as any).text);
      expect(data.resources).toBeDefined();
      expect(data.metadata).toBeDefined();
      expect(data.resourceInfo).toBeDefined();
      expect(data.resourceInfo.type).toBe('n8n-resource-directory');
      expect(Array.isArray(data.resources)).toBe(true);
    });

    it('should include enabled resources in directory', () => {
      const config = {
        enableWorkflows: true,
        enableExecutions: true,
        enableNodes: true,
        enableCredentials: false,
      };
      resourceManager = new ResourceManager(config);
      resourceManager.register(mockServer, getClientFn);

      const addResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://index'
      );
      expect(addResourceCall).toBeDefined();
      if (!addResourceCall) throw new Error('Resource call not found');

      const resource = addResourceCall[0];
      return resource.load().then((result: any) => {
        const data = JSON.parse((result as any).text);
        const resourceNames = data.resources.map((r: any) => r.name);
        expect(resourceNames).toContain('Workflows');
        expect(resourceNames).toContain('Executions');
        expect(resourceNames).toContain('Nodes');
        expect(resourceNames).not.toContain('Credentials');
      });
    });
  });

  describe('Cache Management', () => {
    beforeEach(() => {
      resourceManager = new ResourceManager();
    });

    it('should clear all caches', () => {
      resourceManager.clearAllCaches();
      expect(mockConsoleLog).toHaveBeenCalledWith('🧹 All resource caches cleared');
    });

    it('should get cache statistics', () => {
      const stats = resourceManager.getAllCacheStats();
      expect(stats).toBeDefined();
      expect(stats.workflows).toBeDefined();
      expect(stats.executions).toBeDefined();
      expect(typeof stats.workflows.size).toBe('number');
      expect(Array.isArray(stats.workflows.keys)).toBe(true);
    });
  });

  describe('Feature Testing', () => {
    beforeEach(() => {
      resourceManager = new ResourceManager();
    });

    it('should test features that succeed', async () => {
      mockClient.getProjects.mockResolvedValue({ data: [] });
      resourceManager.register(mockServer, getClientFn);

      const addResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://info'
      );
      if (!addResourceCall) throw new Error('Resource call not found');
      const resource = addResourceCall[0];
      const result = await resource.load();
      const data = JSON.parse((result as any).text);

      expect(data.features.projects).toBe(true);
    });

    it('should test features that fail', async () => {
      mockClient.getProjects.mockRejectedValue(new Error('Feature not available'));
      resourceManager.register(mockServer, getClientFn);

      const addResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://info'
      );
      if (!addResourceCall) throw new Error('Resource call not found');
      const resource = addResourceCall[0];
      const result = await resource.load();
      const data = JSON.parse((result as any).text);

      expect(data.features.projects).toBe(false);
    });
  });

  describe('Factory Functions', () => {
    it('should create resource manager with factory function', () => {
      const manager = createResourceManager();
      expect(manager).toBeInstanceOf(ResourceManager);
    });

    it('should create resource manager with config via factory', () => {
      const config = { maxItems: 50 };
      const manager = createResourceManager(config);
      expect(manager).toBeInstanceOf(ResourceManager);
    });
  });

  describe('Environment Configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should parse default configuration from empty environment', () => {
      const config = parseResourceConfigFromEnv();
      expect(config.enableWorkflows).toBe(true);
      expect(config.enableExecutions).toBe(true);
      expect(config.enableCredentials).toBe(false);
      expect(config.enableNodes).toBe(true);
    });

    it('should parse configuration from environment variables', () => {
      process.env[RESOURCE_ENV_CONFIG.BASE_URI] = 'custom://n8n';
      process.env[RESOURCE_ENV_CONFIG.ENABLE_WORKFLOWS] = 'false';
      process.env[RESOURCE_ENV_CONFIG.ENABLE_CREDENTIALS] = 'true';
      process.env[RESOURCE_ENV_CONFIG.CACHE_DURATION] = '10000';
      process.env[RESOURCE_ENV_CONFIG.MAX_ITEMS] = '200';

      const config = parseResourceConfigFromEnv();

      expect(config.baseUri).toBe('custom://n8n');
      expect(config.enableWorkflows).toBe(false);
      expect(config.enableCredentials).toBe(true);
      expect(config.globalCacheDuration).toBe(10000);
      expect(config.maxItems).toBe(200);
    });

    it('should handle invalid numeric environment variables', () => {
      process.env[RESOURCE_ENV_CONFIG.CACHE_DURATION] = 'invalid';
      process.env[RESOURCE_ENV_CONFIG.MAX_ITEMS] = 'not-a-number';

      const config = parseResourceConfigFromEnv();

      expect(config.globalCacheDuration).toBeNaN();
      expect(config.maxItems).toBeNaN();
    });

    it('should validate environment variable constants', () => {
      expect(RESOURCE_ENV_CONFIG.BASE_URI).toBe('N8N_MCP_RESOURCE_BASE_URI');
      expect(RESOURCE_ENV_CONFIG.ENABLE_WORKFLOWS).toBe('N8N_MCP_ENABLE_WORKFLOW_RESOURCES');
      expect(RESOURCE_ENV_CONFIG.ENABLE_EXECUTIONS).toBe('N8N_MCP_ENABLE_EXECUTION_RESOURCES');
      expect(RESOURCE_ENV_CONFIG.ENABLE_CREDENTIALS).toBe('N8N_MCP_ENABLE_CREDENTIAL_RESOURCES');
      expect(RESOURCE_ENV_CONFIG.ENABLE_NODES).toBe('N8N_MCP_ENABLE_NODE_RESOURCES');
      expect(RESOURCE_ENV_CONFIG.CACHE_DURATION).toBe('N8N_MCP_RESOURCE_CACHE_DURATION');
      expect(RESOURCE_ENV_CONFIG.MAX_ITEMS).toBe('N8N_MCP_RESOURCE_MAX_ITEMS');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(() => {
      resourceManager = new ResourceManager();
    });

    it('should handle client function that returns null', async () => {
      const nullClientFn = jest.fn().mockReturnValue(null) as () => N8nClient | null;
      resourceManager.register(mockServer, nullClientFn);

      const addResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://info'
      );
      if (!addResourceCall) throw new Error('Resource call not found');
      const resource = addResourceCall[0];

      await expect(resource.load()).rejects.toThrow(
        'n8n client not initialized. Run init-n8n first.'
      );
    });

    it('should handle undefined values in configuration', () => {
      const config = {
        baseUri: undefined,
        enableWorkflows: undefined,
        globalCacheDuration: undefined,
        maxItems: undefined,
      };

      expect(() => new ResourceManager(config as any)).not.toThrow();
    });

    it('should handle empty string values in node type parameters', async () => {
      resourceManager = new ResourceManager({ enableNodes: true });
      resourceManager.register(mockServer, getClientFn);

      const addTemplateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://nodes/{nodeType}'
      );
      if (!addTemplateCall) throw new Error('Template call not found');
      const template = addTemplateCall[0];
      const result = await template.load({ nodeType: '' });

      expect((result as any).text).toBeDefined();
      const data = JSON.parse((result as any).text);
      expect(data.nodeType).toBe('');
      expect(data.name).toBe('');
    });

    it('should handle special characters in credential type parameters', async () => {
      resourceManager = new ResourceManager({ enableCredentials: true });
      resourceManager.register(mockServer, getClientFn);

      const addTemplateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://credentials/template/{credType}'
      );
      if (!addTemplateCall) throw new Error('Template call not found');
      const template = addTemplateCall[0];
      const result = await template.load({ credType: 'special@chars!type' });

      expect((result as any).text).toBeDefined();
      const data = JSON.parse((result as any).text);
      expect(data.credentialType).toBe('special@chars!type');
    });
  });
});
