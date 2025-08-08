import { describe, it, expect, beforeEach } from '@jest/globals';
import { N8nNodeGenerator } from '../../utils/nodeGenerator.js';
import {
  mockSimpleTool,
  mockComplexTool,
  mockEnumTool,
  mockStringConstraintsTool,
  mockConversionContext,
  mockMCPServer,
} from '../testData.js';
import { MCPConversionConfig, ConversionContext } from '../../types/mcpTypes.js';

describe('N8nNodeGenerator', () => {
  let generator: N8nNodeGenerator;

  beforeEach(() => {
    generator = new N8nNodeGenerator();
  });

  describe('generateNodeDefinition', () => {
    it('should generate node definition for simple tool', () => {
      const result = generator.generateNodeDefinition(mockConversionContext);

      expect(result.success).toBe(true);
      expect(result.nodeDefinition).toBeDefined();
      expect(result.nodeDefinition!.displayName).toBe('MCP Simple Test');
      expect(result.nodeDefinition!.name).toBe('MCPSimpleTest');
      expect(result.nodeDefinition!.description).toBe('A simple test tool for unit testing');
      expect(result.nodeDefinition!.icon).toBe('fa:cog');
      expect(result.nodeDefinition!.group).toEqual(['transform']);
      expect(result.nodeDefinition!.version).toEqual([1]);
    });

    it('should generate node definition for complex tool', () => {
      const complexContext: ConversionContext = {
        ...mockConversionContext,
        tool: mockComplexTool,
      };

      const result = generator.generateNodeDefinition(complexContext);

      expect(result.success).toBe(true);
      expect(result.nodeDefinition).toBeDefined();
      expect(result.nodeDefinition!.displayName).toBe('MCP Complex Data Processor');
      expect(result.nodeDefinition!.name).toBe('MCPComplexDataProcessor');
    });

    it('should generate node definition for enum tool', () => {
      const enumContext: ConversionContext = {
        ...mockConversionContext,
        tool: mockEnumTool,
      };

      const result = generator.generateNodeDefinition(enumContext);

      expect(result.success).toBe(true);
      expect(result.nodeDefinition).toBeDefined();
      
      // Find the priority property
      const properties = result.nodeDefinition!.properties;
      const priorityProp = properties.find(p => p.name === 'priority');
      
      expect(priorityProp).toBeDefined();
      expect(priorityProp!.type).toBe('options');
      expect(priorityProp!.options).toEqual([
        { name: 'Low', value: 'low' },
        { name: 'Medium', value: 'medium' },
        { name: 'High', value: 'high' },
      ]);
      expect(priorityProp!.default).toBe('medium');
    });

    it('should handle custom configuration', () => {
      const customConfig: MCPConversionConfig = {
        nodeNamePrefix: 'Custom',
        defaultIcon: 'fa:star',
        defaultGroup: ['custom'],
        credentialName: 'customAuth',
        enableBinaryData: false,
        enableResourceAccess: false,
      };

      const customContext: ConversionContext = {
        ...mockConversionContext,
        config: customConfig,
      };

      const result = generator.generateNodeDefinition(customContext);

      expect(result.success).toBe(true);
      expect(result.nodeDefinition!.displayName).toBe('Custom Simple Test');
      expect(result.nodeDefinition!.name).toBe('CustomSimpleTest');
      expect(result.nodeDefinition!.icon).toBe('fa:star');
      expect(result.nodeDefinition!.group).toEqual(['custom']);
      expect(result.nodeDefinition!.credentials![0].name).toBe('customAuth');
    });

    it('should handle missing configuration gracefully', () => {
      const minimalContext: ConversionContext = {
        mcpServer: mockMCPServer,
        tool: mockSimpleTool,
        config: {},
      };

      const result = generator.generateNodeDefinition(minimalContext);

      expect(result.success).toBe(true);
      expect(result.nodeDefinition!.icon).toBe('fa:cog');
      expect(result.nodeDefinition!.group).toEqual(['transform']);
    });

    it('should generate properties correctly', () => {
      const result = generator.generateNodeDefinition(mockConversionContext);

      expect(result.success).toBe(true);
      const properties = result.nodeDefinition!.properties;
      
      // Find message property
      const messageProp = properties.find(p => p.name === 'message');
      expect(messageProp).toBeDefined();
      expect(messageProp!.type).toBe('string');
      expect(messageProp!.required).toBe(true);
      expect(messageProp!.default).toBe('Hello World');
      expect(messageProp!.displayName).toBe('Message');

      // Find count property
      const countProp = properties.find(p => p.name === 'count');
      expect(countProp).toBeDefined();
      expect(countProp!.type).toBe('number');
      expect(countProp!.required).toBe(false);
    });

    it('should add binary data property when enabled', () => {
      const result = generator.generateNodeDefinition(mockConversionContext);

      expect(result.success).toBe(true);
      const properties = result.nodeDefinition!.properties;
      const binaryDataProp = properties.find(p => p.name === 'binaryData');
      
      expect(binaryDataProp).toBeDefined();
      expect(binaryDataProp!.type).toBe('boolean');
      expect(binaryDataProp!.default).toBe(false);
    });

    it('should add resource access property when enabled', () => {
      const result = generator.generateNodeDefinition(mockConversionContext);

      expect(result.success).toBe(true);
      const properties = result.nodeDefinition!.properties;
      const resourceProp = properties.find(p => p.name === 'enableResources');
      
      expect(resourceProp).toBeDefined();
      expect(resourceProp!.type).toBe('boolean');
      expect(resourceProp!.default).toBe(false);
    });

    it('should handle error during generation', () => {
      const invalidContext = {
        ...mockConversionContext,
        tool: null as any,
      };

      const result = generator.generateNodeDefinition(invalidContext);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('property type mapping', () => {
    it('should map MCP string to n8n string', () => {
      const stringContext: ConversionContext = {
        ...mockConversionContext,
        tool: mockStringConstraintsTool,
      };

      const result = generator.generateNodeDefinition(stringContext);
      expect(result.success).toBe(true);
      
      const emailProp = result.nodeDefinition!.properties.find(p => p.name === 'email');
      expect(emailProp!.type).toBe('string');
      expect(emailProp!.placeholder).toBe('user@example.com');

      const passwordProp = result.nodeDefinition!.properties.find(p => p.name === 'password');
      expect(passwordProp!.typeOptions).toMatchObject({ password: true });

      const websiteProp = result.nodeDefinition!.properties.find(p => p.name === 'website');
      expect(websiteProp!.placeholder).toBe('https://example.com');
    });

    it('should map MCP number to n8n number with constraints', () => {
      const result = generator.generateNodeDefinition({
        ...mockConversionContext,
        tool: mockComplexTool,
      });

      expect(result.success).toBe(true);
      const properties = result.nodeDefinition!.properties;
      
      // The timeout property is nested in config object, so it becomes JSON
      const configProp = properties.find(p => p.name === 'config');
      expect(configProp!.type).toBe('json');
    });

    it('should map MCP array to n8n json', () => {
      const result = generator.generateNodeDefinition({
        ...mockConversionContext,
        tool: mockComplexTool,
      });

      expect(result.success).toBe(true);
      const properties = result.nodeDefinition!.properties;
      const itemsProp = properties.find(p => p.name === 'items');
      
      expect(itemsProp!.type).toBe('json');
      expect(itemsProp!.typeOptions).toMatchObject({ rows: 4 });
    });

    it('should map MCP object to n8n json', () => {
      const result = generator.generateNodeDefinition({
        ...mockConversionContext,
        tool: mockComplexTool,
      });

      expect(result.success).toBe(true);
      const properties = result.nodeDefinition!.properties;
      const configProp = properties.find(p => p.name === 'config');
      
      expect(configProp!.type).toBe('json');
      expect(configProp!.typeOptions).toMatchObject({ rows: 6 });
    });

    it('should use custom type mapping', () => {
      const customConfig: MCPConversionConfig = {
        typeMapping: {
          string: 'string',
          number: 'string', // Map numbers to strings
          integer: 'string',
          boolean: 'options',
          array: 'collection',
          object: 'fixedCollection',
        },
      };

      const customContext: ConversionContext = {
        ...mockConversionContext,
        config: customConfig,
      };

      const result = generator.generateNodeDefinition(customContext);
      expect(result.success).toBe(true);
    });
  });

  describe('node name generation', () => {
    it('should generate valid node names from tool names', () => {
      const testCases = [
        { input: 'simple_test', expected: 'MCPSimpleTest' },
        { input: 'kebab-case-name', expected: 'MCPKebabCaseName' },
        { input: 'UPPERCASE_TOOL', expected: 'MCPUPPERCASETOOL' },
        { input: 'mixed_Case-Tool', expected: 'MCPMixedCaseTool' },
        { input: '123numeric_start', expected: 'MCPn123numericStart' },
        { input: 'special!@#chars', expected: 'MCPSpecialChars' },
      ];

      testCases.forEach(({ input, expected }) => {
        const context: ConversionContext = {
          ...mockConversionContext,
          tool: { ...mockSimpleTool, name: input },
        };

        const result = generator.generateNodeDefinition(context);
        expect(result.success).toBe(true);
        expect(result.nodeDefinition!.name).toBe(expected);
      });
    });

    it('should generate display names correctly', () => {
      const testCases = [
        { input: 'simple_test', expected: 'MCP Simple Test' },
        { input: 'kebab-case-name', expected: 'MCP Kebab Case Name' },
        { input: 'camelCaseName', expected: 'MCP CamelCaseName' },
      ];

      testCases.forEach(({ input, expected }) => {
        const context: ConversionContext = {
          ...mockConversionContext,
          tool: { ...mockSimpleTool, name: input },
        };

        const result = generator.generateNodeDefinition(context);
        expect(result.success).toBe(true);
        expect(result.nodeDefinition!.displayName).toBe(expected);
      });
    });

    it('should handle names without prefix', () => {
      const configWithoutPrefix: MCPConversionConfig = {
        nodeNamePrefix: undefined,
      };

      const context: ConversionContext = {
        ...mockConversionContext,
        config: configWithoutPrefix,
      };

      const result = generator.generateNodeDefinition(context);
      expect(result.success).toBe(true);
      expect(result.nodeDefinition!.name).toBe('simpleTest');
      expect(result.nodeDefinition!.displayName).toBe('Simple Test');
    });
  });

  describe('validation', () => {
    it('should validate generated node definition', () => {
      const result = generator.generateNodeDefinition(mockConversionContext);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toBeDefined();
    });

    it('should detect invalid display names', () => {
      // Create a tool that would generate invalid display name
      const shortNameTool = {
        ...mockSimpleTool,
        name: 'ab',
        description: 'Test',
      };

      const context: ConversionContext = {
        ...mockConversionContext,
        tool: shortNameTool,
      };

      const result = generator.generateNodeDefinition(context);
      // Should still succeed but with warnings about short description
      expect(result.success).toBe(true);
    });

    it('should detect duplicate property names', () => {
      // This is more of an edge case since our property generation should prevent duplicates
      const result = generator.generateNodeDefinition(mockConversionContext);
      expect(result.success).toBe(true);
      
      const propertyNames = result.nodeDefinition!.properties.map(p => p.name);
      const uniqueNames = new Set(propertyNames);
      expect(propertyNames.length).toBe(uniqueNames.size);
    });

    it('should warn about many properties', () => {
      // Create a tool with many properties
      const manyPropsSchema = {
        type: 'object' as const,
        properties: {} as Record<string, any>,
      };

      // Add 25 properties to trigger warning
      for (let i = 0; i < 25; i++) {
        manyPropsSchema.properties[`prop${i}`] = {
          type: 'string' as const,
          description: `Property ${i}`,
        };
      }

      const manyPropsTool = {
        ...mockSimpleTool,
        inputSchema: manyPropsSchema,
      };

      const context: ConversionContext = {
        ...mockConversionContext,
        tool: manyPropsTool,
      };

      const result = generator.generateNodeDefinition(context);
      expect(result.success).toBe(true);
      expect(result.warnings).toContain(expect.stringContaining('Consider grouping'));
    });

    it('should handle empty properties', () => {
      const emptyPropsTool = {
        ...mockSimpleTool,
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      };

      const context: ConversionContext = {
        ...mockConversionContext,
        tool: emptyPropsTool,
      };

      const result = generator.generateNodeDefinition(context);
      expect(result.success).toBe(true);
      expect(result.warnings).toContain(expect.stringContaining('no configurable properties'));
    });
  });

  describe('property generation details', () => {
    it('should handle string format types correctly', () => {
      const result = generator.generateNodeDefinition({
        ...mockConversionContext,
        tool: mockStringConstraintsTool,
      });

      expect(result.success).toBe(true);
      const properties = result.nodeDefinition!.properties;

      const passwordProp = properties.find(p => p.name === 'password');
      expect(passwordProp!.typeOptions).toMatchObject({
        password: true,
        minLength: 8,
        maxLength: 128,
      });

      const codeProp = properties.find(p => p.name === 'code');
      expect(codeProp!.typeOptions).toMatchObject({
        pattern: '^[A-Z]{3}[0-9]{3}$',
      });
    });

    it('should handle integer constraints', () => {
      const integerTool = {
        ...mockSimpleTool,
        inputSchema: {
          type: 'object' as const,
          properties: {
            count: {
              type: 'integer' as const,
              minimum: 1,
              maximum: 100,
              description: 'Count value',
            },
          },
        },
      };

      const result = generator.generateNodeDefinition({
        ...mockConversionContext,
        tool: integerTool,
      });

      expect(result.success).toBe(true);
      const properties = result.nodeDefinition!.properties;
      const countProp = properties.find(p => p.name === 'count');

      expect(countProp!.type).toBe('number');
      expect(countProp!.typeOptions).toMatchObject({
        minValue: 1,
        maxValue: 100,
      });
    });

    it('should handle array items description', () => {
      const arrayTool = {
        ...mockSimpleTool,
        inputSchema: {
          type: 'object' as const,
          properties: {
            items: {
              type: 'array' as const,
              items: {
                type: 'string' as const,
              },
              description: 'List of items',
            },
          },
        },
      };

      const result = generator.generateNodeDefinition({
        ...mockConversionContext,
        tool: arrayTool,
      });

      expect(result.success).toBe(true);
      const properties = result.nodeDefinition!.properties;
      const itemsProp = properties.find(p => p.name === 'items');

      expect(itemsProp!.description).toContain('Array of string');
    });

    it('should handle object properties description', () => {
      const result = generator.generateNodeDefinition({
        ...mockConversionContext,
        tool: mockComplexTool,
      });

      expect(result.success).toBe(true);
      const properties = result.nodeDefinition!.properties;
      const configProp = properties.find(p => p.name === 'config');

      expect(configProp!.description).toContain('Object with: enabled, timeout');
    });

    it('should handle credentials configuration', () => {
      const noCredConfig: MCPConversionConfig = {
        credentialName: undefined,
      };

      const context: ConversionContext = {
        ...mockConversionContext,
        config: noCredConfig,
      };

      const result = generator.generateNodeDefinition(context);
      expect(result.success).toBe(true);
      expect(result.nodeDefinition!.credentials).toBeUndefined();
    });
  });

  describe('utility methods', () => {
    it('should return supported MCP types', () => {
      const supportedTypes = generator.getSupportedMCPTypes();
      expect(supportedTypes).toEqual([
        'string', 'number', 'integer', 'boolean', 'array', 'object'
      ]);
    });

    it('should return available n8n types', () => {
      const n8nTypes = generator.getAvailableN8nTypes();
      expect(n8nTypes).toContain('string');
      expect(n8nTypes).toContain('number');
      expect(n8nTypes).toContain('boolean');
      expect(n8nTypes).toContain('options');
      expect(n8nTypes).toContain('json');
    });

    it('should generate multiple nodes for complex tools', () => {
      const results = generator.generateMultipleNodes(mockConversionContext);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('should handle operation properties for multi-operation tools', () => {
      // Currently returns false, but test the structure
      const result = generator.generateNodeDefinition(mockConversionContext);
      expect(result.success).toBe(true);
      
      // No operation property should be added for single operation tools
      const properties = result.nodeDefinition!.properties;
      const operationProp = properties.find(p => p.name === 'operation');
      expect(operationProp).toBeUndefined();
    });
  });
});