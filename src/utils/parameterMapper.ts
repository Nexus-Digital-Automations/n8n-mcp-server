import {
  MCPTool,
  MCPToolProperty,
  MCPToolRequest,
  N8nExecutionData,
  MCPExecutionContext,
} from '../types/mcpTypes.js';

export class ParameterMapper {
  /**
   * Map n8n node parameters to MCP tool arguments
   */
  mapN8nParametersToMCP(
    nodeParameters: Record<string, unknown>,
    inputData: N8nExecutionData[],
    tool: MCPTool
  ): MCPToolRequest {
    const mappedArguments: Record<string, unknown> = {};

    // Process each parameter according to the tool schema
    for (const [paramName, paramSchema] of Object.entries(tool.inputSchema.properties)) {
      const nodeValue = nodeParameters[paramName];

      if (nodeValue !== undefined && nodeValue !== null && nodeValue !== '') {
        mappedArguments[paramName] = this.convertValueToMCPType(nodeValue, paramSchema, inputData);
      } else if (paramSchema.default !== undefined) {
        mappedArguments[paramName] = paramSchema.default;
      } else if (tool.inputSchema.required?.includes(paramName)) {
        throw new Error(`Required parameter '${paramName}' is missing or empty`);
      }
    }

    // Validate mapped arguments against schema
    this.validateMappedArguments(mappedArguments, tool);

    return {
      name: tool.name,
      arguments: mappedArguments,
    };
  }

  /**
   * Convert n8n value to appropriate MCP type
   */
  private convertValueToMCPType(
    value: unknown,
    paramSchema: MCPToolProperty,
    inputData: N8nExecutionData[]
  ): unknown {
    // Handle expression resolution first
    const resolvedValue = this.resolveExpressions(value, inputData);

    switch (paramSchema.type) {
      case 'string':
        return this.convertToString(resolvedValue, paramSchema);

      case 'number':
        return this.convertToNumber(resolvedValue, paramSchema);

      case 'integer':
        return this.convertToInteger(resolvedValue, paramSchema);

      case 'boolean':
        return this.convertToBoolean(resolvedValue);

      case 'array':
        return this.convertToArray(resolvedValue, paramSchema, inputData);

      case 'object':
        return this.convertToObject(resolvedValue, paramSchema);

      default:
        return resolvedValue;
    }
  }

  /**
   * Resolve n8n expressions in values
   */
  private resolveExpressions(value: unknown, inputData: N8nExecutionData[]): unknown {
    if (typeof value === 'string') {
      // Handle simple variable references like {{ $json.field }}
      const expressionRegex = /\{\{\s*\$json\.([^}]+)\s*\}\}/g;

      return value.replace(expressionRegex, (match, fieldPath) => {
        const firstItem = inputData[0];
        if (firstItem && firstItem.json) {
          const fieldValue = this.getNestedValue(firstItem.json, fieldPath);
          return fieldValue !== undefined ? String(fieldValue) : match;
        }
        return match;
      });
    }

    return value;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: any, key) => {
      return current && typeof current === 'object' && key in current
        ? current[key]
        : undefined;
    }, obj as any);
  }

  /**
   * Convert value to string with validation
   */
  private convertToString(value: unknown, schema: MCPToolProperty): string {
    let stringValue: string;

    if (typeof value === 'string') {
      stringValue = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      stringValue = String(value);
    } else if (value === null || value === undefined) {
      stringValue = '';
    } else if (typeof value === 'object') {
      stringValue = JSON.stringify(value);
    } else {
      stringValue = String(value);
    }

    // Validate string constraints
    if (schema.minLength !== undefined && stringValue.length < schema.minLength) {
      throw new Error(
        `String value too short. Minimum length: ${schema.minLength}, got: ${stringValue.length}`
      );
    }

    if (schema.maxLength !== undefined && stringValue.length > schema.maxLength) {
      throw new Error(
        `String value too long. Maximum length: ${schema.maxLength}, got: ${stringValue.length}`
      );
    }

    if (schema.pattern && !new RegExp(schema.pattern).test(stringValue)) {
      throw new Error(`String value does not match required pattern: ${schema.pattern}`);
    }

    if (schema.enum && !schema.enum.includes(stringValue)) {
      throw new Error(
        `Invalid enum value. Expected one of: ${schema.enum.join(', ')}, got: ${stringValue}`
      );
    }

    return stringValue;
  }

  /**
   * Convert value to number with validation
   */
  private convertToNumber(value: unknown, schema: MCPToolProperty): number {
    let numberValue: number;

    if (typeof value === 'number') {
      numberValue = value;
    } else if (typeof value === 'string') {
      numberValue = parseFloat(value);
      if (isNaN(numberValue)) {
        throw new Error(`Cannot convert '${value}' to number`);
      }
    } else if (typeof value === 'boolean') {
      numberValue = value ? 1 : 0;
    } else {
      throw new Error(`Cannot convert ${typeof value} to number`);
    }

    // Validate number constraints
    if (schema.minimum !== undefined && numberValue < schema.minimum) {
      throw new Error(`Number too small. Minimum: ${schema.minimum}, got: ${numberValue}`);
    }

    if (schema.maximum !== undefined && numberValue > schema.maximum) {
      throw new Error(`Number too large. Maximum: ${schema.maximum}, got: ${numberValue}`);
    }

    if (schema.enum && !schema.enum.includes(numberValue)) {
      throw new Error(
        `Invalid enum value. Expected one of: ${schema.enum.join(', ')}, got: ${numberValue}`
      );
    }

    return numberValue;
  }

  /**
   * Convert value to integer with validation
   */
  private convertToInteger(value: unknown, schema: MCPToolProperty): number {
    const numberValue = this.convertToNumber(value, schema);

    if (!Number.isInteger(numberValue)) {
      throw new Error(`Value must be an integer, got: ${numberValue}`);
    }

    return numberValue;
  }

  /**
   * Convert value to boolean
   */
  private convertToBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
        return true;
      }
      if (
        lowerValue === 'false' ||
        lowerValue === '0' ||
        lowerValue === 'no' ||
        lowerValue === ''
      ) {
        return false;
      }
      throw new Error(`Cannot convert '${value}' to boolean`);
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (value === null || value === undefined) {
      return false;
    }

    return Boolean(value);
  }

  /**
   * Convert value to array with validation
   */
  private convertToArray(
    value: unknown,
    schema: MCPToolProperty,
    inputData: N8nExecutionData[]
  ): unknown[] {
    let arrayValue: unknown[];

    if (Array.isArray(value)) {
      arrayValue = value;
    } else if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          arrayValue = parsed;
        } else {
          // Treat as single-item array
          arrayValue = [parsed];
        }
      } catch {
        // Treat string as single-item array
        arrayValue = [value];
      }
    } else if (value === null || value === undefined) {
      arrayValue = [];
    } else {
      // Wrap single value in array
      arrayValue = [value];
    }

    // Convert array items if schema is provided
    if (schema.items) {
      arrayValue = arrayValue.map(item =>
        this.convertValueToMCPType(item, schema.items!, inputData)
      );
    }

    return arrayValue;
  }

  /**
   * Convert value to object with validation
   */
  private convertToObject(value: unknown, schema: MCPToolProperty): Record<string, unknown> {
    let objectValue: Record<string, unknown>;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      objectValue = value as Record<string, unknown>;
    } else if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          objectValue = parsed;
        } else {
          throw new Error('Parsed value is not an object');
        }
      } catch {
        throw new Error(`Cannot parse '${value}' as JSON object`);
      }
    } else if (value === null || value === undefined) {
      objectValue = {};
    } else {
      throw new Error(`Cannot convert ${typeof value} to object`);
    }

    // Validate object properties if schema is provided
    if (schema.properties) {
      const validatedObject: Record<string, unknown> = {};

      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const propValue = objectValue[propName];
        if (propValue !== undefined) {
          validatedObject[propName] = this.convertValueToMCPType(propValue, propSchema, []);
        }
      }

      objectValue = validatedObject;
    }

    return objectValue;
  }

  /**
   * Validate mapped arguments against tool schema
   */
  private validateMappedArguments(mappedArgs: Record<string, unknown>, tool: MCPTool): void {
    const schema = tool.inputSchema;

    // Check required parameters
    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in mappedArgs) || mappedArgs[requiredParam] === undefined) {
          throw new Error(`Required parameter '${requiredParam}' is missing`);
        }
      }
    }

    // Check for unexpected parameters
    if (!schema.additionalProperties) {
      const allowedParams = new Set(Object.keys(schema.properties));
      for (const argName of Object.keys(mappedArgs)) {
        if (!allowedParams.has(argName)) {
          throw new Error(
            `Unexpected parameter '${argName}'. Tool does not accept this parameter.`
          );
        }
      }
    }
  }

  /**
   * Map MCP response back to n8n execution data
   */
  mapMCPResponseToN8n(mcpResponse: any, _context: MCPExecutionContext): N8nExecutionData[] {
    const outputData: N8nExecutionData[] = [];

    try {
      // Handle different response formats
      if (mcpResponse.content && Array.isArray(mcpResponse.content)) {
        // MCP standard response format
        for (let i = 0; i < mcpResponse.content.length; i++) {
          const content = mcpResponse.content[i];
          const executionData: N8nExecutionData = {
            json: this.processContentItem(content, i),
            pairedItem: { item: 0 },
          };

          // Handle binary data
          if (content.type === 'image' && content.data) {
            executionData.binary = {
              data: {
                data: content.data,
                mimeType: content.mimeType || 'image/png',
                fileName: `mcp_response_${i}.${this.getFileExtension(content.mimeType)}`,
              },
            };
          }

          outputData.push(executionData);
        }
      } else if (typeof mcpResponse === 'object' && mcpResponse !== null) {
        // Direct object response
        outputData.push({
          json: mcpResponse,
          pairedItem: { item: 0 },
        });
      } else {
        // Simple value response
        outputData.push({
          json: { result: mcpResponse },
          pairedItem: { item: 0 },
        });
      }

      // Ensure we always return at least one item
      if (outputData.length === 0) {
        outputData.push({
          json: { message: 'MCP tool executed successfully with no output' },
          pairedItem: { item: 0 },
        });
      }
    } catch (error) {
      // Return error as output data
      outputData.push({
        json: {
          error: true,
          message: error instanceof Error ? error.message : 'Unknown error processing MCP response',
          originalResponse: mcpResponse,
        },
        pairedItem: { item: 0 },
      });
    }

    return outputData;
  }

  /**
   * Process individual MCP content item
   */
  private processContentItem(content: any, index: number): Record<string, unknown> {
    const result: Record<string, unknown> = {
      type: content.type || 'unknown',
      index,
    };

    switch (content.type) {
      case 'text':
        result.text = content.text || '';
        break;

      case 'image':
        result.mimeType = content.mimeType || 'image/png';
        result.hasData = Boolean(content.data);
        break;

      case 'resource':
        result.uri = content.uri;
        result.mimeType = content.mimeType;
        break;

      default:
        // Copy all properties for unknown types
        Object.assign(result, content);
    }

    return result;
  }

  /**
   * Get file extension from MIME type
   */
  private getFileExtension(mimeType?: string): string {
    if (!mimeType) return 'bin';

    const extensions: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
      'text/plain': 'txt',
      'application/json': 'json',
      'application/xml': 'xml',
      'text/html': 'html',
      'application/pdf': 'pdf',
    };

    return extensions[mimeType] || 'bin';
  }

  /**
   * Create parameter validation summary
   */
  createValidationSummary(tool: MCPTool): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const [paramName, paramSchema] of Object.entries(tool.inputSchema.properties)) {
      summary[paramName] = {
        type: paramSchema.type,
        required: tool.inputSchema.required?.includes(paramName) || false,
        hasDefault: paramSchema.default !== undefined,
        constraints: this.getParameterConstraints(paramSchema),
      };
    }

    return summary;
  }

  /**
   * Get parameter constraints for validation summary
   */
  private getParameterConstraints(schema: MCPToolProperty): Record<string, unknown> {
    const constraints: Record<string, unknown> = {};

    if (schema.enum) constraints.enum = schema.enum;
    if (schema.minimum !== undefined) constraints.minimum = schema.minimum;
    if (schema.maximum !== undefined) constraints.maximum = schema.maximum;
    if (schema.minLength !== undefined) constraints.minLength = schema.minLength;
    if (schema.maxLength !== undefined) constraints.maxLength = schema.maxLength;
    if (schema.pattern) constraints.pattern = schema.pattern;

    return constraints;
  }
}
