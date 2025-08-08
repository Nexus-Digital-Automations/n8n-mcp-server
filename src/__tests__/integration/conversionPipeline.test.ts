import { describe, it, expect, beforeEach } from '@jest/globals';
import { MCPToolParser } from '../../utils/mcpParser.js';
import { N8nNodeGenerator } from '../../utils/nodeGenerator.js';
import { ParameterMapper } from '../../utils/parameterMapper.js';
import {
  mockSimpleTool,
  mockComplexTool,
  mockMCPCapabilities,
  mockConversionConfig,
  mockMCPServer,
  mockN8nExecutionData,
} from '../testData.js';
import { ConversionContext } from '../../types/mcpTypes.js';

describe('MCP-to-n8n Conversion Pipeline Integration', () => {
  let parser: MCPToolParser;
  let generator: N8nNodeGenerator;
  let mapper: ParameterMapper;

  beforeEach(() => {
    parser = new MCPToolParser();
    generator = new N8nNodeGenerator();
    mapper = new ParameterMapper();
  });

  describe('End-to-End Conversion Pipeline', () => {
    it('should convert MCP capabilities to n8n node definitions', () => {
      // Parse MCP capabilities
      const capabilities = parser.parseServerCapabilities(mockMCPCapabilities);
      expect(capabilities.tools).toHaveLength(3);

      // Generate n8n nodes for each tool
      const nodeDefinitions = capabilities.tools.map(tool => {
        const context: ConversionContext = {
          mcpServer: mockMCPServer,
          tool,
          config: mockConversionConfig,
        };
        return generator.generateNodeDefinition(context);
      });

      expect(nodeDefinitions).toHaveLength(3);
      expect(nodeDefinitions.every(def => def.success)).toBe(true);

      // Verify node structure
      nodeDefinitions.forEach(def => {
        expect(def.nodeDefinition).toBeDefined();
        expect(def.nodeDefinition!.displayName).toBeTruthy();
        expect(def.nodeDefinition!.name).toBeTruthy();
        expect(def.nodeDefinition!.properties).toBeDefined();
      });
    });

    it('should handle parameter mapping from n8n to MCP format', () => {
      // Generate node definition
      const context: ConversionContext = {
        mcpServer: mockMCPServer,
        tool: mockSimpleTool,
        config: mockConversionConfig,
      };

      const nodeResult = generator.generateNodeDefinition(context);
      expect(nodeResult.success).toBe(true);

      // Simulate n8n node parameters
      const nodeParameters = {
        message: 'Hello {{ $json.name }}!',
        count: 42,
      };

      // Map to MCP format
      const mcpRequest = mapper.mapN8nParametersToMCP(
        nodeParameters,
        mockN8nExecutionData,
        mockSimpleTool
      );

      expect(mcpRequest.name).toBe('simple_test');
      expect(mcpRequest.arguments.message).toBe('Hello Test Item!');
      expect(mcpRequest.arguments.count).toBe(42);
    });

    it('should handle complex tools with nested objects and arrays', () => {
      // Parse complex tool
      const parsedTool = parser.parseTool(mockComplexTool);
      expect(parsedTool).toEqual(mockComplexTool);

      // Generate node definition
      const context: ConversionContext = {
        mcpServer: mockMCPServer,
        tool: parsedTool,
        config: mockConversionConfig,
      };

      const nodeResult = generator.generateNodeDefinition(context);
      expect(nodeResult.success).toBe(true);

      const nodeDefinition = nodeResult.nodeDefinition!;
      expect(nodeDefinition.properties).toBeDefined();

      // Find properties for complex types
      const configProp = nodeDefinition.properties.find(p => p.name === 'config');
      const itemsProp = nodeDefinition.properties.find(p => p.name === 'items');
      const operationProp = nodeDefinition.properties.find(p => p.name === 'operation');

      expect(configProp?.type).toBe('json');
      expect(itemsProp?.type).toBe('json');
      expect(operationProp?.type).toBe('options');

      // Test parameter mapping
      const complexParameters = {
        operation: 'create',
        config: {
          enabled: true,
          timeout: 15.5,
        },
        items: [
          { id: 'test1', value: 100 },
          { id: 'test2', value: 200 },
        ],
      };

      const mcpRequest = mapper.mapN8nParametersToMCP(
        complexParameters,
        mockN8nExecutionData,
        parsedTool
      );

      expect(mcpRequest.arguments).toEqual(complexParameters);
    });

    it('should validate the entire pipeline with error handling', () => {
      // Test with invalid MCP data
      const invalidCapabilities = {
        tools: [
          {
            // Missing required fields
            description: 'Invalid tool',
          },
        ],
      };

      expect(() => {
        parser.parseServerCapabilities(invalidCapabilities);
      }).toThrow();

      // Test with valid data but complex validation
      const validTool = parser.parseTool(mockSimpleTool);
      const validation = parser.validateTool(validTool);

      expect(validation.success).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should handle metadata extraction and tool categorization', () => {
      const tools = mockMCPCapabilities.tools.map(tool => 
        parser.parseTool(tool)
      );

      const metadata = tools.map(tool => 
        parser.extractToolMetadata(tool)
      );

      expect(metadata).toHaveLength(3);
      
      metadata.forEach(meta => {
        expect(meta.name).toBeTruthy();
        expect(meta.description).toBeTruthy();
        expect(meta.parameterCount).toBeGreaterThanOrEqual(0);
        expect(meta.complexity).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(meta.tags)).toBe(true);
      });

      // Check that complex tool has higher complexity
      const complexMeta = metadata.find(m => m.name === 'complex_data_processor');
      const simpleMeta = metadata.find(m => m.name === 'simple_test');
      
      expect(complexMeta!.complexity).toBeGreaterThan(simpleMeta!.complexity);
      expect(complexMeta!.parameterCount).toBeGreaterThan(simpleMeta!.parameterCount);
    });

    it('should support parameter validation summaries', () => {
      // Generate validation summary for each tool type
      const simpleValidation = mapper.createValidationSummary(mockSimpleTool);
      const complexValidation = mapper.createValidationSummary(mockComplexTool);

      // Simple tool validation
      expect(simpleValidation.message).toMatchObject({
        type: 'string',
        required: true,
        hasDefault: true,
      });

      expect(simpleValidation.count).toMatchObject({
        type: 'integer',
        required: false,
        hasDefault: false,
        constraints: {
          minimum: 1,
          maximum: 100,
        },
      });

      // Complex tool validation
      expect(complexValidation.operation).toMatchObject({
        type: 'string',
        required: true,
        hasDefault: false,
        constraints: {
          enum: ['create', 'update', 'delete'],
        },
      });

      expect(complexValidation.config).toMatchObject({
        type: 'object',
        required: false,
        hasDefault: false,
      });
    });

    it('should handle conversion configuration variations', () => {
      const variations = [
        {
          nodeNamePrefix: 'Custom',
          defaultIcon: 'fa:star',
          defaultGroup: ['custom'],
        },
        {
          nodeNamePrefix: undefined,
          enableBinaryData: false,
          enableResourceAccess: false,
        },
        {
          typeMapping: {
            string: 'string',
            number: 'string', // Map numbers to strings
            boolean: 'options',
            array: 'collection',
            object: 'fixedCollection',
          },
        },
      ];

      variations.forEach(config => {
        const context: ConversionContext = {
          mcpServer: mockMCPServer,
          tool: mockSimpleTool,
          config,
        };

        const result = generator.generateNodeDefinition(context);
        expect(result.success).toBe(true);
        expect(result.nodeDefinition).toBeDefined();
      });
    });

    it('should handle expression resolution in parameter mapping', () => {
      const expressionParameters = {
        message: 'Processing {{ $json.name }} with ID {{ $json.id }}',
        count: '{{ $json.value }}',
      };

      const mcpRequest = mapper.mapN8nParametersToMCP(
        expressionParameters,
        mockN8nExecutionData,
        mockSimpleTool
      );

      expect(mcpRequest.arguments.message).toBe('Processing Test Item with ID test-item-1');
      expect(mcpRequest.arguments.count).toBe(42); // Should be converted to number
    });

    it('should handle response mapping from MCP to n8n format', () => {
      const mcpResponse = {
        content: [
          {
            type: 'text',
            text: 'Operation completed successfully',
          },
          {
            type: 'image',
            data: 'base64-image-data',
            mimeType: 'image/png',
          },
          {
            type: 'resource',
            uri: 'file://output.json',
            mimeType: 'application/json',
          },
        ],
      };

      const executionContext = {
        connection: {
          serverId: 'test-server',
          url: 'https://test.com',
          authentication: { type: 'none' as const },
          isConnected: true,
        },
        tool: mockSimpleTool,
        nodeParameters: {},
        inputData: mockN8nExecutionData,
      };

      const n8nOutput = mapper.mapMCPResponseToN8n(mcpResponse, executionContext);

      expect(n8nOutput).toHaveLength(3);
      
      expect(n8nOutput[0].json).toMatchObject({
        type: 'text',
        text: 'Operation completed successfully',
      });

      expect(n8nOutput[1].json).toMatchObject({
        type: 'image',
        hasData: true,
      });
      expect(n8nOutput[1].binary).toBeDefined();

      expect(n8nOutput[2].json).toMatchObject({
        type: 'resource',
        uri: 'file://output.json',
        mimeType: 'application/json',
      });
    });

    it('should maintain data integrity through full conversion cycle', () => {
      // Start with MCP capabilities
      const capabilities = parser.parseServerCapabilities(mockMCPCapabilities);
      
      // Generate n8n nodes
      const nodes = capabilities.tools.map(tool => {
        const context: ConversionContext = {
          mcpServer: mockMCPServer,
          tool,
          config: mockConversionConfig,
        };
        return generator.generateNodeDefinition(context);
      });

      // Ensure all conversions were successful
      expect(nodes.every(n => n.success)).toBe(true);

      // Test parameter mapping for each tool
      const testParameters = {
        simple_test: { message: 'test', count: 5 },
        complex_data_processor: { operation: 'create' },
        enum_tool: { priority: 'high' },
      };

      capabilities.tools.forEach(tool => {
        const params = testParameters[tool.name as keyof typeof testParameters];
        if (params) {
          const mcpRequest = mapper.mapN8nParametersToMCP(
            params,
            mockN8nExecutionData,
            tool
          );

          expect(mcpRequest.name).toBe(tool.name);
          expect(mcpRequest.arguments).toBeDefined();
        }
      });
    });

    it('should handle edge cases and error recovery', () => {
      // Test empty capabilities
      const emptyCapabilities = { tools: [] };
      const parsed = parser.parseServerCapabilities(emptyCapabilities);
      expect(parsed.tools).toHaveLength(0);

      // Test node generation with minimal configuration
      const minimalContext: ConversionContext = {
        mcpServer: mockMCPServer,
        tool: mockSimpleTool,
        config: {},
      };

      const result = generator.generateNodeDefinition(minimalContext);
      expect(result.success).toBe(true);

      // Test parameter mapping with missing optional parameters
      const sparseParameters = {
        message: 'required only',
      };

      const mcpRequest = mapper.mapN8nParametersToMCP(
        sparseParameters,
        mockN8nExecutionData,
        mockSimpleTool
      );

      expect(mcpRequest.arguments.message).toBe('required only');
      expect(mcpRequest.arguments.count).toBeUndefined();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of tools efficiently', () => {
      // Generate a large number of tools
      const manyTools = Array.from({ length: 100 }, (_, i) => ({
        ...mockSimpleTool,
        name: `tool_${i}`,
        description: `Test tool number ${i}`,
      }));

      const largeCapabilities = {
        tools: manyTools,
        resources: [],
      };

      const startTime = Date.now();
      
      // Parse all tools
      const parsed = parser.parseServerCapabilities(largeCapabilities);
      expect(parsed.tools).toHaveLength(100);

      // Generate node definitions
      const nodes = parsed.tools.map(tool => {
        const context: ConversionContext = {
          mcpServer: mockMCPServer,
          tool,
          config: mockConversionConfig,
        };
        return generator.generateNodeDefinition(context);
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(nodes).toHaveLength(100);
      expect(nodes.every(n => n.success)).toBe(true);
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds
    });

    it('should handle deeply nested object structures', () => {
      const deeplyNestedTool = {
        name: 'deeply_nested',
        description: 'Tool with deeply nested structure',
        inputSchema: {
          type: 'object' as const,
          properties: {
            level1: {
              type: 'object' as const,
              properties: {
                level2: {
                  type: 'object' as const,
                  properties: {
                    level3: {
                      type: 'object' as const,
                      properties: {
                        level4: {
                          type: 'string' as const,
                          description: 'Deeply nested value',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          required: [],
        },
      };

      // Should parse without issues
      const parsed = parser.parseTool(deeplyNestedTool);
      expect(parsed).toEqual(deeplyNestedTool);

      // Should validate successfully
      const validation = parser.validateTool(parsed);
      expect(validation.success).toBe(true);

      // Should generate node definition
      const context: ConversionContext = {
        mcpServer: mockMCPServer,
        tool: parsed,
        config: mockConversionConfig,
      };

      const nodeResult = generator.generateNodeDefinition(context);
      expect(nodeResult.success).toBe(true);
    });
  });
});