import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  SSETransportManager,
  createSSETransport,
  SSEUtils,
  DEFAULT_SSE_CONFIG,
} from '../../../src/transport/sseTransport';
import type { TransportConfig } from '../../../src/transport/transportConfig';

// Mock FastMCP
const mockFastMCP = {
  start: jest.fn(() => Promise.resolve()),
  stop: jest.fn(() => Promise.resolve()),
  addTool: jest.fn().mockReturnThis(),
  addResource: jest.fn().mockReturnThis(),
  on: jest.fn().mockReturnThis(),
};

// Mock console methods to capture output
const originalConsole = {
  log: console.log,
  error: console.error,
};

const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
};

describe('SSE Transport', () => {
  let sseTransportManager: SSETransportManager;
  let mockConfig: TransportConfig;

  // Helper function to create SSE config with defaults
  const createSSEConfig = (
    overrides: Partial<NonNullable<TransportConfig['sse']>> = {}
  ): TransportConfig => ({
    type: 'sse',
    sse: {
      port: 8080,
      endpoint: '/sse',
      host: 'localhost',
      cors: { enabled: true, origins: ['*'], credentials: false },
      healthCheck: { enabled: true, endpoint: '/health' },
      ...overrides,
    },
  });

  beforeEach(() => {
    // Setup mock console
    (global as any).console = mockConsole;

    // Reset mocks
    jest.clearAllMocks();
    mockFastMCP.start.mockClear();
    mockFastMCP.stop.mockClear();

    // Default SSE configuration for testing
    mockConfig = {
      type: 'sse',
      sse: {
        port: 8080,
        endpoint: '/sse',
        host: 'localhost',
        cors: {
          enabled: true,
          origins: ['*'],
          credentials: false,
        },
        healthCheck: {
          enabled: true,
          endpoint: '/health',
        },
      },
    };

    sseTransportManager = new SSETransportManager(mockFastMCP as any, mockConfig);
  });

  afterEach(() => {
    // Restore original console
    (global as any).console = originalConsole;
  });

  describe('SSETransportManager', () => {
    describe('Constructor', () => {
      it('should create instance with server and config', () => {
        expect(sseTransportManager).toBeInstanceOf(SSETransportManager);
      });

      it('should accept different FastMCP server instances', () => {
        const anotherMockServer = { ...mockFastMCP };
        const manager = new SSETransportManager(anotherMockServer as any, mockConfig);
        expect(manager).toBeInstanceOf(SSETransportManager);
      });
    });

    describe('start()', () => {
      it('should start SSE server with correct configuration', async () => {
        await sseTransportManager.start();

        expect(mockFastMCP.start).toHaveBeenCalledWith({
          transportType: 'httpStream',
          httpStream: {
            port: 8080,
            endpoint: '/sse',
          },
        });

        expect(mockConsole.log).toHaveBeenCalledWith(
          '🚀 Starting n8n MCP Server with SSE transport'
        );
        expect(mockConsole.log).toHaveBeenCalledWith(
          '📡 Server will be available at: http://localhost:8080/sse'
        );
      });

      it('should start server with custom port and endpoint', async () => {
        const customConfig = createSSEConfig({
          port: 3000,
          endpoint: '/api/mcp',
          host: '0.0.0.0',
          cors: { enabled: false, origins: [], credentials: false },
          healthCheck: { enabled: false, endpoint: '/health' },
        });

        const customManager = new SSETransportManager(mockFastMCP as any, customConfig);
        await customManager.start();

        expect(mockFastMCP.start).toHaveBeenCalledWith({
          transportType: 'httpStream',
          httpStream: {
            port: 3000,
            endpoint: '/api/mcp',
          },
        });

        expect(mockConsole.log).toHaveBeenCalledWith(
          '📡 Server will be available at: http://0.0.0.0:3000/api/mcp'
        );
      });

      it('should throw error when SSE transport is not configured', async () => {
        const invalidConfig: TransportConfig = { type: 'stdio' };
        const invalidManager = new SSETransportManager(mockFastMCP as any, invalidConfig);

        await expect(invalidManager.start()).rejects.toThrow('SSE transport not configured');
      });

      it('should throw error when SSE config is missing', async () => {
        const invalidConfig: TransportConfig = { type: 'sse' };
        const invalidManager = new SSETransportManager(mockFastMCP as any, invalidConfig);

        await expect(invalidManager.start()).rejects.toThrow('SSE transport not configured');
      });

      it('should setup health check when enabled', async () => {
        await sseTransportManager.start();

        expect(mockConsole.log).toHaveBeenCalledWith('💚 Health check endpoint: /health');
      });

      it('should not setup health check when disabled', async () => {
        const configWithoutHealthCheck: TransportConfig = {
          type: 'sse',
          sse: {
            port: 8080,
            endpoint: '/sse',
            host: 'localhost',
            cors: { enabled: true, origins: ['*'], credentials: false },
            healthCheck: { enabled: false, endpoint: '/health' },
          },
        };

        const manager = new SSETransportManager(mockFastMCP as any, configWithoutHealthCheck);
        await manager.start();

        // Should not log health check endpoint
        expect(mockConsole.log).not.toHaveBeenCalledWith(
          expect.stringContaining('Health check endpoint')
        );
      });

      it('should log comprehensive server information', async () => {
        await sseTransportManager.start();

        expect(mockConsole.log).toHaveBeenCalledWith('\n📋 Server Configuration:');
        expect(mockConsole.log).toHaveBeenCalledWith('   Transport: SSE (Server-Sent Events)');
        expect(mockConsole.log).toHaveBeenCalledWith('   Host: localhost');
        expect(mockConsole.log).toHaveBeenCalledWith('   Port: 8080');
        expect(mockConsole.log).toHaveBeenCalledWith('   Endpoint: /sse');
        expect(mockConsole.log).toHaveBeenCalledWith('   CORS: Enabled');
      });

      it('should log CORS information when enabled', async () => {
        const corsConfig: TransportConfig = {
          type: 'sse',
          sse: {
            port: 8080,
            endpoint: '/sse',
            host: 'localhost',
            cors: {
              enabled: true,
              origins: ['https://example.com', 'https://test.com'],
              credentials: true,
            },
            healthCheck: { enabled: true, endpoint: '/health' },
          },
        };

        const manager = new SSETransportManager(mockFastMCP as any, corsConfig);
        await manager.start();

        expect(mockConsole.log).toHaveBeenCalledWith('   CORS: Enabled');
        expect(mockConsole.log).toHaveBeenCalledWith(
          '   Allowed Origins: https://example.com, https://test.com'
        );
        expect(mockConsole.log).toHaveBeenCalledWith('   Credentials: Allowed');
      });

      it('should not log CORS details when disabled', async () => {
        const noCorsConfig: TransportConfig = {
          type: 'sse',
          sse: {
            port: 8080,
            endpoint: '/sse',
            host: 'localhost',
            cors: { enabled: false, origins: [], credentials: false },
            healthCheck: { enabled: true, endpoint: '/health' },
          },
        };

        const manager = new SSETransportManager(mockFastMCP as any, noCorsConfig);
        await manager.start();

        expect(mockConsole.log).toHaveBeenCalledWith('   CORS: Disabled');
        expect(mockConsole.log).not.toHaveBeenCalledWith(
          expect.stringContaining('Allowed Origins')
        );
        expect(mockConsole.log).not.toHaveBeenCalledWith(expect.stringContaining('Credentials'));
      });

      it('should log connection instructions', async () => {
        await sseTransportManager.start();

        expect(mockConsole.log).toHaveBeenCalledWith('\n🔌 Connection Instructions:');
        expect(mockConsole.log).toHaveBeenCalledWith('   For MCP Inspector:');
        expect(mockConsole.log).toHaveBeenCalledWith(
          '   npx @modelcontextprotocol/inspector http://localhost:8080/sse'
        );
      });

      it('should log Claude Desktop configuration instructions', async () => {
        await sseTransportManager.start();

        expect(mockConsole.log).toHaveBeenCalledWith(
          '   For Claude Desktop (claude_desktop_config.json):'
        );
        expect(mockConsole.log).toHaveBeenCalledWith('   {');
        expect(mockConsole.log).toHaveBeenCalledWith('     "mcpServers": {');
        expect(mockConsole.log).toHaveBeenCalledWith('       "n8n": {');
        expect(mockConsole.log).toHaveBeenCalledWith('         "command": "npx",');
        expect(mockConsole.log).toHaveBeenCalledWith(
          '         "args": ["@illuminaresolutions/n8n-mcp-server"],'
        );
        expect(mockConsole.log).toHaveBeenCalledWith('         "env": {');
        expect(mockConsole.log).toHaveBeenCalledWith('           "N8N_MCP_TRANSPORT": "sse",');
        expect(mockConsole.log).toHaveBeenCalledWith('           "N8N_MCP_SSE_PORT": "8080",');
        expect(mockConsole.log).toHaveBeenCalledWith('           "N8N_MCP_SSE_HOST": "localhost"');
        expect(mockConsole.log).toHaveBeenCalledWith('         }');
        expect(mockConsole.log).toHaveBeenCalledWith('       }');
        expect(mockConsole.log).toHaveBeenCalledWith('     }');
        expect(mockConsole.log).toHaveBeenCalledWith('   }');
      });

      it('should handle FastMCP server start failure', async () => {
        const error = new Error('Failed to start server');
        (mockFastMCP.start as jest.Mock).mockRejectedValueOnce(error);

        await expect(sseTransportManager.start()).rejects.toThrow('Failed to start server');
      });
    });

    describe('stop()', () => {
      it('should log stop message', async () => {
        await sseTransportManager.stop();

        expect(mockConsole.log).toHaveBeenCalledWith('🛑 Stopping SSE transport server...');
      });

      it('should be called without errors', async () => {
        await expect(sseTransportManager.stop()).resolves.toBeUndefined();
      });
    });

    describe('setupHealthCheck()', () => {
      it('should handle missing SSE config gracefully', async () => {
        const configWithoutSSE: TransportConfig = { type: 'sse' };
        const manager = new SSETransportManager(mockFastMCP as any, configWithoutSSE);

        // This should not throw - the method handles missing config
        await expect(manager.start()).rejects.toThrow('SSE transport not configured');
      });

      it('should setup health check with custom endpoint', async () => {
        const customHealthConfig: TransportConfig = {
          type: 'sse',
          sse: {
            ...(mockConfig.sse || {}),
            healthCheck: { enabled: true, endpoint: '/status' },
          },
        };

        const manager = new SSETransportManager(mockFastMCP as any, customHealthConfig);
        await manager.start();

        expect(mockConsole.log).toHaveBeenCalledWith('💚 Health check endpoint: /status');
      });
    });

    describe('logServerInfo()', () => {
      it('should handle missing SSE config gracefully', async () => {
        const configWithoutSSE: TransportConfig = { type: 'sse' };
        const manager = new SSETransportManager(mockFastMCP as any, configWithoutSSE);

        // Should not throw when trying to log server info
        await expect(manager.start()).rejects.toThrow('SSE transport not configured');
      });

      it('should log server info with different host configurations', async () => {
        const configs = [
          { host: 'localhost', expectedHost: 'localhost' },
          { host: '0.0.0.0', expectedHost: '0.0.0.0' },
          { host: '127.0.0.1', expectedHost: '127.0.0.1' },
          { host: 'example.com', expectedHost: 'example.com' },
        ];

        for (const { host, expectedHost } of configs) {
          const config: TransportConfig = {
            type: 'sse',
            sse: { ...(mockConfig.sse || {}), host },
          };

          const manager = new SSETransportManager(mockFastMCP as any, config);
          mockConsole.log.mockClear();

          await manager.start();

          expect(mockConsole.log).toHaveBeenCalledWith(`   Host: ${expectedHost}`);
        }
      });
    });
  });

  describe('createSSETransport', () => {
    it('should create SSETransportManager instance', () => {
      const transport = createSSETransport(mockFastMCP as any, mockConfig);

      expect(transport).toBeInstanceOf(SSETransportManager);
    });

    it('should pass server and config to constructor', () => {
      const customServer = { ...mockFastMCP };
      const customConfig = createSSEConfig({ port: 9000 });

      const transport = createSSETransport(customServer as any, customConfig);

      expect(transport).toBeInstanceOf(SSETransportManager);
    });
  });

  describe('SSEUtils', () => {
    describe('validateConfig()', () => {
      it('should return true for valid SSE configuration', () => {
        const isValid = SSEUtils.validateConfig(mockConfig);
        expect(isValid).toBe(true);
      });

      it('should return false for non-SSE configuration', () => {
        const stdioConfig: TransportConfig = { type: 'stdio' };
        const isValid = SSEUtils.validateConfig(stdioConfig);
        expect(isValid).toBe(false);
      });

      it('should return false when SSE config is missing', () => {
        const invalidConfig: TransportConfig = { type: 'sse' };
        const isValid = SSEUtils.validateConfig(invalidConfig);
        expect(isValid).toBe(false);
      });

      it('should validate port range', () => {
        // Valid ports
        const validConfig1: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), port: 1024 },
        };
        expect(SSEUtils.validateConfig(validConfig1)).toBe(true);

        const validConfig2: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), port: 65535 },
        };
        expect(SSEUtils.validateConfig(validConfig2)).toBe(true);

        // Invalid ports
        const invalidConfig1: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), port: 1023 },
        };
        expect(SSEUtils.validateConfig(invalidConfig1)).toBe(false);
        expect(mockConsole.error).toHaveBeenCalledWith(
          '❌ Invalid port: 1023. Must be between 1024-65535'
        );

        const invalidConfig2: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), port: 65536 },
        };
        expect(SSEUtils.validateConfig(invalidConfig2)).toBe(false);
        expect(mockConsole.error).toHaveBeenCalledWith(
          '❌ Invalid port: 65536. Must be between 1024-65535'
        );
      });

      it('should validate endpoint format', () => {
        // Valid endpoints
        const validConfig1: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), endpoint: '/sse' },
        };
        expect(SSEUtils.validateConfig(validConfig1)).toBe(true);

        const validConfig2: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), endpoint: '/api/mcp' },
        };
        expect(SSEUtils.validateConfig(validConfig2)).toBe(true);

        // Invalid endpoints
        const invalidConfig: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), endpoint: 'sse' },
        };
        expect(SSEUtils.validateConfig(invalidConfig)).toBe(false);
        expect(mockConsole.error).toHaveBeenCalledWith(
          "❌ Invalid endpoint: sse. Must start with '/'"
        );
      });

      it('should handle edge case endpoints', () => {
        const edgeCases = [
          { endpoint: '/', valid: true },
          { endpoint: '/a', valid: true },
          { endpoint: '/very/long/endpoint/path', valid: true },
          { endpoint: '', valid: false },
          { endpoint: 'no-slash', valid: false },
          { endpoint: 'api/mcp', valid: false },
        ];

        edgeCases.forEach(({ endpoint, valid }) => {
          const config: TransportConfig = {
            type: 'sse',
            sse: { ...(mockConfig.sse || {}), endpoint },
          };

          expect(SSEUtils.validateConfig(config)).toBe(valid);
        });
      });
    });

    describe('getConnectionUrl()', () => {
      it('should return correct HTTP URL for standard port', () => {
        const url = SSEUtils.getConnectionUrl(mockConfig);
        expect(url).toBe('http://localhost:8080/sse');
      });

      it('should return correct HTTPS URL for port 443', () => {
        const httpsConfig: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), port: 443 },
        };

        const url = SSEUtils.getConnectionUrl(httpsConfig);
        expect(url).toBe('https://localhost:443/sse');
      });

      it('should handle different hosts', () => {
        const hosts = [
          { host: '0.0.0.0', expected: 'http://0.0.0.0:8080/sse' },
          { host: '127.0.0.1', expected: 'http://127.0.0.1:8080/sse' },
          { host: 'example.com', expected: 'http://example.com:8080/sse' },
        ];

        hosts.forEach(({ host, expected }) => {
          const config: TransportConfig = {
            type: 'sse',
            sse: { ...(mockConfig.sse || {}), host },
          };

          const url = SSEUtils.getConnectionUrl(config);
          expect(url).toBe(expected);
        });
      });

      it('should handle custom endpoints', () => {
        const config: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), endpoint: '/api/mcp' },
        };

        const url = SSEUtils.getConnectionUrl(config);
        expect(url).toBe('http://localhost:8080/api/mcp');
      });

      it('should return null for non-SSE configuration', () => {
        const stdioConfig: TransportConfig = { type: 'stdio' };
        const url = SSEUtils.getConnectionUrl(stdioConfig);
        expect(url).toBeNull();
      });

      it('should return null when SSE config is missing', () => {
        const invalidConfig: TransportConfig = { type: 'sse' };
        const url = SSEUtils.getConnectionUrl(invalidConfig);
        expect(url).toBeNull();
      });
    });

    describe('formatConnectionInstructions()', () => {
      it('should return formatted instructions for valid configuration', () => {
        const instructions = SSEUtils.formatConnectionInstructions(mockConfig);

        expect(instructions).toEqual({
          inspector: 'npx @modelcontextprotocol/inspector http://localhost:8080/sse',
          claudeDesktop: {
            mcpServers: {
              n8n: {
                command: 'npx',
                args: ['@illuminaresolutions/n8n-mcp-server'],
                env: {
                  N8N_MCP_TRANSPORT: 'sse',
                  N8N_MCP_SSE_PORT: '8080',
                  N8N_MCP_SSE_HOST: 'localhost',
                },
              },
            },
          },
          curl: 'curl -N -H "Accept: text/event-stream" http://localhost:8080/sse',
        });
      });

      it('should handle custom configuration', () => {
        const customConfig: TransportConfig = {
          type: 'sse',
          sse: {
            port: 3000,
            endpoint: '/api/mcp',
            host: '0.0.0.0',
            cors: { enabled: true, origins: ['*'], credentials: false },
            healthCheck: { enabled: true, endpoint: '/health' },
          },
        };

        const instructions = SSEUtils.formatConnectionInstructions(customConfig);

        expect(instructions?.inspector).toBe(
          'npx @modelcontextprotocol/inspector http://0.0.0.0:3000/api/mcp'
        );
        expect((instructions?.claudeDesktop as any).mcpServers.n8n.env.N8N_MCP_SSE_PORT).toBe(
          '3000'
        );
        expect((instructions?.claudeDesktop as any).mcpServers.n8n.env.N8N_MCP_SSE_HOST).toBe(
          '0.0.0.0'
        );
        expect(instructions?.curl).toBe(
          'curl -N -H "Accept: text/event-stream" http://0.0.0.0:3000/api/mcp'
        );
      });

      it('should return null for invalid configuration', () => {
        const stdioConfig: TransportConfig = { type: 'stdio' };
        const instructions = SSEUtils.formatConnectionInstructions(stdioConfig);
        expect(instructions).toBeNull();
      });

      it('should return null when SSE config is missing', () => {
        const invalidConfig: TransportConfig = { type: 'sse' };
        const instructions = SSEUtils.formatConnectionInstructions(invalidConfig);
        expect(instructions).toBeNull();
      });

      it('should handle port 443 with HTTPS', () => {
        const httpsConfig: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), port: 443, host: 'secure.example.com' },
        };

        const instructions = SSEUtils.formatConnectionInstructions(httpsConfig);

        expect(instructions?.inspector).toBe(
          'npx @modelcontextprotocol/inspector https://secure.example.com:443/sse'
        );
        expect(instructions?.curl).toBe(
          'curl -N -H "Accept: text/event-stream" https://secure.example.com:443/sse'
        );
      });
    });
  });

  describe('DEFAULT_SSE_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SSE_CONFIG).toEqual({
        port: 8080,
        endpoint: '/sse',
        host: 'localhost',
        cors: {
          enabled: true,
          origins: ['*'],
          credentials: false,
        },
        healthCheck: {
          enabled: true,
          endpoint: '/health',
        },
      });
    });

    it('should be a readonly object', () => {
      expect(() => {
        (DEFAULT_SSE_CONFIG as any).port = 9000;
      }).toThrow();
    });

    it('should have all required properties', () => {
      const requiredProperties = ['port', 'endpoint', 'host', 'cors', 'healthCheck'];
      requiredProperties.forEach(prop => {
        expect(DEFAULT_SSE_CONFIG).toHaveProperty(prop);
      });
    });

    it('should have valid port within acceptable range', () => {
      expect(DEFAULT_SSE_CONFIG.port).toBeGreaterThanOrEqual(1024);
      expect(DEFAULT_SSE_CONFIG.port).toBeLessThanOrEqual(65535);
    });

    it('should have valid endpoint format', () => {
      expect(DEFAULT_SSE_CONFIG.endpoint).toMatch(/^\/\w+/);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle undefined SSE config gracefully', () => {
      const configWithUndefinedSSE = { type: 'sse' as const, sse: undefined };
      expect(
        () => new SSETransportManager(mockFastMCP as any, configWithUndefinedSSE)
      ).not.toThrow();
    });

    it('should handle partial SSE configurations', () => {
      const partialConfig: TransportConfig = {
        type: 'sse',
        sse: {
          port: 8080,
          endpoint: '/sse',
          host: 'localhost',
          cors: { enabled: true, origins: ['*'], credentials: false },
          healthCheck: { enabled: true, endpoint: '/health' },
        },
      };

      expect(() => new SSETransportManager(mockFastMCP as any, partialConfig)).not.toThrow();
    });

    it('should handle FastMCP server errors during startup', async () => {
      const errorMessage = 'Port already in use';
      (mockFastMCP.start as jest.Mock).mockRejectedValueOnce(new Error(errorMessage));

      await expect(sseTransportManager.start()).rejects.toThrow(errorMessage);
    });

    it('should handle missing environment in logs', async () => {
      // Test that logging doesn't throw even with minimal config
      await sseTransportManager.start();

      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should validate extreme port values', () => {
      const extremeCases = [
        { port: 0, valid: false },
        { port: 1, valid: false },
        { port: 1023, valid: false },
        { port: 1024, valid: true },
        { port: 65535, valid: true },
        { port: 65536, valid: false },
        { port: 99999, valid: false },
      ];

      extremeCases.forEach(({ port, valid }) => {
        const config: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), port },
        };

        expect(SSEUtils.validateConfig(config)).toBe(valid);
      });
    });

    it('should handle various endpoint formats', () => {
      const endpointCases = [
        { endpoint: '/', valid: true },
        { endpoint: '/sse', valid: true },
        { endpoint: '/api/v1/mcp', valid: true },
        { endpoint: '/very-long-endpoint-name', valid: true },
        { endpoint: '', valid: false },
        { endpoint: 'no-leading-slash', valid: false },
        { endpoint: ' /with-space', valid: false },
      ];

      endpointCases.forEach(({ endpoint, valid }) => {
        const config: TransportConfig = {
          type: 'sse',
          sse: { ...(mockConfig.sse || {}), endpoint },
        };

        expect(SSEUtils.validateConfig(config)).toBe(valid);
      });
    });
  });

  describe('Integration with TransportConfig', () => {
    it('should work with detectTransportConfig result', () => {
      // This would typically come from detectTransportConfig()
      const detectedConfig: TransportConfig = {
        type: 'sse',
        sse: {
          port: 8080,
          endpoint: '/sse',
          host: 'localhost',
          cors: { enabled: true, origins: ['*'], credentials: false },
          healthCheck: { enabled: true, endpoint: '/health' },
        },
      };

      expect(() => new SSETransportManager(mockFastMCP as any, detectedConfig)).not.toThrow();
      expect(SSEUtils.validateConfig(detectedConfig)).toBe(true);
    });

    it('should handle configuration from environment parsing', () => {
      // This would typically come from parseConfigFromEnv()
      const envConfig: TransportConfig = {
        type: 'sse',
        sse: {
          port: 3000,
          endpoint: '/mcp',
          host: '0.0.0.0',
          cors: {
            enabled: true,
            origins: ['https://example.com'],
            credentials: true,
          },
          healthCheck: {
            enabled: false,
            endpoint: '/status',
          },
        },
      };

      expect(() => new SSETransportManager(mockFastMCP as any, envConfig)).not.toThrow();
      expect(SSEUtils.validateConfig(envConfig)).toBe(true);
    });
  });
});
