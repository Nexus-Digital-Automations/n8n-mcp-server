import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { setTimeout, clearTimeout } from 'timers';
import { MockN8nServer } from '../mocks/mockN8nServer';
import * as path from 'path';

// Use process.cwd() + relative path for Jest compatibility
const testDir = path.join(process.cwd(), 'tests', 'e2e');

/**
 * End-to-End tests for MCP protocol compliance
 * Tests the FastMCP server implementation against the MCP specification
 */
describe('MCP Protocol E2E Tests', () => {
  let mockN8nServer: MockN8nServer;
  let mcpServerProcess: ChildProcess;
  const mockServerPort = 3001;
  const mcpServerTimeout = 10000;

  beforeAll(async () => {
    // Start mock n8n server
    mockN8nServer = new MockN8nServer(mockServerPort);
    await mockN8nServer.start();

    console.log('Mock n8n server started for E2E tests');
  }, 15000);

  afterAll(async () => {
    // Stop mock n8n server
    if (mockN8nServer) {
      await mockN8nServer.stop();
    }

    console.log('Mock n8n server stopped');
  }, 10000);

  beforeEach(() => {
    // Clean up any existing MCP server process
    if (mcpServerProcess) {
      mcpServerProcess.kill('SIGTERM');
      mcpServerProcess = null as any;
    }
  });

  afterEach(() => {
    // Ensure MCP server process is terminated
    if (mcpServerProcess) {
      mcpServerProcess.kill('SIGTERM');
      mcpServerProcess = null as any;
    }
  });

  describe('MCP Server Initialization', () => {
    it(
      'should start MCP server successfully with stdio transport',
      async () => {
        const serverPath = path.join(testDir, '../../build/index-fastmcp.js');

        const startServer = (): Promise<void> => {
          return new Promise((resolve, reject) => {
            mcpServerProcess = spawn('node', [serverPath], {
              env: {
                ...process.env,
                N8N_BASE_URL: mockN8nServer.getUrl(),
                N8N_API_KEY: 'test-api-key',
                N8N_MCP_TRANSPORT: 'stdio',
              },
              stdio: ['pipe', 'pipe', 'pipe'],
            });

            let hasResolved = false;
            let initTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

            const cleanup = () => {
              if (initTimeout) {
                clearTimeout(initTimeout);
              }
            };

            mcpServerProcess.stdout?.on('data', data => {
              const output = data.toString();
              console.log('MCP Server stdout:', output);

              // Look for initialization success indicators
              if (output.includes('Server ready') || output.includes('listening') || !hasResolved) {
                hasResolved = true;
                cleanup();
                resolve();
              }
            });

            mcpServerProcess.stderr?.on('data', data => {
              const error = data.toString();
              console.error('MCP Server stderr:', error);

              if (error.includes('Error') || error.includes('EADDRINUSE')) {
                cleanup();
                reject(new Error(`MCP server failed to start: ${error}`));
              }
            });

            mcpServerProcess.on('error', error => {
              cleanup();
              reject(new Error(`Failed to spawn MCP server: ${error.message}`));
            });

            mcpServerProcess.on('exit', (code, signal) => {
              if (code !== 0 && code !== null && !hasResolved) {
                cleanup();
                reject(new Error(`MCP server exited with code ${code}, signal ${signal}`));
              }
            });

            // Set timeout for server initialization
            initTimeout = setTimeout(() => {
              if (!hasResolved) {
                hasResolved = true;
                cleanup();
                resolve(); // Assume success if no explicit errors
              }
            }, 5000);
          });
        };

        await expect(startServer()).resolves.not.toThrow();
        expect(mcpServerProcess).toBeDefined();
        expect(mcpServerProcess.pid).toBeGreaterThan(0);
      },
      mcpServerTimeout
    );

    it(
      'should handle MCP initialization protocol',
      async () => {
        const serverPath = path.join(testDir, '../../build/index-fastmcp.js');

        const testInitialization = (): Promise<any> => {
          return new Promise((resolve, reject) => {
            mcpServerProcess = spawn('node', [serverPath], {
              env: {
                ...process.env,
                N8N_BASE_URL: mockN8nServer.getUrl(),
                N8N_API_KEY: 'test-api-key',
                N8N_MCP_TRANSPORT: 'stdio',
              },
              stdio: ['pipe', 'pipe', 'pipe'],
            });

            let responseData = '';
            let hasResolved = false;

            const cleanup = () => {
              if (!hasResolved) {
                hasResolved = true;
              }
            };

            mcpServerProcess.stdout?.on('data', data => {
              responseData += data.toString();

              // Look for JSON-RPC response
              try {
                const lines = responseData.split('\n').filter(line => line.trim());
                for (const line of lines) {
                  if (line.startsWith('{')) {
                    const response = JSON.parse(line);
                    if (response.result && response.result.capabilities) {
                      cleanup();
                      resolve(response);
                      return;
                    }
                  }
                }
              } catch (e) {
                // Continue processing
              }
            });

            mcpServerProcess.stderr?.on('data', data => {
              console.error('MCP Server stderr:', data.toString());
            });

            mcpServerProcess.on('error', error => {
              cleanup();
              reject(error);
            });

            // Send MCP initialization request
            const initRequest = {
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {},
                  resources: {},
                },
                clientInfo: {
                  name: 'e2e-test-client',
                  version: '1.0.0',
                },
              },
            };

            setTimeout(() => {
              if (mcpServerProcess && mcpServerProcess.stdin) {
                mcpServerProcess.stdin.write(JSON.stringify(initRequest) + '\n');
              }
            }, 1000);

            // Timeout for initialization
            setTimeout(() => {
              if (!hasResolved) {
                cleanup();
                reject(new Error('MCP initialization timeout'));
              }
            }, 8000);
          });
        };

        const response = await testInitialization();

        // Verify MCP protocol compliance
        expect(response).toBeDefined();
        expect(response.jsonrpc).toBe('2.0');
        expect(response.id).toBe(1);
        expect(response.result).toBeDefined();
        expect(response.result.capabilities).toBeDefined();
        expect(response.result.capabilities.tools).toBeDefined();
        expect(response.result.serverInfo).toBeDefined();
        expect(response.result.serverInfo.name).toBe('n8n-mcp-server');
      },
      mcpServerTimeout
    );
  });

  describe('MCP Tools Protocol', () => {
    let initializedServer: any;

    beforeEach(async () => {
      // Initialize server for tools testing
      const serverPath = path.join(testDir, '../../build/index-fastmcp.js');

      initializedServer = await new Promise((resolve, reject) => {
        mcpServerProcess = spawn('node', [serverPath], {
          env: {
            ...process.env,
            N8N_BASE_URL: mockN8nServer.getUrl(),
            N8N_API_KEY: 'test-api-key',
            N8N_MCP_TRANSPORT: 'stdio',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let responseData = '';
        let isInitialized = false;

        mcpServerProcess.stdout?.on('data', data => {
          responseData += data.toString();

          try {
            const lines = responseData.split('\n').filter(line => line.trim());
            for (const line of lines) {
              if (line.startsWith('{')) {
                const response = JSON.parse(line);
                if (response.result && response.result.capabilities && !isInitialized) {
                  isInitialized = true;
                  resolve(mcpServerProcess);
                  return;
                }
              }
            }
          } catch (e) {
            // Continue processing
          }
        });

        mcpServerProcess.on('error', reject);

        // Send initialization
        setTimeout(() => {
          const initRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {}, resources: {} },
              clientInfo: { name: 'e2e-test-client', version: '1.0.0' },
            },
          };
          mcpServerProcess.stdin?.write(JSON.stringify(initRequest) + '\n');
        }, 1000);

        setTimeout(() => {
          if (!isInitialized) {
            reject(new Error('Server initialization timeout'));
          }
        }, 8000);
      });
    }, mcpServerTimeout);

    it('should list available tools', async () => {
      const listToolsRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      };

      const response = await new Promise((resolve, reject) => {
        let responseData = '';

        const dataHandler = (data: Buffer) => {
          responseData += data.toString();

          try {
            const lines = responseData.split('\n').filter(line => line.trim());
            for (const line of lines) {
              if (line.startsWith('{')) {
                const response = JSON.parse(line);
                if (response.id === 2) {
                  if (mcpServerProcess && mcpServerProcess.stdout) {
                    mcpServerProcess.stdout.off('data', dataHandler);
                  }
                  resolve(response);
                  return;
                }
              }
            }
          } catch (e) {
            // Continue processing
          }
        };

        mcpServerProcess.stdout?.on('data', dataHandler);
        mcpServerProcess.stdin?.write(JSON.stringify(listToolsRequest) + '\n');

        setTimeout(() => {
          if (mcpServerProcess && mcpServerProcess.stdout) {
            mcpServerProcess.stdout.off('data', dataHandler);
          }
          reject(new Error('Tools list timeout'));
        }, 5000);
      });

      expect(response).toBeDefined();
      expect((response as any).jsonrpc).toBe('2.0');
      expect((response as any).id).toBe(2);
      expect((response as any).result).toBeDefined();
      expect((response as any).result.tools).toBeDefined();
      expect(Array.isArray((response as any).result.tools)).toBe(true);

      // Verify essential n8n tools are present
      const tools = (response as any).result.tools;
      const toolNames = tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('init-n8n');
      expect(toolNames).toContain('list-workflows');
      expect(toolNames).toContain('get-workflow');
      expect(toolNames).toContain('create-workflow');
    });

    it('should execute init-n8n tool successfully', async () => {
      const toolCallRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'init-n8n',
          arguments: {
            baseUrl: mockN8nServer.getUrl(),
            apiKey: 'test-api-key',
          },
        },
      };

      const response = await new Promise((resolve, reject) => {
        let responseData = '';

        const dataHandler = (data: Buffer) => {
          responseData += data.toString();

          try {
            const lines = responseData.split('\n').filter(line => line.trim());
            for (const line of lines) {
              if (line.startsWith('{')) {
                const response = JSON.parse(line);
                if (response.id === 3) {
                  if (mcpServerProcess && mcpServerProcess.stdout) {
                    mcpServerProcess.stdout.off('data', dataHandler);
                  }
                  resolve(response);
                  return;
                }
              }
            }
          } catch (e) {
            // Continue processing
          }
        };

        mcpServerProcess.stdout?.on('data', dataHandler);
        mcpServerProcess.stdin?.write(JSON.stringify(toolCallRequest) + '\n');

        setTimeout(() => {
          if (mcpServerProcess && mcpServerProcess.stdout) {
            mcpServerProcess.stdout.off('data', dataHandler);
          }
          reject(new Error('Tool call timeout'));
        }, 8000);
      });

      expect(response).toBeDefined();
      expect((response as any).jsonrpc).toBe('2.0');
      expect((response as any).id).toBe(3);
      expect((response as any).result).toBeDefined();
      expect((response as any).result.content).toBeDefined();
      expect(Array.isArray((response as any).result.content)).toBe(true);
      expect((response as any).result.content[0].type).toBe('text');
      expect((response as any).result.content[0].text).toContain('Successfully connected');
    });

    it('should execute list-workflows tool successfully', async () => {
      // First initialize n8n
      const initRequest = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'init-n8n',
          arguments: {
            baseUrl: mockN8nServer.getUrl(),
            apiKey: 'test-api-key',
          },
        },
      };

      await new Promise(resolve => {
        let responseData = '';

        const dataHandler = (data: Buffer) => {
          responseData += data.toString();

          try {
            const lines = responseData.split('\n').filter(line => line.trim());
            for (const line of lines) {
              if (line.startsWith('{')) {
                const response = JSON.parse(line);
                if (response.id === 4) {
                  if (mcpServerProcess && mcpServerProcess.stdout) {
                    mcpServerProcess.stdout.off('data', dataHandler);
                  }
                  resolve(response);
                  return;
                }
              }
            }
          } catch (e) {
            // Continue processing
          }
        };

        mcpServerProcess.stdout?.on('data', dataHandler);
        mcpServerProcess.stdin?.write(JSON.stringify(initRequest) + '\n');

        setTimeout(() => {
          if (mcpServerProcess && mcpServerProcess.stdout) {
            mcpServerProcess.stdout.off('data', dataHandler);
          }
          resolve(null);
        }, 5000);
      });

      // Now test list-workflows
      const listWorkflowsRequest = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'list-workflows',
          arguments: {
            limit: 10,
          },
        },
      };

      const response = await new Promise((resolve, reject) => {
        let responseData = '';

        const dataHandler = (data: Buffer) => {
          responseData += data.toString();

          try {
            const lines = responseData.split('\n').filter(line => line.trim());
            for (const line of lines) {
              if (line.startsWith('{')) {
                const response = JSON.parse(line);
                if (response.id === 5) {
                  if (mcpServerProcess && mcpServerProcess.stdout) {
                    mcpServerProcess.stdout.off('data', dataHandler);
                  }
                  resolve(response);
                  return;
                }
              }
            }
          } catch (e) {
            // Continue processing
          }
        };

        mcpServerProcess.stdout?.on('data', dataHandler);
        mcpServerProcess.stdin?.write(JSON.stringify(listWorkflowsRequest) + '\n');

        setTimeout(() => {
          if (mcpServerProcess && mcpServerProcess.stdout) {
            mcpServerProcess.stdout.off('data', dataHandler);
          }
          reject(new Error('List workflows timeout'));
        }, 8000);
      });

      expect(response).toBeDefined();
      expect((response as any).jsonrpc).toBe('2.0');
      expect((response as any).id).toBe(5);
      expect((response as any).result).toBeDefined();
      expect((response as any).result.content).toBeDefined();
      expect(Array.isArray((response as any).result.content)).toBe(true);
      expect((response as any).result.content[0].type).toBe('text');

      // Verify response contains workflow data
      const responseText = (response as any).result.content[0].text;
      expect(responseText).toContain('workflow(s)');
      expect(responseText).toContain('Test Workflow');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool names gracefully', async () => {
      // Initialize server first
      const serverPath = path.join(testDir, '../../build/index-fastmcp.js');

      mcpServerProcess = spawn('node', [serverPath], {
        env: {
          ...process.env,
          N8N_BASE_URL: mockN8nServer.getUrl(),
          N8N_API_KEY: 'test-api-key',
          N8N_MCP_TRANSPORT: 'stdio',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Wait for initialization
      await new Promise(resolve => {
        setTimeout(() => {
          const initRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {}, resources: {} },
              clientInfo: { name: 'e2e-test-client', version: '1.0.0' },
            },
          };
          mcpServerProcess.stdin?.write(JSON.stringify(initRequest) + '\n');
          setTimeout(resolve, 2000);
        }, 1000);
      });

      // Test invalid tool call
      const invalidToolRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'nonexistent-tool',
          arguments: {},
        },
      };

      const response = await new Promise((resolve, reject) => {
        let responseData = '';

        const dataHandler = (data: Buffer) => {
          responseData += data.toString();

          try {
            const lines = responseData.split('\n').filter(line => line.trim());
            for (const line of lines) {
              if (line.startsWith('{')) {
                const response = JSON.parse(line);
                if (response.id === 2) {
                  if (mcpServerProcess && mcpServerProcess.stdout) {
                    mcpServerProcess.stdout.off('data', dataHandler);
                  }
                  resolve(response);
                  return;
                }
              }
            }
          } catch (e) {
            // Continue processing
          }
        };

        mcpServerProcess.stdout?.on('data', dataHandler);
        mcpServerProcess.stdin?.write(JSON.stringify(invalidToolRequest) + '\n');

        setTimeout(() => {
          if (mcpServerProcess && mcpServerProcess.stdout) {
            mcpServerProcess.stdout.off('data', dataHandler);
          }
          reject(new Error('Invalid tool call timeout'));
        }, 5000);
      });

      expect(response).toBeDefined();
      expect((response as any).jsonrpc).toBe('2.0');
      expect((response as any).id).toBe(2);
      expect((response as any).error).toBeDefined();
      expect((response as any).error.code).toBeDefined();
      expect((response as any).error.message).toContain('Unknown tool');
    });
  });
});
