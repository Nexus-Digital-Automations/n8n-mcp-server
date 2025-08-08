import {
  MCPTool,
  MCPToolProperty,
  N8nNodeTypeDescription,
  N8nNodeProperty,
  N8nPropertyType,
  MCPConversionConfig,
  ConversionResult,
  ConversionContext,
} from '../types/mcpTypes.js';

export class N8nNodeGenerator {
  private readonly defaultConfig: MCPConversionConfig = {
    nodeNamePrefix: 'MCP',
    defaultIcon: 'fa:cog',
    defaultGroup: ['transform'],
    credentialName: 'mcpServerApi',
    enableBinaryData: true,
    enableResourceAccess: true,
    typeMapping: {
      string: 'string',
      number: 'number',
      integer: 'number',
      boolean: 'boolean',
      array: 'json',
      object: 'json',
    },
  };

  /**
   * Generate n8n node definition from MCP tool
   */
  generateNodeDefinition(context: ConversionContext): ConversionResult {
    const { tool, config } = context;
    const mergedConfig = { ...this.defaultConfig, ...config };

    try {
      const nodeDefinition = this.createNodeDefinition(tool, mergedConfig);
      const validation = this.validateNodeDefinition(nodeDefinition);

      return {
        success: validation.success,
        nodeDefinition: validation.success ? nodeDefinition : undefined,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error during node generation'],
      };
    }
  }

  /**
   * Create the complete n8n node definition
   */
  private createNodeDefinition(tool: MCPTool, config: MCPConversionConfig): N8nNodeTypeDescription {
    const nodeName = this.generateNodeName(tool.name, config.nodeNamePrefix);
    const displayName = this.generateDisplayName(tool.name, config.nodeNamePrefix);

    return {
      displayName,
      name: nodeName,
      icon: config.defaultIcon || this.defaultConfig.defaultIcon!,
      group: config.defaultGroup || this.defaultConfig.defaultGroup!,
      version: [1],
      description: tool.description,
      defaults: {
        name: displayName,
      },
      inputs: ['main'],
      outputs: ['main'],
      credentials: config.credentialName
        ? [
            {
              name: config.credentialName,
              required: true,
            },
          ]
        : undefined,
      properties: this.generateNodeProperties(tool, config),
    };
  }

  /**
   * Generate node properties from MCP tool schema
   */
  private generateNodeProperties(tool: MCPTool, config: MCPConversionConfig): N8nNodeProperty[] {
    const properties: N8nNodeProperty[] = [];

    // Add operation selector if there are multiple operations
    if (this.hasMultipleOperations(tool)) {
      properties.push(this.createOperationProperty());
    }

    // Convert MCP tool parameters to n8n properties
    for (const [paramName, paramDef] of Object.entries(tool.inputSchema.properties)) {
      const property = this.convertParameterToProperty(
        paramName,
        paramDef,
        tool.inputSchema.required || [],
        config
      );
      if (property) {
        properties.push(property);
      }
    }

    // Add additional options
    if (config.enableBinaryData) {
      properties.push(this.createBinaryDataProperty());
    }

    if (config.enableResourceAccess) {
      properties.push(this.createResourceAccessProperty());
    }

    return properties;
  }

  /**
   * Convert MCP parameter to n8n property
   */
  private convertParameterToProperty(
    name: string,
    param: MCPToolProperty,
    required: string[],
    config: MCPConversionConfig
  ): N8nNodeProperty | null {
    const isRequired = required.includes(name);
    const displayName = this.formatDisplayName(name);

    // Handle enum types as options
    if (param.enum && param.enum.length > 0) {
      return {
        displayName,
        name,
        type: 'options',
        options: param.enum.map(value => ({
          name: this.formatOptionName(value),
          value,
        })),
        default: param.default !== undefined ? param.default : param.enum[0],
        description: param.description,
        required: isRequired,
      };
    }

    // Map MCP types to n8n types
    const n8nType = this.mapMCPTypeToN8N(param.type, config);

    const property: N8nNodeProperty = {
      displayName,
      name,
      type: n8nType,
      description: param.description,
      required: isRequired,
    };

    // Add default value if provided
    if (param.default !== undefined) {
      property.default = param.default;
    }

    // Add type-specific options
    this.addTypeSpecificOptions(property, param);

    return property;
  }

  /**
   * Map MCP property type to n8n property type
   */
  private mapMCPTypeToN8N(
    mcpType: MCPToolProperty['type'],
    config: MCPConversionConfig
  ): N8nPropertyType {
    const mapping = config.typeMapping || this.defaultConfig.typeMapping!;
    return (mapping[mcpType] as N8nPropertyType) || 'string';
  }

  /**
   * Add type-specific options to n8n property
   */
  private addTypeSpecificOptions(property: N8nNodeProperty, param: MCPToolProperty): void {
    switch (param.type) {
      case 'string':
        if (param.format === 'password') {
          property.typeOptions = { password: true };
        }
        if (param.format === 'email') {
          property.placeholder = 'user@example.com';
        }
        if (param.format === 'uri') {
          property.placeholder = 'https://example.com';
        }
        if (param.minLength || param.maxLength) {
          property.typeOptions = {
            ...property.typeOptions,
            minLength: param.minLength,
            maxLength: param.maxLength,
          };
        }
        if (param.pattern) {
          property.typeOptions = {
            ...property.typeOptions,
            pattern: param.pattern,
          };
        }
        break;

      case 'number':
      case 'integer':
        if (param.minimum !== undefined || param.maximum !== undefined) {
          property.typeOptions = {
            minValue: param.minimum,
            maxValue: param.maximum,
          };
        }
        break;

      case 'array':
        property.type = 'json';
        property.typeOptions = {
          rows: 4,
        };
        if (param.items) {
          property.description =
            `${property.description || ''} (Array of ${param.items.type})`.trim();
        }
        break;

      case 'object':
        property.type = 'json';
        property.typeOptions = {
          rows: 6,
        };
        if (param.properties) {
          const propNames = Object.keys(param.properties);
          if (propNames.length <= 3) {
            property.description =
              `${property.description || ''} (Object with: ${propNames.join(', ')})`.trim();
          }
        }
        break;
    }
  }

  /**
   * Generate valid n8n node name
   */
  private generateNodeName(toolName: string, prefix?: string): string {
    // Convert to camelCase and ensure valid identifier
    let name = toolName
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/^[0-9]/, 'n$&')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    // Convert to camelCase
    name = name.replace(/_(.)/g, (_, char) => char.toUpperCase());

    // Add prefix if provided
    if (prefix) {
      name = `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    }

    return name;
  }

  /**
   * Generate display name for node
   */
  private generateDisplayName(toolName: string, prefix?: string): string {
    let displayName = toolName.replace(/[_-]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

    if (prefix) {
      displayName = `${prefix} ${displayName}`;
    }

    return displayName;
  }

  /**
   * Format parameter name for display
   */
  private formatDisplayName(paramName: string): string {
    return paramName.replace(/[_-]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  }

  /**
   * Format option name for display
   */
  private formatOptionName(value: unknown): string {
    if (typeof value === 'string') {
      return value.replace(/[_-]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    }
    return String(value);
  }

  /**
   * Check if tool has multiple operations (placeholder for future enhancement)
   */
  private hasMultipleOperations(tool: MCPTool): boolean {
    // For now, assume single operation per tool
    // In future versions, this could be enhanced to detect operation patterns
    return false;
  }

  /**
   * Create operation selection property
   */
  private createOperationProperty(): N8nNodeProperty {
    return {
      displayName: 'Operation',
      name: 'operation',
      type: 'options',
      options: [
        {
          name: 'Execute',
          value: 'execute',
        },
      ],
      default: 'execute',
      description: 'The operation to perform',
      required: true,
    };
  }

  /**
   * Create binary data handling property
   */
  private createBinaryDataProperty(): N8nNodeProperty {
    return {
      displayName: 'Binary Data',
      name: 'binaryData',
      type: 'boolean',
      default: false,
      description: 'Whether to handle binary data in the response',
      displayOptions: {
        show: {
          operation: ['execute'],
        },
      },
    };
  }

  /**
   * Create resource access property
   */
  private createResourceAccessProperty(): N8nNodeProperty {
    return {
      displayName: 'Enable Resource Access',
      name: 'enableResources',
      type: 'boolean',
      default: false,
      description: 'Allow the tool to access MCP server resources',
      displayOptions: {
        show: {
          operation: ['execute'],
        },
      },
    };
  }

  /**
   * Validate generated node definition
   */
  private validateNodeDefinition(nodeDefinition: N8nNodeTypeDescription): ConversionResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!nodeDefinition.displayName || nodeDefinition.displayName.length < 3) {
      errors.push('Node display name must be at least 3 characters long');
    }

    if (!nodeDefinition.name || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(nodeDefinition.name)) {
      errors.push('Node name must be a valid identifier starting with a letter');
    }

    if (!nodeDefinition.description || nodeDefinition.description.length < 10) {
      warnings.push(
        'Node description should be at least 10 characters long for better user experience'
      );
    }

    // Validate properties
    if (!nodeDefinition.properties || nodeDefinition.properties.length === 0) {
      warnings.push('Node has no configurable properties');
    }

    // Check for property name conflicts
    const propertyNames = new Set<string>();
    for (const prop of nodeDefinition.properties || []) {
      if (propertyNames.has(prop.name)) {
        errors.push(`Duplicate property name: ${prop.name}`);
      }
      propertyNames.add(prop.name);

      // Validate property names
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(prop.name)) {
        errors.push(`Invalid property name: ${prop.name}`);
      }
    }

    // Check complexity
    const propertyCount = nodeDefinition.properties?.length || 0;
    if (propertyCount > 20) {
      warnings.push(
        `Node has ${propertyCount} properties. Consider grouping related properties for better UX.`
      );
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Generate multiple node definitions for complex tools
   */
  generateMultipleNodes(context: ConversionContext): ConversionResult[] {
    // For complex tools, this could split operations into multiple nodes
    // For now, return single node generation
    return [this.generateNodeDefinition(context)];
  }

  /**
   * Get supported MCP types
   */
  getSupportedMCPTypes(): MCPToolProperty['type'][] {
    return ['string', 'number', 'integer', 'boolean', 'array', 'object'];
  }

  /**
   * Get available n8n property types
   */
  getAvailableN8nTypes(): N8nPropertyType[] {
    return [
      'string',
      'number',
      'boolean',
      'options',
      'multiOptions',
      'json',
      'dateTime',
      'collection',
      'fixedCollection',
      'resourceLocator',
    ];
  }
}
