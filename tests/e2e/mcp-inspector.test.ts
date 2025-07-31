import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { setTimeout, clearTimeout } from 'timers';
import { MockN8nServer } from '../mocks/mockN8nServer';
import * as path from 'path';

// Use process.cwd() + relative path for Jest compatibility
const testDir = path.join(process.cwd(), 'tests', 'e2e');

/**
 * MCP Inspector integration tests
 * Tests the FastMCP server using MCP Inspector tool for protocol validation
 */
describe('MCP Inspector Integration Tests', () => {
  let mockN8nServer: MockN8nServer;
  let mcpServerProcess: ChildProcess;
  const mockServerPort = 3002;
  const testTimeout = 15000;

  beforeAll(async () => {
    // Start mock n8n server for inspector tests
    mockN8nServer = new MockN8nServer(mockServerPort);
    await mockN8nServer.start();

    console.log('Mock n8n server started for MCP Inspector tests');
  }, 20000);

  afterAll(async () => {
    // Clean up mock server
    if (mockN8nServer) {
      await mockN8nServer.stop();
    }

    // Clean up MCP server process
    if (mcpServerProcess) {
      mcpServerProcess.kill('SIGTERM');
    }

    console.log('MCP Inspector test cleanup completed');
  }, 10000);

  describe('Protocol Compliance via Inspector', () => {
    it(
      'should pass MCP Inspector protocol validation',
      async () => {
        const serverPath = path.join(testDir, '../../build/index-fastmcp.js');

        const runInspectorValidation = (): Promise<string> => {
          return new Promise((resolve, reject) => {
            // Start the MCP server
            mcpServerProcess = spawn('node', [serverPath], {
              env: {
                ...process.env,
                N8N_BASE_URL: mockN8nServer.getUrl(),
                N8N_API_KEY: 'test-api-key',
                N8N_MCP_TRANSPORT: 'stdio',
              },
              stdio: ['pipe', 'pipe', 'pipe'],
            });

            let outputBuffer = '';
            let errorBuffer = '';
            let inspectorTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

            const cleanup = () => {
              if (inspectorTimeout) {
                clearTimeout(inspectorTimeout);
              }
            };

            mcpServerProcess.stdout?.on('data', data => {
              outputBuffer += data.toString();
            });

            mcpServerProcess.stderr?.on('data', data => {
              errorBuffer += data.toString();
            });

            mcpServerProcess.on('error', error => {
              cleanup();
              reject(new Error(`Failed to start MCP server: ${error.message}`));
            });

            // Simulate MCP Inspector protocol validation sequence
            const performInspectorChecks = async () => {
              try {
                // Wait for server to be ready
                await new Promise(resolve => {
                  setTimeout(resolve, 2000);
                });

                // 1. Test initialization protocol
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
                      name: 'mcp-inspector',
                      version: '1.0.0',
                    },
                  },
                };

                mcpServerProcess.stdin?.write(JSON.stringify(initRequest) + '\n');

                // Wait for init response
                await new Promise(resolve => {
                  setTimeout(resolve, 1000);
                });

                // 2. Test tools/list protocol
                const toolsListRequest = {
                  jsonrpc: '2.0',
                  id: 2,
                  method: 'tools/list',
                  params: {},
                };

                mcpServerProcess.stdin?.write(JSON.stringify(toolsListRequest) + '\n');

                // Wait for tools response
                await new Promise(resolve => {
                  setTimeout(resolve, 1000);
                });

                // 3. Test a tool call
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

                mcpServerProcess.stdin?.write(JSON.stringify(toolCallRequest) + '\n');

                // Wait for tool call response
                await new Promise(resolve => {
                  setTimeout(resolve, 2000);
                });

                cleanup();
                resolve(outputBuffer);
              } catch (error) {
                cleanup();
                reject(error);
              }
            };

            // Set timeout for inspector validation
            inspectorTimeout = setTimeout(() => {
              cleanup();
              reject(new Error('MCP Inspector validation timeout'));
            }, testTimeout - 2000);

            // Start inspector checks after brief delay
            setTimeout(performInspectorChecks, 500);
          });
        };

        const inspectorOutput = await runInspectorValidation();

        // Verify inspector found valid MCP protocol responses
        expect(inspectorOutput).toBeDefined();
        expect(inspectorOutput.length).toBeGreaterThan(0);

        // Check for JSON-RPC responses in output
        const lines = inspectorOutput.split('\n').filter(line => line.trim());
        const jsonResponses = lines.filter(line => {
          try {
            const parsed = JSON.parse(line);
            return parsed.jsonrpc === '2.0' && (parsed.result || parsed.error);
          } catch {
            return false;
          }
        });

        expect(jsonResponses.length).toBeGreaterThan(0);

        // Verify initialization response
        const initResponse = jsonResponses.find(line => {
          try {
            const parsed = JSON.parse(line);
            return parsed.id === 1 && parsed.result?.capabilities;
          } catch {
            return false;
          }
        });

        expect(initResponse).toBeDefined();

        // Verify tools list response
        const toolsResponse = jsonResponses.find(line => {
          try {
            const parsed = JSON.parse(line);
            return parsed.id === 2 && parsed.result?.tools;
          } catch {
            return false;
          }
        });

        expect(toolsResponse).toBeDefined();
      },
      testTimeout
    );

    it(
      'should handle MCP Inspector error scenarios',
      async () => {
        const serverPath = path.join(testDir, '../../build/index-fastmcp.js');

        const testErrorHandling = (): Promise<string> => {
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

            let outputBuffer = '';
            let errorTestTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

            const cleanup = () => {
              if (errorTestTimeout) {
                clearTimeout(errorTestTimeout);
              }
            };

            mcpServerProcess.stdout?.on('data', data => {
              outputBuffer += data.toString();
            });

            mcpServerProcess.on('error', error => {
              cleanup();
              reject(error);
            });

            const testErrorScenarios = async () => {
              try {
                // Wait for server startup
                await new Promise(resolve => {
                  setTimeout(resolve, 2000);
                });

                // Initialize first
                const initRequest = {
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'initialize',
                  params: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'mcp-inspector', version: '1.0.0' },
                  },
                };

                mcpServerProcess.stdin?.write(JSON.stringify(initRequest) + '\n');
                await new Promise(resolve => {
                  setTimeout(resolve, 1000);
                });

                // Test invalid method
                const invalidMethodRequest = {
                  jsonrpc: '2.0',
                  id: 2,
                  method: 'invalid/method',
                  params: {},
                };

                mcpServerProcess.stdin?.write(JSON.stringify(invalidMethodRequest) + '\n');
                await new Promise(resolve => {
                  setTimeout(resolve, 1000);
                });

                // Test invalid tool call
                const invalidToolRequest = {
                  jsonrpc: '2.0',
                  id: 3,
                  method: 'tools/call',
                  params: {
                    name: 'nonexistent-tool',
                    arguments: {},
                  },
                };

                mcpServerProcess.stdin?.write(JSON.stringify(invalidToolRequest) + '\n');
                await new Promise(resolve => {
                  setTimeout(resolve, 1000);
                });

                cleanup();
                resolve(outputBuffer);
              } catch (error) {
                cleanup();
                reject(error);
              }
            };

            errorTestTimeout = setTimeout(() => {
              cleanup();
              reject(new Error('Error handling test timeout'));
            }, testTimeout - 2000);

            setTimeout(testErrorScenarios, 500);
          });
        };

        const errorOutput = await testErrorHandling();

        // Verify error responses are properly formatted
        const lines = errorOutput.split('\n').filter(line => line.trim());
        const errorResponses = lines.filter(line => {
          try {
            const parsed = JSON.parse(line);
            return parsed.jsonrpc === '2.0' && parsed.error;
          } catch {
            return false;
          }
        });

        expect(errorResponses.length).toBeGreaterThan(0);

        // Verify error responses have proper structure
        errorResponses.forEach(responseStr => {
          const response = JSON.parse(responseStr);
          expect(response.jsonrpc).toBe('2.0');
          expect(response.error).toBeDefined();
          expect(response.error.code).toBeDefined();
          expect(response.error.message).toBeDefined();
          expect(typeof response.error.code).toBe('number');
          expect(typeof response.error.message).toBe('string');
        });
      },
      testTimeout
    );
  });

  describe('Performance and Reliability', () => {
    it(
      'should handle rapid sequential requests',
      async () => {
        const serverPath = path.join(testDir, '../../build/index-fastmcp.js');

        const testRapidRequests = (): Promise<string> => {
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

            let outputBuffer = '';
            let rapidTestTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

            const cleanup = () => {
              if (rapidTestTimeout) {
                clearTimeout(rapidTestTimeout);
              }
            };

            mcpServerProcess.stdout?.on('data', data => {
              outputBuffer += data.toString();
            });

            mcpServerProcess.on('error', error => {
              cleanup();
              reject(error);
            });

            const performRapidRequests = async () => {
              try {
                // Initialize server
                await new Promise(resolve => {
                  setTimeout(resolve, 2000);
                });

                const initRequest = {
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'initialize',
                  params: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'mcp-inspector', version: '1.0.0' },
                  },
                };

                mcpServerProcess.stdin?.write(JSON.stringify(initRequest) + '\n');
                await new Promise(resolve => {
                  setTimeout(resolve, 1000);
                });

                // Send rapid sequential tool list requests
                for (let i = 2; i <= 11; i++) {
                  const toolsListRequest = {
                    jsonrpc: '2.0',
                    id: i,
                    method: 'tools/list',
                    params: {},
                  };
                  mcpServerProcess.stdin?.write(JSON.stringify(toolsListRequest) + '\n');
                }

                // Wait for all responses
                await new Promise(resolve => {
                  setTimeout(resolve, 3000);
                });

                cleanup();
                resolve(outputBuffer);
              } catch (error) {
                cleanup();
                reject(error);
              }
            };

            rapidTestTimeout = setTimeout(() => {
              cleanup();
              reject(new Error('Rapid requests test timeout'));
            }, testTimeout - 1000);

            setTimeout(performRapidRequests, 500);
          });
        };

        const rapidOutput = await testRapidRequests();

        // Count successful responses
        const lines = rapidOutput.split('\n').filter(line => line.trim());
        const responses = lines.filter(line => {
          try {
            const parsed = JSON.parse(line);
            return parsed.jsonrpc === '2.0' && (parsed.result || parsed.error);
          } catch {
            return false;
          }
        });

        // Should handle at least the init + 10 tools/list requests
        expect(responses.length).toBeGreaterThanOrEqual(11);

        // Verify all tool list responses have proper structure
        const toolsResponses = responses.filter(line => {
          try {
            const parsed = JSON.parse(line);
            return parsed.result?.tools && Array.isArray(parsed.result.tools);
          } catch {
            return false;
          }
        });

        expect(toolsResponses.length).toBeGreaterThanOrEqual(10);
      },
      testTimeout
    );
  });
});
