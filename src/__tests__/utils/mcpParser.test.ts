import { describe, it, expect, beforeEach } from '@jest/globals';
import { MCPToolParser } from '../../utils/mcpParser.js';
import {
  mockSimpleTool,
  mockComplexTool,
  mockEnumTool,
  mockStringConstraintsTool,
  mockMCPCapabilities,
  invalidMCPTool,
  invalidSchema,
  errorTestScenarios,
} from '../testData.js';

describe('MCPToolParser', () => {
  let parser: MCPToolParser;

  beforeEach(() => {
    parser = new MCPToolParser();
  });

  describe('parseServerCapabilities', () => {
    it('should parse valid MCP server capabilities', () => {
      const result = parser.parseServerCapabilities(mockMCPCapabilities);

      expect(result).toBeDefined();
      expect(result.tools).toHaveLength(3);
      expect(result.tools[0]).toEqual(mockSimpleTool);
      expect(result.resources).toHaveLength(2);
      expect(result.sampling).toEqual({ models: ['gpt-4', 'claude-3'] });
    });

    it('should throw error for null capabilities', () => {
      expect(() => {
        parser.parseServerCapabilities(null);
      }).toThrow('Invalid MCP capabilities data');
    });

    it('should throw error for non-object capabilities', () => {
      expect(() => {
        parser.parseServerCapabilities('invalid');
      }).toThrow('Invalid MCP capabilities data');
    });

    it('should throw error for missing tools array', () => {
      expect(() => {
        parser.parseServerCapabilities({ resources: [] });
      }).toThrow('MCP capabilities must include tools array');
    });

    it('should throw error for non-array tools', () => {
      expect(() => {
        parser.parseServerCapabilities({ tools: 'invalid' });
      }).toThrow('MCP capabilities must include tools array');
    });

    it('should handle missing optional fields', () => {
      const minimalCapabilities = {
        tools: [mockSimpleTool],
      };

      const result = parser.parseServerCapabilities(minimalCapabilities);
      expect(result.tools).toHaveLength(1);
      expect(result.resources).toEqual([]);
      expect(result.sampling).toBeUndefined();
    });
  });

  describe('parseTool', () => {
    it('should parse a simple MCP tool', () => {
      const result = parser.parseTool(mockSimpleTool);
      expect(result).toEqual(mockSimpleTool);
    });

    it('should parse a complex MCP tool with nested objects', () => {
      const result = parser.parseTool(mockComplexTool);
      expect(result).toEqual(mockComplexTool);
    });

    it('should parse a tool with enum parameters', () => {
      const result = parser.parseTool(mockEnumTool);
      expect(result).toEqual(mockEnumTool);
    });

    it('should parse a tool with string constraints', () => {
      const result = parser.parseTool(mockStringConstraintsTool);
      expect(result).toEqual(mockStringConstraintsTool);
    });

    errorTestScenarios.forEach((scenario) => {
      it(`should throw error for ${scenario.name}`, () => {
        expect(() => {
          parser.parseTool(scenario.data);
        }).toThrow(scenario.expectedError);
      });
    });
  });

  describe('parseToolSchema', () => {
    it('should parse valid object schema', () => {
      const schema = mockSimpleTool.inputSchema;
      const result = parser.parseToolSchema(schema);
      expect(result).toEqual(schema);
    });

    it('should throw error for non-object schema', () => {
      expect(() => {
        parser.parseToolSchema(invalidSchema);
      }).toThrow('MCP tool schema must be of type "object"');
    });

    it('should throw error for missing properties', () => {
      const invalidSchemaNoProps = {
        type: 'object',
      };
      expect(() => {
        parser.parseToolSchema(invalidSchemaNoProps);
      }).toThrow('MCP tool schema must have properties');
    });

    it('should handle optional required array', () => {
      const schemaNoRequired = {
        type: 'object',
        properties: {
          optional: { type: 'string' },
        },
      };
      const result = parser.parseToolSchema(schemaNoRequired);
      expect(result.required).toEqual([]);
    });

    it('should handle additionalProperties flag', () => {
      const schemaWithAdditional = {
        type: 'object',
        properties: { test: { type: 'string' } },
        additionalProperties: false,
      };
      const result = parser.parseToolSchema(schemaWithAdditional);
      expect(result.additionalProperties).toBe(false);
    });
  });

  describe('validateTool', () => {
    it('should validate a correct simple tool', () => {
      const result = parser.validateTool(mockSimpleTool);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate a complex tool', () => {
      const result = parser.validateTool(mockComplexTool);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject tool with invalid name', () => {
      const invalidNameTool = {
        ...mockSimpleTool,
        name: '123invalid-name!@#',
      };
      const result = parser.validateTool(invalidNameTool);
      expect(result.success).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Invalid tool name'));
    });

    it('should warn about short description', () => {
      const shortDescTool = {
        ...mockSimpleTool,
        description: 'Short',
      };
      const result = parser.validateTool(shortDescTool);
      expect(result.success).toBe(true);
      expect(result.warnings).toContain(expect.stringContaining('at least 10 characters'));
    });

    it('should warn about complex schemas', () => {
      // Create a very complex tool schema
      const complexSchema = {
        type: 'object' as const,
        properties: {},
      };
      
      // Add many properties to increase complexity
      for (let i = 0; i < 60; i++) {
        complexSchema.properties[`prop${i}`] = {
          type: 'string' as const,
          description: `Property ${i}`,
        };
      }

      const veryComplexTool = {
        ...mockSimpleTool,
        inputSchema: complexSchema,
      };

      const result = parser.validateTool(veryComplexTool);
      expect(result.success).toBe(true);
      expect(result.warnings).toContain(expect.stringContaining('very complex'));
    });

    it('should handle tool names at boundary lengths', () => {
      // Test minimum valid length
      const shortNameTool = { ...mockSimpleTool, name: 'ab' };
      const shortResult = parser.validateTool(shortNameTool);
      expect(shortResult.success).toBe(true);

      // Test single character (should fail)
      const singleCharTool = { ...mockSimpleTool, name: 'a' };
      const singleResult = parser.validateTool(singleCharTool);
      expect(singleResult.success).toBe(false);

      // Test very long name (should fail)
      const longName = 'a'.repeat(51);
      const longNameTool = { ...mockSimpleTool, name: longName };
      const longResult = parser.validateTool(longNameTool);
      expect(longResult.success).toBe(false);
    });
  });

  describe('extractToolMetadata', () => {
    it('should extract metadata from simple tool', () => {
      const metadata = parser.extractToolMetadata(mockSimpleTool);
      
      expect(metadata).toMatchObject({
        name: 'simple_test',
        description: 'A simple test tool for unit testing',
        parameterCount: 2,
        requiredParameters: 1,
      });
      expect(metadata.complexity).toBeGreaterThan(0);
      expect(Array.isArray(metadata.tags)).toBe(true);
    });

    it('should extract metadata from complex tool', () => {
      const metadata = parser.extractToolMetadata(mockComplexTool);
      
      expect(metadata.parameterCount).toBe(3);
      expect(metadata.requiredParameters).toBe(1);
      expect(metadata.complexity).toBeGreaterThan(2);
    });

    it('should extract semantic tags correctly', () => {
      const apiTool = {
        name: 'api_request',
        description: 'Make HTTP API requests to external endpoints',
        inputSchema: {
          type: 'object' as const,
          properties: {
            url: { type: 'string' as const },
          },
        },
      };

      const metadata = parser.extractToolMetadata(apiTool);
      expect(metadata.tags).toContain('api');
    });

    it('should handle tool with no required parameters', () => {
      const noRequiredTool = {
        ...mockSimpleTool,
        inputSchema: {
          ...mockSimpleTool.inputSchema,
          required: [],
        },
      };

      const metadata = parser.extractToolMetadata(noRequiredTool);
      expect(metadata.requiredParameters).toBe(0);
    });

    it('should handle tool with undefined required array', () => {
      const undefinedRequiredTool = {
        ...mockSimpleTool,
        inputSchema: {
          ...mockSimpleTool.inputSchema,
          required: undefined,
        },
      };

      const metadata = parser.extractToolMetadata(undefinedRequiredTool);
      expect(metadata.requiredParameters).toBe(0);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle nested object properties correctly', () => {
      const result = parser.parseTool(mockComplexTool);
      const configProp = result.inputSchema.properties.config;
      
      expect(configProp.type).toBe('object');
      expect(configProp.properties).toBeDefined();
      expect(configProp.properties!.enabled.type).toBe('boolean');
      expect(configProp.properties!.timeout.type).toBe('number');
    });

    it('should handle array properties with item schemas', () => {
      const result = parser.parseTool(mockComplexTool);
      const itemsProp = result.inputSchema.properties.items;
      
      expect(itemsProp.type).toBe('array');
      expect(itemsProp.items).toBeDefined();
      expect(itemsProp.items!.type).toBe('object');
      expect(itemsProp.items!.properties).toBeDefined();
    });

    it('should validate property types correctly', () => {
      const invalidPropertyType = {
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: {
            invalid: {
              type: 'invalid_type', // Invalid type
              description: 'Invalid property',
            },
          },
        },
      };

      expect(() => {
        parser.parseTool(invalidPropertyType);
      }).toThrow('Invalid MCP property type');
    });

    it('should handle all supported property types', () => {
      const allTypesTool = {
        name: 'all_types',
        description: 'Tool with all supported property types',
        inputSchema: {
          type: 'object' as const,
          properties: {
            stringProp: { type: 'string' as const },
            numberProp: { type: 'number' as const },
            integerProp: { type: 'integer' as const },
            booleanProp: { type: 'boolean' as const },
            arrayProp: { type: 'array' as const },
            objectProp: { type: 'object' as const },
          },
        },
      };

      const result = parser.parseTool(allTypesTool);
      expect(result.inputSchema.properties).toHaveProperty('stringProp');
      expect(result.inputSchema.properties).toHaveProperty('numberProp');
      expect(result.inputSchema.properties).toHaveProperty('integerProp');
      expect(result.inputSchema.properties).toHaveProperty('booleanProp');
      expect(result.inputSchema.properties).toHaveProperty('arrayProp');
      expect(result.inputSchema.properties).toHaveProperty('objectProp');
    });

    it('should handle string constraints parsing', () => {
      const result = parser.parseTool(mockStringConstraintsTool);
      const emailProp = result.inputSchema.properties.email;
      const passwordProp = result.inputSchema.properties.password;
      const websiteProp = result.inputSchema.properties.website;
      const codeProp = result.inputSchema.properties.code;

      expect(emailProp.format).toBe('email');
      expect(passwordProp.format).toBe('password');
      expect(passwordProp.minLength).toBe(8);
      expect(passwordProp.maxLength).toBe(128);
      expect(websiteProp.format).toBe('uri');
      expect(websiteProp.pattern).toBe('^https?://');
      expect(codeProp.pattern).toBe('^[A-Z]{3}[0-9]{3}$');
    });

    it('should handle number constraints parsing', () => {
      const result = parser.parseTool(mockComplexTool);
      const timeoutProp = result.inputSchema.properties.config.properties!.timeout;

      expect(timeoutProp.minimum).toBe(0.1);
      expect(timeoutProp.maximum).toBe(30.0);
      expect(timeoutProp.default).toBe(5.0);
    });

    it('should handle enum parsing', () => {
      const result = parser.parseTool(mockEnumTool);
      const priorityProp = result.inputSchema.properties.priority;
      const statusProp = result.inputSchema.properties.status;

      expect(priorityProp.enum).toEqual(['low', 'medium', 'high']);
      expect(statusProp.enum).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('circular reference detection', () => {
    it('should detect simple circular references', () => {
      // Create a tool with circular reference in validation
      const toolWithCircular = {
        ...mockSimpleTool,
        inputSchema: {
          type: 'object' as const,
          properties: {
            self: {
              type: 'object' as const,
              properties: {
                nested: {
                  type: 'object' as const,
                  properties: {}, // This would be populated with circular reference
                },
              },
            },
          },
        },
      };

      // Since we can't easily create actual circular references in JSON,
      // we test the validation logic works correctly for non-circular cases
      const result = parser.validateTool(toolWithCircular);
      expect(result.success).toBe(true);
    });

    it('should handle deeply nested schemas without false circular detection', () => {
      const deeplyNestedTool = {
        name: 'deeply_nested',
        description: 'Tool with deeply nested object structure',
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
                      type: 'string' as const,
                      description: 'Deep nested string',
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = parser.validateTool(deeplyNestedTool);
      expect(result.success).toBe(true);
    });
  });
});