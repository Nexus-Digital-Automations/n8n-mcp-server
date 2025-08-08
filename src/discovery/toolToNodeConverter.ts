/**
 * Tool-to-Node Converter
 * 
 * Converts MCP tool capabilities to n8n node type descriptions dynamically.
 * Supports schema mapping, type conversion, and node metadata generation.
 */

import { z } from 'zod';
import { MCPToolCapability } from './mcpServerRegistry.js';

/**
 * n8n Node Property Types
 */
export enum N8nPropertyType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  COLLECTION = 'collection',
  OPTIONS = 'options',
  MULTI_OPTIONS = 'multiOptions',
  JSON = 'json',
  DATETIME = 'dateTime',
  COLOR = 'color',
  HIDDEN = 'hidden',
  NOTICE = 'notice',
  CREDENTIALS = 'credentials',
  RESOURCE_LOCATOR = 'resourceLocator',
  CURATED_LIST = 'curatedList',
}

/**
 * n8n Node Property Definition
 */
export interface N8nNodeProperty {
  displayName: string;
  name: string;
  type: N8nPropertyType;
  default?: any;
  description?: string;
  required?: boolean;
  options?: Array<{ name: string; value: any; description?: string }>;
  placeholder?: string;
  hint?: string;
  routing?: {
    send?: {
      type?: string;
      property?: string;
      value?: string;
    };
    request?: {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: any;
    };
  };
  displayOptions?: {
    show?: Record<string, any[]>;
    hide?: Record<string, any[]>;
  };
  typeOptions?: {
    multipleValues?: boolean;
    multipleValueButtonText?: string;
    rows?: number;
    editor?: string;
    loadOptions?: {
      routing?: {
        request?: {
          method?: string;
          url?: string;
        };
        output?: {
          postReceive?: Array<{
            type: string;
            properties: Record<string, string>;
          }>;
        };
      };
    };
  };
}

/**
 * n8n Node Type Description
 */
export interface N8nNodeTypeDescription {
  displayName: string;
  name: string;
  icon: string;
  group: string[];
  version: number | number[];
  description: string;
  defaults: {
    name: string;
  };
  inputs: string[];
  outputs: string[];
  credentials?: Array<{
    name: string;
    required: boolean;
    displayOptions?: {
      show?: Record<string, any[]>;
    };
  }>;
  properties: N8nNodeProperty[];
  codex?: {
    categories?: string[];
    subcategories?: Record<string, string[]>;
    resources?: {
      primaryDocumentation?: Array<{
        url: string;
      }>;
      credentialDocumentation?: Array<{
        url: string;
      }>;
    };
    alias?: string[];
  };
  requestDefaults?: {
    baseURL?: string;
    headers?: Record<string, string>;
  };
  routing?: {
    request?: {
      method?: string;
      url?: string;
    };
  };
}

/**
 * Schema type mapping configuration
 */
interface SchemaTypeMapping {
  type: string;
  format?: string;
  enum?: any[];
  items?: any;
  properties?: Record<string, any>;
  additionalProperties?: boolean;
}

/**
 * Conversion context for maintaining state during conversion
 */
export interface ConversionContext {
  serverId: string;
  toolName: string;
  nodeNamePrefix?: string;
  defaultCredentials?: string;
  customProperties?: Partial<N8nNodeProperty>[];
  routing?: {
    baseURL?: string;
    defaultHeaders?: Record<string, string>;
  };
}

/**
 * Tool-to-Node Converter
 * 
 * Converts MCP tool definitions to n8n node type descriptions
 */
export class ToolToNodeConverter {
  private static readonly DEFAULT_NODE_VERSION = 1;
  private static readonly DEFAULT_NODE_GROUP = ['transform'];
  private static readonly DEFAULT_NODE_ICON = 'fa:cogs';

  /**
   * Convert an MCP tool to an n8n node type description
   */
  static convertToolToNode(
    tool: MCPToolCapability,
    context: ConversionContext
  ): N8nNodeTypeDescription {
    const nodeName = this.generateNodeName(tool.name, context);
    const displayName = this.generateDisplayName(tool.name, context.serverId);

    const nodeDescription: N8nNodeTypeDescription = {
      displayName,
      name: nodeName,
      icon: this.generateNodeIcon(tool, context),
      group: this.generateNodeGroup(tool, context),
      version: this.generateNodeVersion(tool, context),
      description: this.generateNodeDescription(tool, context),
      defaults: {
        name: displayName,
      },
      inputs: ['main'],
      outputs: ['main'],
      properties: this.convertSchemaToProperties(tool, context),
    };

    // Add credentials if specified
    const credentials = this.generateCredentials(tool, context);
    if (credentials.length > 0) {
      nodeDescription.credentials = credentials;
    }

    // Add routing configuration
    const routing = this.generateRouting(tool, context);
    if (routing) {
      nodeDescription.routing = routing;
    }

    // Add request defaults
    const requestDefaults = this.generateRequestDefaults(tool, context);
    if (requestDefaults) {
      nodeDescription.requestDefaults = requestDefaults;
    }

    // Add codex information for better discovery
    nodeDescription.codex = this.generateCodex(tool, context);

    return nodeDescription;
  }

  /**
   * Convert multiple tools to node type descriptions
   */
  static convertToolsToNodes(
    tools: MCPToolCapability[],
    context: Omit<ConversionContext, 'toolName'>
  ): N8nNodeTypeDescription[] {
    return tools.map(tool => 
      this.convertToolToNode(tool, { ...context, toolName: tool.name })
    );
  }

  /**
   * Generate node name from tool name
   */
  private static generateNodeName(toolName: string, context: ConversionContext): string {
    const prefix = context.nodeNamePrefix || context.serverId;
    const sanitizedToolName = toolName
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
    
    return `${prefix}_${sanitizedToolName}`.toLowerCase();
  }

  /**
   * Generate display name for the node
   */
  private static generateDisplayName(toolName: string, serverId: string): string {
    const formattedToolName = toolName
      .split(/[-_\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    const formattedServerId = serverId
      .split(/[-_\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    return `${formattedServerId}: ${formattedToolName}`;
  }

  /**
   * Generate node icon based on tool characteristics
   */
  private static generateNodeIcon(tool: MCPToolCapability, context: ConversionContext): string {
    // Determine icon based on tool name patterns and annotations
    const toolName = tool.name.toLowerCase();
    const isReadOnly = tool.annotations?.readOnlyHint === true;
    const isDestructive = tool.annotations?.destructiveHint === true;
    
    // Icon mapping based on common tool patterns
    if (toolName.includes('read') || toolName.includes('get') || toolName.includes('fetch')) {
      return 'fa:eye';
    } else if (toolName.includes('write') || toolName.includes('create') || toolName.includes('add')) {
      return 'fa:plus';
    } else if (toolName.includes('update') || toolName.includes('edit') || toolName.includes('modify')) {
      return 'fa:edit';
    } else if (toolName.includes('delete') || toolName.includes('remove') || isDestructive) {
      return 'fa:trash';
    } else if (toolName.includes('list') || toolName.includes('search') || toolName.includes('find')) {
      return 'fa:list';
    } else if (toolName.includes('execute') || toolName.includes('run') || toolName.includes('call')) {
      return 'fa:play';
    } else if (isReadOnly) {
      return 'fa:eye';
    }
    
    return this.DEFAULT_NODE_ICON;
  }

  /**
   * Generate node group based on tool characteristics
   */
  private static generateNodeGroup(tool: MCPToolCapability, context: ConversionContext): string[] {
    const toolName = tool.name.toLowerCase();
    const isOpenWorld = tool.annotations?.openWorldHint !== false;
    
    const groups: string[] = [];
    
    // Primary group based on functionality
    if (toolName.includes('trigger') || toolName.includes('webhook') || toolName.includes('listen')) {
      groups.push('trigger');
    } else if (isOpenWorld || toolName.includes('api') || toolName.includes('http') || toolName.includes('fetch')) {
      groups.push('input');
    } else {
      groups.push('transform');
    }
    
    // Secondary groups based on MCP server type
    if (context.serverId.includes('database') || context.serverId.includes('db')) {
      groups.push('database');
    } else if (context.serverId.includes('file') || context.serverId.includes('storage')) {
      groups.push('files');
    } else if (context.serverId.includes('ai') || context.serverId.includes('llm')) {
      groups.push('ai');
    }
    
    return groups.length > 0 ? groups : this.DEFAULT_NODE_GROUP;
  }

  /**
   * Generate node version
   */
  private static generateNodeVersion(tool: MCPToolCapability, context: ConversionContext): number {
    return this.DEFAULT_NODE_VERSION;
  }

  /**
   * Generate node description
   */
  private static generateNodeDescription(tool: MCPToolCapability, context: ConversionContext): string {
    let description = tool.description || `Execute ${tool.name} from ${context.serverId} MCP server`;
    
    // Add annotation information
    const annotations: string[] = [];
    if (tool.annotations?.readOnlyHint === true) {
      annotations.push('read-only');
    }
    if (tool.annotations?.destructiveHint === true) {
      annotations.push('destructive');
    }
    if (tool.annotations?.idempotentHint === true) {
      annotations.push('idempotent');
    }
    if (tool.annotations?.openWorldHint === false) {
      annotations.push('isolated');
    }
    
    if (annotations.length > 0) {
      description += ` (${annotations.join(', ')})`;
    }
    
    return description;
  }

  /**
   * Convert JSON schema to n8n node properties
   */
  private static convertSchemaToProperties(
    tool: MCPToolCapability,
    context: ConversionContext
  ): N8nNodeProperty[] {
    const properties: N8nNodeProperty[] = [];
    
    // Add custom properties first
    if (context.customProperties) {
      properties.push(...context.customProperties.map(prop => ({ ...prop } as N8nNodeProperty)));
    }
    
    // Convert tool schema to properties
    if (tool.inputSchema && typeof tool.inputSchema === 'object') {
      const schemaProperties = this.convertSchemaObject(tool.inputSchema, tool.name);
      properties.push(...schemaProperties);
    }
    
    // Add operation property to identify the tool
    properties.unshift({
      displayName: 'Operation',
      name: 'operation',
      type: N8nPropertyType.HIDDEN,
      default: tool.name,
    });
    
    return properties;
  }

  /**
   * Convert a JSON schema object to n8n properties
   */
  private static convertSchemaObject(schema: any, baseName: string, prefix: string = ''): N8nNodeProperty[] {
    const properties: N8nNodeProperty[] = [];
    
    if (!schema || typeof schema !== 'object') {
      return properties;
    }
    
    // Handle schema properties
    if (schema.properties && typeof schema.properties === 'object') {
      const required = Array.isArray(schema.required) ? schema.required : [];
      
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const fullName = prefix ? `${prefix}.${propName}` : propName;
        const property = this.convertSchemaProperty(
          propName,
          propSchema as any,
          required.includes(propName),
          fullName
        );
        
        if (property) {
          properties.push(property);
        }
      }
    }
    
    // Handle array items
    if (schema.type === 'array' && schema.items) {
      const itemProperty = this.convertSchemaProperty(
        'items',
        schema.items,
        false,
        `${prefix}[]`
      );
      
      if (itemProperty) {
        itemProperty.typeOptions = {
          multipleValues: true,
          multipleValueButtonText: 'Add Item',
        };
        properties.push(itemProperty);
      }
    }
    
    return properties;
  }

  /**
   * Convert a single schema property to n8n property
   */
  private static convertSchemaProperty(
    name: string,
    schema: SchemaTypeMapping,
    required: boolean,
    fullName: string
  ): N8nNodeProperty | null {
    if (!schema || typeof schema !== 'object') {
      return null;
    }
    
    const displayName = this.generatePropertyDisplayName(name);
    const property: N8nNodeProperty = {
      displayName,
      name: fullName,
      type: this.mapSchemaTypeToN8nType(schema),
      required,
    };
    
    // Add description
    if (typeof schema.description === 'string') {
      property.description = schema.description;
    }
    
    // Add default value
    if (schema.default !== undefined) {
      property.default = schema.default;
    }
    
    // Handle specific types
    switch (schema.type) {
      case 'string':
        this.handleStringProperty(property, schema);
        break;
      case 'number':
      case 'integer':
        this.handleNumberProperty(property, schema);
        break;
      case 'boolean':
        this.handleBooleanProperty(property, schema);
        break;
      case 'object':
        this.handleObjectProperty(property, schema);
        break;
      case 'array':
        this.handleArrayProperty(property, schema);
        break;
    }
    
    // Handle enum values
    if (Array.isArray(schema.enum)) {
      property.type = N8nPropertyType.OPTIONS;
      property.options = schema.enum.map(value => ({
        name: String(value),
        value,
      }));
    }
    
    return property;
  }

  /**
   * Map JSON schema type to n8n property type
   */
  private static mapSchemaTypeToN8nType(schema: SchemaTypeMapping): N8nPropertyType {
    if (Array.isArray(schema.enum)) {
      return N8nPropertyType.OPTIONS;
    }
    
    switch (schema.type) {
      case 'string':
        if (schema.format === 'date-time') return N8nPropertyType.DATETIME;
        if (schema.format === 'color') return N8nPropertyType.COLOR;
        return N8nPropertyType.STRING;
      case 'number':
      case 'integer':
        return N8nPropertyType.NUMBER;
      case 'boolean':
        return N8nPropertyType.BOOLEAN;
      case 'object':
        return N8nPropertyType.JSON;
      case 'array':
        return N8nPropertyType.JSON; // Will be handled specially
      default:
        return N8nPropertyType.STRING;
    }
  }

  /**
   * Generate display name for property
   */
  private static generatePropertyDisplayName(name: string): string {
    return name
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Handle string property specifics
   */
  private static handleStringProperty(property: N8nNodeProperty, schema: SchemaTypeMapping): void {
    if (schema.format) {
      switch (schema.format) {
        case 'email':
          property.placeholder = 'user@example.com';
          break;
        case 'uri':
        case 'url':
          property.placeholder = 'https://example.com';
          break;
        case 'password':
          property.typeOptions = { password: true };
          break;
      }
    }
    
    if (typeof schema.pattern === 'string') {
      property.hint = `Must match pattern: ${schema.pattern}`;
    }
  }

  /**
   * Handle number property specifics
   */
  private static handleNumberProperty(property: N8nNodeProperty, schema: SchemaTypeMapping): void {
    if (typeof schema.minimum === 'number') {
      property.typeOptions = { ...property.typeOptions, minValue: schema.minimum };
    }
    
    if (typeof schema.maximum === 'number') {
      property.typeOptions = { ...property.typeOptions, maxValue: schema.maximum };
    }
    
    if (schema.type === 'integer') {
      property.typeOptions = { ...property.typeOptions, numberPrecision: 0 };
    }
  }

  /**
   * Handle boolean property specifics
   */
  private static handleBooleanProperty(property: N8nNodeProperty, schema: SchemaTypeMapping): void {
    // Booleans are straightforward in n8n
    if (property.default === undefined) {
      property.default = false;
    }
  }

  /**
   * Handle object property specifics
   */
  private static handleObjectProperty(property: N8nNodeProperty, schema: SchemaTypeMapping): void {
    property.type = N8nPropertyType.JSON;
    property.typeOptions = {
      rows: 4,
      editor: 'json',
    };
    
    if (schema.properties) {
      property.hint = `Object with properties: ${Object.keys(schema.properties).join(', ')}`;
    }
  }

  /**
   * Handle array property specifics
   */
  private static handleArrayProperty(property: N8nNodeProperty, schema: SchemaTypeMapping): void {
    if (schema.items) {
      // If items have a simple type, use multiOptions or collection
      const itemsSchema = schema.items as SchemaTypeMapping;
      
      if (Array.isArray(itemsSchema.enum)) {
        property.type = N8nPropertyType.MULTI_OPTIONS;
        property.options = itemsSchema.enum.map(value => ({
          name: String(value),
          value,
        }));
      } else {
        property.type = N8nPropertyType.JSON;
        property.typeOptions = {
          multipleValues: true,
          multipleValueButtonText: 'Add Item',
          rows: 2,
          editor: 'json',
        };
      }
    } else {
      property.type = N8nPropertyType.JSON;
      property.typeOptions = {
        rows: 3,
        editor: 'json',
      };
    }
  }

  /**
   * Generate credentials configuration
   */
  private static generateCredentials(
    tool: MCPToolCapability,
    context: ConversionContext
  ): Array<{ name: string; required: boolean }> {
    const credentials = [];
    
    if (context.defaultCredentials) {
      credentials.push({
        name: context.defaultCredentials,
        required: true,
      });
    }
    
    return credentials;
  }

  /**
   * Generate routing configuration
   */
  private static generateRouting(
    tool: MCPToolCapability,
    context: ConversionContext
  ): any | null {
    if (!context.routing) {
      return null;
    }
    
    return {
      request: {
        method: 'POST',
        url: '/mcp/call',
        headers: {
          'Content-Type': 'application/json',
          ...context.routing.defaultHeaders,
        },
        body: {
          serverId: context.serverId,
          toolName: tool.name,
          parameters: '={{$json}}',
        },
      },
    };
  }

  /**
   * Generate request defaults
   */
  private static generateRequestDefaults(
    tool: MCPToolCapability,
    context: ConversionContext
  ): any | null {
    if (!context.routing?.baseURL) {
      return null;
    }
    
    return {
      baseURL: context.routing.baseURL,
      headers: context.routing.defaultHeaders || {},
    };
  }

  /**
   * Generate codex information for better node discovery
   */
  private static generateCodex(
    tool: MCPToolCapability,
    context: ConversionContext
  ): any {
    const categories = ['MCP Tools'];
    const toolName = tool.name.toLowerCase();
    
    // Add categories based on tool characteristics
    if (toolName.includes('database') || toolName.includes('db') || toolName.includes('sql')) {
      categories.push('Database');
    } else if (toolName.includes('file') || toolName.includes('storage') || toolName.includes('fs')) {
      categories.push('Files');
    } else if (toolName.includes('http') || toolName.includes('api') || toolName.includes('rest')) {
      categories.push('Communication');
    } else if (toolName.includes('ai') || toolName.includes('llm') || toolName.includes('ml')) {
      categories.push('AI');
    }
    
    return {
      categories,
      subcategories: {
        'MCP Tools': [context.serverId],
      },
      alias: [tool.name],
    };
  }
}