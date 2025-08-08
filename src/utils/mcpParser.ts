import {
  MCPTool,
  MCPToolSchema,
  MCPToolProperty,
  MCPServer,
  MCPCapabilities,
  ConversionResult,
} from '../types/mcpTypes.js';

export class MCPToolParser {
  /**
   * Parse and validate MCP server capabilities
   */
  parseServerCapabilities(capabilitiesData: unknown): MCPCapabilities {
    if (!capabilitiesData || typeof capabilitiesData !== 'object') {
      throw new Error('Invalid MCP capabilities data');
    }

    const capabilities = capabilitiesData as any;

    if (!capabilities.tools || !Array.isArray(capabilities.tools)) {
      throw new Error('MCP capabilities must include tools array');
    }

    return {
      tools: capabilities.tools.map((tool: unknown) => this.parseTool(tool)),
      resources: capabilities.resources || [],
      sampling: capabilities.sampling,
    };
  }

  /**
   * Parse individual MCP tool definition
   */
  parseTool(toolData: unknown): MCPTool {
    if (!toolData || typeof toolData !== 'object') {
      throw new Error('Invalid MCP tool data');
    }

    const tool = toolData as any;

    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('MCP tool must have a name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('MCP tool must have a description');
    }

    if (!tool.inputSchema) {
      throw new Error('MCP tool must have inputSchema');
    }

    return {
      name: tool.name,
      description: tool.description,
      inputSchema: this.parseToolSchema(tool.inputSchema),
    };
  }

  /**
   * Parse MCP tool input schema
   */
  parseToolSchema(schemaData: unknown): MCPToolSchema {
    if (!schemaData || typeof schemaData !== 'object') {
      throw new Error('Invalid MCP tool schema');
    }

    const schema = schemaData as any;

    if (schema.type !== 'object') {
      throw new Error('MCP tool schema must be of type "object"');
    }

    if (!schema.properties || typeof schema.properties !== 'object') {
      throw new Error('MCP tool schema must have properties');
    }

    return {
      type: 'object',
      properties: this.parseSchemaProperties(schema.properties),
      required: Array.isArray(schema.required) ? schema.required : [],
      additionalProperties: schema.additionalProperties !== false,
    };
  }

  /**
   * Parse schema properties recursively
   */
  private parseSchemaProperties(
    properties: Record<string, unknown>
  ): Record<string, MCPToolProperty> {
    const result: Record<string, MCPToolProperty> = {};

    for (const [name, propData] of Object.entries(properties)) {
      result[name] = this.parseToolProperty(propData);
    }

    return result;
  }

  /**
   * Parse individual tool property
   */
  private parseToolProperty(propData: unknown): MCPToolProperty {
    if (!propData || typeof propData !== 'object') {
      throw new Error('Invalid MCP tool property');
    }

    const prop = propData as any;

    if (!prop.type || !this.isValidPropertyType(prop.type)) {
      throw new Error(`Invalid MCP property type: ${prop.type}`);
    }

    const property: MCPToolProperty = {
      type: prop.type,
      description: prop.description,
      default: prop.default,
    };

    // Handle enum values
    if (prop.enum && Array.isArray(prop.enum)) {
      property.enum = prop.enum;
    }

    // Handle array items
    if (prop.type === 'array' && prop.items) {
      property.items = this.parseToolProperty(prop.items);
    }

    // Handle object properties
    if (prop.type === 'object' && prop.properties) {
      property.properties = this.parseSchemaProperties(prop.properties);
    }

    // Handle string constraints
    if (prop.type === 'string') {
      if (typeof prop.minLength === 'number') property.minLength = prop.minLength;
      if (typeof prop.maxLength === 'number') property.maxLength = prop.maxLength;
      if (typeof prop.pattern === 'string') property.pattern = prop.pattern;
      if (typeof prop.format === 'string') property.format = prop.format;
    }

    // Handle number constraints
    if (prop.type === 'number' || prop.type === 'integer') {
      if (typeof prop.minimum === 'number') property.minimum = prop.minimum;
      if (typeof prop.maximum === 'number') property.maximum = prop.maximum;
    }

    return property;
  }

  /**
   * Validate property type
   */
  private isValidPropertyType(type: unknown): type is MCPToolProperty['type'] {
    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
    return typeof type === 'string' && validTypes.includes(type);
  }

  /**
   * Validate parsed tool against MCP specification
   */
  validateTool(tool: MCPTool): ConversionResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate tool name
    if (!this.isValidNodeName(tool.name)) {
      errors.push(
        `Invalid tool name "${tool.name}". Must contain only alphanumeric characters, underscores, and hyphens.`
      );
    }

    // Validate description
    if (!tool.description || tool.description.length < 10) {
      warnings.push(
        'Tool description should be at least 10 characters long for better user experience'
      );
    }

    // Validate schema complexity
    const complexity = this.calculateSchemaComplexity(tool.inputSchema);
    if (complexity > 50) {
      warnings.push(
        'Tool schema is very complex. Consider simplifying for better user experience.'
      );
    }

    // Check for circular references
    if (this.hasCircularReferences(tool.inputSchema)) {
      errors.push('Tool schema contains circular references which are not supported');
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if tool name is valid for n8n node names
   */
  private isValidNodeName(name: string): boolean {
    // n8n node names must be alphanumeric with underscores and hyphens
    const nodeNameRegex = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
    return nodeNameRegex.test(name) && name.length >= 2 && name.length <= 50;
  }

  /**
   * Calculate schema complexity score
   */
  private calculateSchemaComplexity(schema: MCPToolSchema): number {
    let complexity = 0;

    const countProperties = (properties: Record<string, MCPToolProperty>): number => {
      let count = 0;
      for (const prop of Object.values(properties)) {
        count += 1;
        if (prop.type === 'object' && prop.properties) {
          count += countProperties(prop.properties);
        }
        if (prop.type === 'array' && prop.items?.type === 'object' && prop.items.properties) {
          count += countProperties(prop.items.properties);
        }
      }
      return count;
    };

    complexity = countProperties(schema.properties);
    return complexity;
  }

  /**
   * Check for circular references in schema
   */
  private hasCircularReferences(schema: MCPToolSchema, visited = new Set<string>()): boolean {
    const checkProperty = (prop: MCPToolProperty, path: string): boolean => {
      if (visited.has(path)) {
        return true;
      }

      visited.add(path);

      if (prop.type === 'object' && prop.properties) {
        for (const [name, subProp] of Object.entries(prop.properties)) {
          if (checkProperty(subProp, `${path}.${name}`)) {
            return true;
          }
        }
      }

      if (prop.type === 'array' && prop.items) {
        if (checkProperty(prop.items, `${path}[]`)) {
          return true;
        }
      }

      visited.delete(path);
      return false;
    };

    for (const [name, prop] of Object.entries(schema.properties)) {
      if (checkProperty(prop, name)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract tool metadata for indexing and search
   */
  extractToolMetadata(tool: MCPTool) {
    const metadata = {
      name: tool.name,
      description: tool.description,
      parameterCount: Object.keys(tool.inputSchema.properties).length,
      requiredParameters: tool.inputSchema.required?.length || 0,
      complexity: this.calculateSchemaComplexity(tool.inputSchema),
      tags: this.extractTags(tool),
    };

    return metadata;
  }

  /**
   * Extract semantic tags from tool for categorization
   */
  private extractTags(tool: MCPTool): string[] {
    const tags: string[] = [];
    const text = `${tool.name} ${tool.description}`.toLowerCase();

    // Common operation patterns
    const patterns = {
      'data-processing': ['process', 'transform', 'convert', 'parse', 'format'],
      api: ['api', 'request', 'http', 'rest', 'endpoint'],
      file: ['file', 'document', 'upload', 'download', 'attachment'],
      database: ['database', 'query', 'sql', 'data', 'record'],
      communication: ['email', 'message', 'notification', 'send', 'receive'],
      analysis: ['analyze', 'calculate', 'compute', 'statistics', 'report'],
      automation: ['automate', 'schedule', 'trigger', 'workflow', 'batch'],
    };

    for (const [category, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        tags.push(category);
      }
    }

    return tags;
  }
}
