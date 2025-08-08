import { describe, it, expect, beforeEach } from '@jest/globals';
import { ParameterMapper } from '../../utils/parameterMapper.js';
import {
  mockSimpleTool,
  mockComplexTool,
  mockEnumTool,
  mockStringConstraintsTool,
  mockN8nExecutionData,
  mockExecutionContext,
  mockMCPToolResponse,
  expressionTestCases,
  typeConversionTestCases,
} from '../testData.js';
import { MCPTool, N8nExecutionData } from '../../types/mcpTypes.js';

describe('ParameterMapper', () => {
  let mapper: ParameterMapper;

  beforeEach(() => {
    mapper = new ParameterMapper();
  });

  describe('mapN8nParametersToMCP', () => {
    it('should map simple parameters correctly', () => {
      const nodeParameters = {
        message: 'Test message',
        count: 5,
      };

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        mockN8nExecutionData,
        mockSimpleTool
      );

      expect(result.name).toBe('simple_test');
      expect(result.arguments).toEqual({
        message: 'Test message',
        count: 5,
      });
    });

    it('should use default values for missing optional parameters', () => {
      const nodeParameters = {
        message: 'Test message',
        // count is missing, should use no default (not in schema)
      };

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        mockN8nExecutionData,
        mockSimpleTool
      );

      expect(result.arguments).toEqual({
        message: 'Test message',
        // count should not be included since it's not required and has no default
      });
    });

    it('should use schema defaults when provided', () => {
      const toolWithDefaults: MCPTool = {
        ...mockSimpleTool,
        inputSchema: {
          ...mockSimpleTool.inputSchema,
          properties: {
            ...mockSimpleTool.inputSchema.properties,
            message: {
              ...mockSimpleTool.inputSchema.properties.message,
              default: 'Default message',
            },
          },
          required: [], // Make message optional to test default
        },
      };

      const nodeParameters = {
        // message is missing, should use default
      };

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        mockN8nExecutionData,
        toolWithDefaults
      );

      expect(result.arguments).toEqual({
        message: 'Default message',
      });
    });

    it('should throw error for missing required parameters', () => {
      const nodeParameters = {
        count: 5,
        // message is required but missing
      };

      expect(() => {
        mapper.mapN8nParametersToMCP(
          nodeParameters,
          mockN8nExecutionData,
          mockSimpleTool
        );
      }).toThrow("Required parameter 'message' is missing or empty");
    });

    it('should handle complex nested parameters', () => {
      const nodeParameters = {
        operation: 'create',
        config: {
          enabled: true,
          timeout: 10.5,
        },
        items: [
          { id: 'item1', value: 100 },
          { id: 'item2', value: 200 },
        ],
      };

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        mockN8nExecutionData,
        mockComplexTool
      );

      expect(result.arguments).toEqual({
        operation: 'create',
        config: {
          enabled: true,
          timeout: 10.5,
        },
        items: [
          { id: 'item1', value: 100 },
          { id: 'item2', value: 200 },
        ],
      });
    });

    it('should handle enum parameters', () => {
      const nodeParameters = {
        priority: 'high',
        status: 3,
      };

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        mockN8nExecutionData,
        mockEnumTool
      );

      expect(result.arguments).toEqual({
        priority: 'high',
        status: 3,
      });
    });

    it('should skip null, undefined, and empty string values for optional parameters', () => {
      const nodeParameters = {
        message: 'Valid message',
        count: null,
        optional: undefined,
        empty: '',
      };

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        mockN8nExecutionData,
        mockSimpleTool
      );

      expect(result.arguments).toEqual({
        message: 'Valid message',
      });
    });

    it('should validate mapped arguments against schema', () => {
      const nodeParameters = {
        message: 'Valid message',
        unexpectedParam: 'should cause error',
      };

      expect(() => {
        mapper.mapN8nParametersToMCP(
          nodeParameters,
          mockN8nExecutionData,
          mockSimpleTool
        );
      }).toThrow("Unexpected parameter 'unexpectedParam'");
    });

    it('should allow additional properties when schema permits', () => {
      const flexibleTool: MCPTool = {
        ...mockSimpleTool,
        inputSchema: {
          ...mockSimpleTool.inputSchema,
          additionalProperties: true,
        },
      };

      const nodeParameters = {
        message: 'Valid message',
        extraParam: 'should be allowed',
      };

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        mockN8nExecutionData,
        flexibleTool
      );

      expect(result.arguments).toEqual({
        message: 'Valid message',
        extraParam: 'should be allowed',
      });
    });
  });

  describe('expression resolution', () => {
    expressionTestCases.forEach(({ input, expected, description }) => {
      it(`should resolve ${description}`, () => {
        const nodeParameters = {
          message: input,
        };

        const result = mapper.mapN8nParametersToMCP(
          nodeParameters,
          mockN8nExecutionData,
          mockSimpleTool
        );

        expect(result.arguments.message).toBe(expected);
      });
    });

    it('should handle expressions with missing input data', () => {
      const nodeParameters = {
        message: '{{ $json.name }}',
      };

      const emptyInputData: N8nExecutionData[] = [];

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        emptyInputData,
        mockSimpleTool
      );

      expect(result.arguments.message).toBe('{{ $json.name }}');
    });

    it('should handle expressions with malformed input data', () => {
      const nodeParameters = {
        message: '{{ $json.name }}',
      };

      const malformedInputData: N8nExecutionData[] = [
        {
          json: null as any,
          pairedItem: { item: 0 },
        },
      ];

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        malformedInputData,
        mockSimpleTool
      );

      expect(result.arguments.message).toBe('{{ $json.name }}');
    });

    it('should handle deeply nested expression paths', () => {
      const nodeParameters = {
        message: '{{ $json.nested.array.0 }}',
      };

      // Modify test data to include array access
      const inputDataWithArray: N8nExecutionData[] = [
        {
          json: {
            nested: {
              array: ['first', 'second', 'third'],
            },
          },
          pairedItem: { item: 0 },
        },
      ];

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        inputDataWithArray,
        mockSimpleTool
      );

      // Note: Our current implementation doesn't handle array indexing
      // This would need to be enhanced for full expression support
      expect(result.arguments.message).toBe('{{ $json.nested.array.0 }}');
    });
  });

  describe('type conversion', () => {
    typeConversionTestCases.forEach((testCase) => {
      const { input, type, expected, expectedError } = testCase;

      if (expectedError) {
        it(`should throw error when converting ${JSON.stringify(input)} to ${type}`, () => {
          const tool: MCPTool = {
            name: 'test',
            description: 'Test tool',
            inputSchema: {
              type: 'object',
              properties: {
                testParam: {
                  type: type as any,
                },
              },
              required: ['testParam'],
            },
          };

          const nodeParameters = {
            testParam: input,
          };

          expect(() => {
            mapper.mapN8nParametersToMCP(nodeParameters, [], tool);
          }).toThrow(expect.stringContaining(expectedError));
        });
      } else {
        it(`should convert ${JSON.stringify(input)} to ${type} = ${JSON.stringify(expected)}`, () => {
          const tool: MCPTool = {
            name: 'test',
            description: 'Test tool',
            inputSchema: {
              type: 'object',
              properties: {
                testParam: {
                  type: type as any,
                },
              },
              required: ['testParam'],
            },
          };

          const nodeParameters = {
            testParam: input,
          };

          const result = mapper.mapN8nParametersToMCP(nodeParameters, [], tool);
          expect(result.arguments.testParam).toEqual(expected);
        });
      }
    });

    it('should handle string constraints validation', () => {
      const nodeParameters = {
        email: 'test@example.com',
        password: 'validpassword123',
        website: 'https://example.com',
        code: 'ABC123',
      };

      const result = mapper.mapN8nParametersToMCP(
        nodeParameters,
        mockN8nExecutionData,
        mockStringConstraintsTool
      );

      expect(result.arguments).toEqual(nodeParameters);
    });

    it('should validate string length constraints', () => {
      const shortPasswordTool: MCPTool = {
        ...mockStringConstraintsTool,
        inputSchema: {
          ...mockStringConstraintsTool.inputSchema,
          required: ['password'],
        },
      };

      const nodeParameters = {
        password: '123', // Too short
      };

      expect(() => {
        mapper.mapN8nParametersToMCP(
          nodeParameters,
          mockN8nExecutionData,
          shortPasswordTool
        );
      }).toThrow('String value too short');
    });

    it('should validate string pattern constraints', () => {
      const nodeParameters = {
        email: 'test@example.com',
        code: 'invalid-format', // Doesn't match pattern
      };

      expect(() => {
        mapper.mapN8nParametersToMCP(
          nodeParameters,
          mockN8nExecutionData,
          mockStringConstraintsTool
        );
      }).toThrow('String value does not match required pattern');
    });

    it('should validate enum constraints', () => {
      const nodeParameters = {
        priority: 'invalid-priority', // Not in enum
      };

      expect(() => {
        mapper.mapN8nParametersToMCP(
          nodeParameters,
          mockN8nExecutionData,
          mockEnumTool
        );
      }).toThrow('Invalid enum value');
    });

    it('should validate number constraints', () => {
      const numberTool: MCPTool = {
        name: 'number_test',
        description: 'Test number constraints',
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              type: 'number',
              minimum: 10,
              maximum: 100,
            },
          },
          required: ['value'],
        },
      };

      // Test value too small
      expect(() => {
        mapper.mapN8nParametersToMCP({ value: 5 }, [], numberTool);
      }).toThrow('Number too small');

      // Test value too large
      expect(() => {
        mapper.mapN8nParametersToMCP({ value: 150 }, [], numberTool);
      }).toThrow('Number too large');

      // Test valid value
      const result = mapper.mapN8nParametersToMCP({ value: 50 }, [], numberTool);
      expect(result.arguments.value).toBe(50);
    });

    it('should handle array conversion with item schemas', () => {
      const arrayTool: MCPTool = {
        name: 'array_test',
        description: 'Test array conversion',
        inputSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
          required: ['items'],
        },
      };

      const nodeParameters = {
        items: ['item1', 'item2', 123], // Mixed types
      };

      const result = mapper.mapN8nParametersToMCP(nodeParameters, [], arrayTool);
      expect(result.arguments.items).toEqual(['item1', 'item2', '123']);
    });

    it('should handle object conversion with property schemas', () => {
      const objectTool: MCPTool = {
        name: 'object_test',
        description: 'Test object conversion',
        inputSchema: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                count: { type: 'number' },
              },
            },
          },
          required: ['config'],
        },
      };

      const nodeParameters = {
        config: {
          name: 'test',
          count: '42', // String that should convert to number
          extra: 'ignored', // Should be filtered out
        },
      };

      const result = mapper.mapN8nParametersToMCP(nodeParameters, [], objectTool);
      expect(result.arguments.config).toEqual({
        name: 'test',
        count: 42,
      });
    });
  });

  describe('mapMCPResponseToN8n', () => {
    it('should map standard MCP response with content array', () => {
      const result = mapper.mapMCPResponseToN8n(mockMCPToolResponse, mockExecutionContext);

      expect(result).toHaveLength(2);
      expect(result[0].json).toMatchObject({
        type: 'text',
        index: 0,
        text: 'Operation completed successfully',
      });
      expect(result[1].json).toMatchObject({
        type: 'image',
        index: 1,
        mimeType: 'image/png',
        hasData: true,
      });
      expect(result[1].binary).toBeDefined();
      expect(result[1].binary!.data.mimeType).toBe('image/png');
    });

    it('should map direct object response', () => {
      const directResponse = {
        status: 'success',
        data: { key: 'value' },
      };

      const result = mapper.mapMCPResponseToN8n(directResponse, mockExecutionContext);

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual(directResponse);
    });

    it('should map simple value response', () => {
      const simpleResponse = 'Simple text response';

      const result = mapper.mapMCPResponseToN8n(simpleResponse, mockExecutionContext);

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ result: simpleResponse });
    });

    it('should handle empty response', () => {
      const emptyResponse = null;

      const result = mapper.mapMCPResponseToN8n(emptyResponse, mockExecutionContext);

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ result: null });
    });

    it('should handle response with no content', () => {
      const emptyContentResponse = { content: [] };

      const result = mapper.mapMCPResponseToN8n(emptyContentResponse, mockExecutionContext);

      expect(result).toHaveLength(1);
      expect(result[0].json.message).toContain('no output');
    });

    it('should handle different content types', () => {
      const multiContentResponse = {
        content: [
          {
            type: 'text',
            text: 'Text content',
          },
          {
            type: 'resource',
            uri: 'file://test.txt',
            mimeType: 'text/plain',
          },
          {
            type: 'unknown',
            customField: 'custom value',
          },
        ],
      };

      const result = mapper.mapMCPResponseToN8n(multiContentResponse, mockExecutionContext);

      expect(result).toHaveLength(3);
      
      expect(result[0].json).toMatchObject({
        type: 'text',
        text: 'Text content',
      });
      
      expect(result[1].json).toMatchObject({
        type: 'resource',
        uri: 'file://test.txt',
        mimeType: 'text/plain',
      });
      
      expect(result[2].json).toMatchObject({
        type: 'unknown',
        customField: 'custom value',
      });
    });

    it('should handle binary data with different MIME types', () => {
      const binaryResponse = {
        content: [
          {
            type: 'image',
            data: 'base64-encoded-data',
            mimeType: 'image/jpeg',
          },
        ],
      };

      const result = mapper.mapMCPResponseToN8n(binaryResponse, mockExecutionContext);

      expect(result).toHaveLength(1);
      expect(result[0].binary).toBeDefined();
      expect(result[0].binary!.data.mimeType).toBe('image/jpeg');
      expect(result[0].binary!.data.fileName).toBe('mcp_response_0.jpg');
    });

    it('should handle processing errors gracefully', () => {
      const invalidResponse = {
        content: [
          {
            // Missing required fields that might cause processing to fail
          },
        ],
      };

      const result = mapper.mapMCPResponseToN8n(invalidResponse, mockExecutionContext);

      // Should still return a result, possibly with error information
      expect(result).toHaveLength(1);
      expect(result[0].json).toBeDefined();
    });

    it('should get correct file extensions for MIME types', () => {
      const mimeTestCases = [
        { mimeType: 'image/png', expectedExt: 'png' },
        { mimeType: 'image/jpeg', expectedExt: 'jpg' },
        { mimeType: 'text/plain', expectedExt: 'txt' },
        { mimeType: 'application/json', expectedExt: 'json' },
        { mimeType: 'unknown/type', expectedExt: 'bin' },
        { mimeType: undefined, expectedExt: 'bin' },
      ];

      mimeTestCases.forEach(({ mimeType, expectedExt }, index) => {
        const response = {
          content: [
            {
              type: 'image',
              data: 'test-data',
              mimeType,
            },
          ],
        };

        const result = mapper.mapMCPResponseToN8n(response, mockExecutionContext);
        
        if (result[0].binary) {
          expect(result[0].binary.data.fileName).toBe(`mcp_response_0.${expectedExt}`);
        }
      });
    });
  });

  describe('validation utilities', () => {
    it('should create validation summary for tool parameters', () => {
      const summary = mapper.createValidationSummary(mockStringConstraintsTool);

      expect(summary.email).toMatchObject({
        type: 'string',
        required: true,
        hasDefault: false,
        constraints: {},
      });

      expect(summary.password).toMatchObject({
        type: 'string',
        required: false,
        hasDefault: false,
        constraints: {
          minLength: 8,
          maxLength: 128,
        },
      });

      expect(summary.code).toMatchObject({
        type: 'string',
        required: false,
        hasDefault: false,
        constraints: {
          pattern: '^[A-Z]{3}[0-9]{3}$',
        },
      });
    });

    it('should identify parameters with defaults', () => {
      const summary = mapper.createValidationSummary(mockSimpleTool);

      expect(summary.message).toMatchObject({
        hasDefault: true,
      });
      expect(summary.count).toMatchObject({
        hasDefault: false,
      });
    });

    it('should extract all constraint types', () => {
      const constrainedTool: MCPTool = {
        name: 'constrained',
        description: 'Tool with all constraint types',
        inputSchema: {
          type: 'object',
          properties: {
            enumParam: {
              type: 'string',
              enum: ['a', 'b', 'c'],
            },
            numberParam: {
              type: 'number',
              minimum: 0,
              maximum: 100,
            },
            stringParam: {
              type: 'string',
              minLength: 5,
              maxLength: 50,
              pattern: '^test',
            },
          },
        },
      };

      const summary = mapper.createValidationSummary(constrainedTool);

      expect(summary.enumParam.constraints).toMatchObject({
        enum: ['a', 'b', 'c'],
      });

      expect(summary.numberParam.constraints).toMatchObject({
        minimum: 0,
        maximum: 100,
      });

      expect(summary.stringParam.constraints).toMatchObject({
        minLength: 5,
        maxLength: 50,
        pattern: '^test',
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle circular JSON in string conversion', () => {
      const circularObj: any = { prop: 'value' };
      circularObj.self = circularObj;

      // JSON.stringify will throw on circular references
      const nodeParameters = {
        message: circularObj, // This should be converted to string
      };

      // The conversion should handle this gracefully
      expect(() => {
        mapper.mapN8nParametersToMCP(
          nodeParameters,
          mockN8nExecutionData,
          mockSimpleTool
        );
      }).toThrow(); // JSON.stringify will throw on circular reference
    });

    it('should handle very large numbers', () => {
      const largeNumberTool: MCPTool = {
        name: 'large_number',
        description: 'Test large numbers',
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'number' },
          },
          required: ['value'],
        },
      };

      const nodeParameters = {
        value: Number.MAX_SAFE_INTEGER,
      };

      const result = mapper.mapN8nParametersToMCP(nodeParameters, [], largeNumberTool);
      expect(result.arguments.value).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle special number values', () => {
      const specialNumberTool: MCPTool = {
        name: 'special_numbers',
        description: 'Test special number values',
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'number' },
          },
          required: ['value'],
        },
      };

      // Test NaN
      expect(() => {
        mapper.mapN8nParametersToMCP({ value: 'not-a-number' }, [], specialNumberTool);
      }).toThrow('Cannot convert');

      // Test Infinity
      const resultInf = mapper.mapN8nParametersToMCP(
        { value: Infinity },
        [],
        specialNumberTool
      );
      expect(resultInf.arguments.value).toBe(Infinity);
    });

    it('should handle empty and whitespace strings appropriately', () => {
      const result1 = mapper.mapN8nParametersToMCP(
        { message: '   ' }, // Whitespace should be preserved
        [],
        mockSimpleTool
      );
      expect(result1.arguments.message).toBe('   ');

      // Empty string should be skipped for optional parameters
      const optionalTool: MCPTool = {
        ...mockSimpleTool,
        inputSchema: {
          ...mockSimpleTool.inputSchema,
          required: [], // Make message optional
        },
      };

      const result2 = mapper.mapN8nParametersToMCP(
        { message: '' },
        [],
        optionalTool
      );
      expect(result2.arguments.message).toBeUndefined();
    });

    it('should handle boolean edge cases', () => {
      const booleanTool: MCPTool = {
        name: 'boolean_test',
        description: 'Test boolean conversion',
        inputSchema: {
          type: 'object',
          properties: {
            flag: { type: 'boolean' },
          },
          required: ['flag'],
        },
      };

      const testCases = [
        { input: 'TRUE', expected: true },
        { input: 'FALSE', expected: false },
        { input: 'YES', expected: true },
        { input: 'NO', expected: false },
        { input: '1', expected: true },
        { input: '0', expected: false },
        { input: 1, expected: true },
        { input: 0, expected: false },
        { input: [], expected: true }, // Truthy object
        { input: {}, expected: true }, // Truthy object
      ];

      testCases.forEach(({ input, expected }) => {
        const result = mapper.mapN8nParametersToMCP({ flag: input }, [], booleanTool);
        expect(result.arguments.flag).toBe(expected);
      });

      // Test invalid boolean conversion
      expect(() => {
        mapper.mapN8nParametersToMCP({ flag: 'invalid' }, [], booleanTool);
      }).toThrow('Cannot convert');
    });
  });
});