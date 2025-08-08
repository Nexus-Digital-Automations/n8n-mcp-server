import { N8nNode, N8nWorkflow, N8nNodeTypeDescription } from '../types/n8n.js';
import {
  SuggestionEngine,
  NodeFlowAnalysis,
  NodeConnectionSuggestion,
  ParameterMapping,
} from '../ai/suggestionEngine.js';

export interface WorkflowAnalysisResult {
  workflowId: string;
  workflowName: string;
  nodeCount: number;
  connectionCount: number;
  complexityScore: number;
  suggestedConnections: NodeConnectionSuggestion[];
  parameterMappings: ParameterMapping[];
  optimizationSuggestions: string[];
  flowAnalysis: NodeFlowAnalysis[];
  potentialIssues: WorkflowIssue[];
}

export interface WorkflowIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'connection' | 'parameter' | 'performance' | 'logic' | 'security';
  nodeId?: string;
  message: string;
  suggestion?: string;
}

export interface NodeCompatibilityResult {
  sourceNodeId: string;
  targetNodeId: string;
  compatible: boolean;
  compatibilityScore: number;
  issues: string[];
  suggestions: string[];
  requiredTransformations: Array<{
    parameter: string;
    transformation: string;
    reason: string;
  }>;
}

export interface ParameterAnalysisResult {
  nodeId: string;
  parameters: Array<{
    name: string;
    currentValue: unknown;
    suggestedValue?: unknown;
    source: 'manual' | 'expression' | 'suggested';
    confidence: number;
    reasoning: string;
    issues: string[];
  }>;
  missingRequiredParameters: string[];
  unusedOptionalParameters: string[];
}

export interface DataFlowAnalysis {
  path: Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    dataTransformation: string;
  }>;
  dataTypes: Array<{
    step: number;
    nodeId: string;
    expectedType: string;
    actualType?: string;
    schema?: Record<string, unknown>;
  }>;
  bottlenecks: Array<{
    nodeId: string;
    reason: string;
    impact: 'low' | 'medium' | 'high';
    suggestion: string;
  }>;
}

export class NodeAnalyzer {
  private suggestionEngine: SuggestionEngine;

  constructor() {
    this.suggestionEngine = new SuggestionEngine();
  }

  loadNodeTypes(nodeTypes: N8nNodeTypeDescription[]): void {
    this.suggestionEngine.loadNodeTypes(nodeTypes);
  }

  analyzeWorkflow(workflow: N8nWorkflow): WorkflowAnalysisResult {
    const flowAnalysis = this.suggestionEngine.analyzeWorkflowConnections(workflow);
    const smartSuggestions = this.suggestionEngine.generateSmartWorkflowSuggestions(workflow);
    const potentialIssues = this.identifyWorkflowIssues(workflow);
    const complexityScore = this.calculateComplexityScore(workflow);

    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodeCount: workflow.nodes?.length || 0,
      connectionCount: this.countConnections(workflow.connections || {}),
      complexityScore,
      suggestedConnections: smartSuggestions.missingConnections,
      parameterMappings: smartSuggestions.parameterMappingOpportunities,
      optimizationSuggestions: smartSuggestions.optimizationSuggestions,
      flowAnalysis,
      potentialIssues,
    };
  }

  analyzeNodeCompatibility(
    sourceNode: N8nNode,
    targetNode: N8nNode,
    sourceNodeType?: N8nNodeTypeDescription,
    targetNodeType?: N8nNodeTypeDescription
  ): NodeCompatibilityResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    const requiredTransformations: Array<{
      parameter: string;
      transformation: string;
      reason: string;
    }> = [];

    let compatibilityScore = 1.0;

    // Check data type compatibility
    if (sourceNodeType && targetNodeType) {
      const dataTypeIssues = this.checkDataTypeCompatibility(sourceNodeType, targetNodeType);
      issues.push(...dataTypeIssues.issues);
      compatibilityScore *= dataTypeIssues.compatibilityFactor;
    }

    // Check parameter compatibility
    if (targetNodeType) {
      const parameterAnalysis = this.analyzeParameterCompatibility(
        sourceNode,
        targetNode,
        targetNodeType
      );
      requiredTransformations.push(...parameterAnalysis.transformations);
      suggestions.push(...parameterAnalysis.suggestions);
      compatibilityScore *= parameterAnalysis.compatibilityFactor;
    }

    // Check for common connection patterns
    const patternAnalysis = this.analyzeConnectionPatterns(sourceNode.type, targetNode.type);
    if (!patternAnalysis.isCommonPattern) {
      compatibilityScore *= 0.8;
      issues.push('This connection pattern is uncommon and may require additional configuration');
    }

    // Generate suggestions based on analysis
    if (compatibilityScore < 0.7) {
      suggestions.push('Consider adding a transformation node between these nodes');
    }

    if (requiredTransformations.length > 3) {
      suggestions.push(
        'Multiple transformations required - consider using a Function node for complex data processing'
      );
    }

    return {
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      compatible: compatibilityScore > 0.5,
      compatibilityScore,
      issues,
      suggestions,
      requiredTransformations,
    };
  }

  analyzeNodeParameters(node: N8nNode, nodeType?: N8nNodeTypeDescription): ParameterAnalysisResult {
    const parameters: Array<{
      name: string;
      currentValue: unknown;
      suggestedValue?: unknown;
      source: 'manual' | 'expression' | 'suggested';
      confidence: number;
      reasoning: string;
      issues: string[];
    }> = [];
    const missingRequiredParameters: string[] = [];
    const unusedOptionalParameters: string[] = [];

    if (!nodeType) {
      return {
        nodeId: node.id,
        parameters,
        missingRequiredParameters,
        unusedOptionalParameters,
      };
    }

    const currentParameters = node.parameters || {};

    for (const property of nodeType.properties) {
      if (property.type === 'hidden' || property.type === 'notice') continue;

      const currentValue = currentParameters[property.name];
      const hasValue = currentValue !== undefined && currentValue !== null && currentValue !== '';

      if (property.required && !hasValue) {
        missingRequiredParameters.push(property.name);
      }

      const suggestedValue = this.generateParameterSuggestion(node, property, nodeType);

      parameters.push({
        name: property.name,
        currentValue,
        suggestedValue: suggestedValue.value,
        source: this.determineParameterSource(currentValue),
        confidence: suggestedValue.confidence,
        reasoning: suggestedValue.reasoning,
        issues: this.validateParameterValue(currentValue, property),
      });
    }

    // Find unused parameters
    for (const paramName of Object.keys(currentParameters)) {
      const isKnownParameter = nodeType.properties.some(prop => prop.name === paramName);
      if (!isKnownParameter) {
        unusedOptionalParameters.push(paramName);
      }
    }

    return {
      nodeId: node.id,
      parameters,
      missingRequiredParameters,
      unusedOptionalParameters,
    };
  }

  analyzeDataFlow(workflow: N8nWorkflow, startNodeId?: string): DataFlowAnalysis {
    const nodes = workflow.nodes || [];
    const connections = workflow.connections || {};

    // Build execution path
    const path = this.buildExecutionPath(nodes, connections, startNodeId);

    // Analyze data types at each step
    const dataTypes = this.analyzeDataTypesInPath(path, connections);

    // Identify bottlenecks
    const bottlenecks = this.identifyDataFlowBottlenecks(path, nodes);

    return {
      path,
      dataTypes,
      bottlenecks,
    };
  }

  private calculateComplexityScore(workflow: N8nWorkflow): number {
    const nodeCount = workflow.nodes?.length || 0;
    const connectionCount = this.countConnections(workflow.connections || {});

    // Base complexity on nodes and connections
    let complexity = nodeCount * 0.5 + connectionCount * 0.3;

    // Add complexity for conditional logic
    const conditionalNodes =
      workflow.nodes?.filter(
        n => n.type.includes('if') || n.type.includes('switch') || n.type.includes('merge')
      ) || [];
    complexity += conditionalNodes.length * 1.5;

    // Add complexity for loops
    const loopNodes =
      workflow.nodes?.filter(n => n.type.includes('loop') || n.type.includes('split')) || [];
    complexity += loopNodes.length * 2.0;

    // Normalize to 0-10 scale
    return Math.min(complexity / 3, 10);
  }

  private countConnections(connections: Record<string, unknown>): number {
    let count = 0;
    for (const nodeConnections of Object.values(connections)) {
      if (typeof nodeConnections === 'object' && nodeConnections !== null) {
        count += Object.keys(nodeConnections).length;
      }
    }
    return count;
  }

  private identifyWorkflowIssues(workflow: N8nWorkflow): WorkflowIssue[] {
    const issues: WorkflowIssue[] = [];
    const nodes = workflow.nodes || [];

    // Check for common issues

    // 1. Missing trigger nodes
    const triggerNodes = nodes.filter(
      n => n.type.includes('trigger') || n.type.includes('webhook')
    );
    if (triggerNodes.length === 0 && workflow.active) {
      issues.push({
        severity: 'high',
        type: 'logic',
        message: 'Active workflow has no trigger nodes - it may never execute',
        suggestion: 'Add a trigger node to start the workflow execution',
      });
    }

    // 2. Disabled nodes in critical path
    const disabledNodes = nodes.filter(n => n.disabled);
    for (const node of disabledNodes) {
      issues.push({
        severity: 'medium',
        type: 'logic',
        nodeId: node.id,
        message: `Node "${node.name}" is disabled but may be part of the workflow`,
        suggestion: 'Review if this node should be enabled or removed',
      });
    }

    // 3. Missing error handling
    const errorHandlingNodes = nodes.filter(
      n => n.type.includes('error') || n.name.toLowerCase().includes('error')
    );
    if (nodes.length > 5 && errorHandlingNodes.length === 0) {
      issues.push({
        severity: 'medium',
        type: 'logic',
        message: 'Complex workflow lacks error handling nodes',
        suggestion: 'Consider adding error handling for robust workflow execution',
      });
    }

    // 4. Performance concerns
    const httpNodes = nodes.filter(n => n.type.includes('http'));
    if (httpNodes.length > 10) {
      issues.push({
        severity: 'medium',
        type: 'performance',
        message: 'Many HTTP nodes detected - may impact performance',
        suggestion: 'Consider batching requests or using pagination',
      });
    }

    // 5. Security concerns
    const credentialNodes = nodes.filter(
      n => n.credentials && Object.keys(n.credentials).length > 0
    );
    for (const node of credentialNodes) {
      if (node.parameters && JSON.stringify(node.parameters).includes('password')) {
        issues.push({
          severity: 'critical',
          type: 'security',
          nodeId: node.id,
          message: 'Potential hardcoded credentials detected',
          suggestion: 'Use credential system instead of hardcoded values',
        });
      }
    }

    return issues;
  }

  private checkDataTypeCompatibility(
    sourceNodeType: N8nNodeTypeDescription,
    targetNodeType: N8nNodeTypeDescription
  ): { issues: string[]; compatibilityFactor: number } {
    const issues: string[] = [];
    let compatibilityFactor = 1.0;

    // Check common incompatibility patterns
    const sourceIsArray = sourceNodeType.name.toLowerCase().includes('split');
    const targetExpectsSingle = !targetNodeType.name.toLowerCase().includes('merge');

    if (sourceIsArray && targetExpectsSingle) {
      issues.push('Source produces array data but target expects single items');
      compatibilityFactor *= 0.6;
    }

    return { issues, compatibilityFactor };
  }

  private analyzeParameterCompatibility(
    sourceNode: N8nNode,
    targetNode: N8nNode,
    targetNodeType: N8nNodeTypeDescription
  ): {
    transformations: Array<{ parameter: string; transformation: string; reason: string }>;
    suggestions: string[];
    compatibilityFactor: number;
  } {
    const transformations: Array<{ parameter: string; transformation: string; reason: string }> =
      [];
    const suggestions: string[] = [];
    let compatibilityFactor = 1.0;

    for (const property of targetNodeType.properties) {
      if (property.required && !targetNode.parameters?.[property.name]) {
        const suggestedTransformation = this.suggestParameterTransformation(property, sourceNode);
        if (suggestedTransformation) {
          transformations.push(suggestedTransformation);
        } else {
          compatibilityFactor *= 0.8;
          suggestions.push(`Required parameter "${property.name}" needs to be configured`);
        }
      }
    }

    return { transformations, suggestions, compatibilityFactor };
  }

  private analyzeConnectionPatterns(
    sourceType: string,
    targetType: string
  ): { isCommonPattern: boolean; confidence: number } {
    const commonPatterns = [
      { source: 'trigger', target: 'http', confidence: 0.9 },
      { source: 'http', target: 'json', confidence: 0.8 },
      { source: 'json', target: 'set', confidence: 0.7 },
      { source: 'if', target: 'http', confidence: 0.6 },
      { source: 'webhook', target: 'response', confidence: 0.9 },
    ];

    for (const pattern of commonPatterns) {
      if (
        sourceType.toLowerCase().includes(pattern.source) &&
        targetType.toLowerCase().includes(pattern.target)
      ) {
        return { isCommonPattern: true, confidence: pattern.confidence };
      }
    }

    return { isCommonPattern: false, confidence: 0.3 };
  }

  private generateParameterSuggestion(
    node: N8nNode,
    property: any,
    nodeType: N8nNodeTypeDescription
  ): { value: unknown; confidence: number; reasoning: string } {
    // Generate smart parameter suggestions based on context

    if (property.type === 'options' && property.options) {
      const defaultOption = property.options.find((opt: any) => opt.value === property.default);
      if (defaultOption) {
        return {
          value: defaultOption.value,
          confidence: 0.7,
          reasoning: `Default option for ${property.displayName}`,
        };
      }
    }

    if (property.name.toLowerCase().includes('url') && node.type.includes('http')) {
      return {
        value: 'https://api.example.com/endpoint',
        confidence: 0.5,
        reasoning: 'Common URL pattern for HTTP requests',
      };
    }

    if (property.type === 'boolean') {
      return {
        value: property.default !== undefined ? property.default : false,
        confidence: 0.6,
        reasoning: 'Using default boolean value',
      };
    }

    return {
      value: property.default,
      confidence: property.default !== undefined ? 0.8 : 0.3,
      reasoning:
        property.default !== undefined ? 'Using default value' : 'No specific suggestion available',
    };
  }

  private determineParameterSource(value: unknown): 'manual' | 'expression' | 'suggested' {
    if (typeof value === 'string' && value.includes('{{')) {
      return 'expression';
    }
    if (value === undefined || value === null) {
      return 'suggested';
    }
    return 'manual';
  }

  private validateParameterValue(value: unknown, property: any): string[] {
    const issues: string[] = [];

    if (property.required && (value === undefined || value === null || value === '')) {
      issues.push('Required parameter is missing');
    }

    if (property.type === 'number' && typeof value === 'string') {
      if (isNaN(Number(value))) {
        issues.push('Expected number but got non-numeric string');
      }
    }

    if (property.type === 'options' && property.options) {
      const validValues = property.options.map((opt: any) => opt.value);
      if (!validValues.includes(value)) {
        issues.push(`Value not in allowed options: ${validValues.join(', ')}`);
      }
    }

    return issues;
  }

  private buildExecutionPath(
    nodes: N8nNode[],
    connections: Record<string, unknown>,
    startNodeId?: string
  ): Array<{ nodeId: string; nodeName: string; nodeType: string; dataTransformation: string }> {
    const path = [];

    // Simple linear path building (could be enhanced for complex branching)
    let currentNode = startNodeId
      ? nodes.find(n => n.id === startNodeId)
      : nodes.find(n => n.type.includes('trigger'));

    while (currentNode && path.length < 50) {
      // Prevent infinite loops
      path.push({
        nodeId: currentNode.id,
        nodeName: currentNode.name,
        nodeType: currentNode.type,
        dataTransformation: this.describeDataTransformation(currentNode),
      });

      // Find next node (simplified)
      const nextNodeId = this.findNextNode(currentNode.id, connections);
      currentNode = nextNodeId ? nodes.find(n => n.id === nextNodeId) : undefined;
    }

    return path;
  }

  private analyzeDataTypesInPath(
    path: Array<{ nodeId: string; nodeName: string; nodeType: string; dataTransformation: string }>,
    connections: Record<string, unknown>
  ): Array<{
    step: number;
    nodeId: string;
    expectedType: string;
    actualType?: string;
    schema?: Record<string, unknown>;
  }> {
    return path.map((step, index) => ({
      step: index,
      nodeId: step.nodeId,
      expectedType: this.predictDataType(step.nodeType),
      schema: this.predictDataSchema(step.nodeType),
    }));
  }

  private identifyDataFlowBottlenecks(
    path: Array<{ nodeId: string; nodeName: string; nodeType: string; dataTransformation: string }>,
    nodes: N8nNode[]
  ): Array<{
    nodeId: string;
    reason: string;
    impact: 'low' | 'medium' | 'high';
    suggestion: string;
  }> {
    const bottlenecks = [];

    for (const step of path) {
      if (step.nodeType.includes('http')) {
        bottlenecks.push({
          nodeId: step.nodeId,
          reason: 'HTTP requests can be slow and may fail',
          impact: 'medium' as const,
          suggestion: 'Consider adding retry logic and timeout configuration',
        });
      }

      if (step.nodeType.includes('database') || step.nodeType.includes('sql')) {
        bottlenecks.push({
          nodeId: step.nodeId,
          reason: 'Database operations can be slow with large datasets',
          impact: 'high' as const,
          suggestion: 'Consider using pagination and indexed queries',
        });
      }
    }

    return bottlenecks;
  }

  private describeDataTransformation(node: N8nNode): string {
    const nodeType = node.type.toLowerCase();

    if (nodeType.includes('set')) return 'Transforms data by setting specific fields';
    if (nodeType.includes('json')) return 'Parses or converts JSON data';
    if (nodeType.includes('http')) return 'Fetches data from HTTP endpoint';
    if (nodeType.includes('if')) return 'Conditionally routes data based on criteria';
    if (nodeType.includes('function')) return 'Applies custom JavaScript transformation';

    return 'Processes data according to node configuration';
  }

  private findNextNode(
    currentNodeId: string,
    connections: Record<string, unknown>
  ): string | undefined {
    // Simplified next node finding (real implementation would parse n8n connection format)
    for (const [nodeId, nodeConnections] of Object.entries(connections)) {
      if (
        nodeId === currentNodeId &&
        typeof nodeConnections === 'object' &&
        nodeConnections !== null
      ) {
        // Return first connected node (simplified)
        const connectionKeys = Object.keys(nodeConnections);
        return connectionKeys.length > 0 ? connectionKeys[0] : undefined;
      }
    }
    return undefined;
  }

  private predictDataType(nodeType: string): string {
    if (nodeType.includes('http')) return 'object';
    if (nodeType.includes('json')) return 'object';
    if (nodeType.includes('set')) return 'object';
    if (nodeType.includes('function')) return 'any';
    return 'unknown';
  }

  private predictDataSchema(nodeType: string): Record<string, unknown> | undefined {
    if (nodeType.includes('http')) {
      return { data: {}, headers: {}, status: 'number' };
    }
    return undefined;
  }

  private suggestParameterTransformation(
    property: any,
    sourceNode: N8nNode
  ): { parameter: string; transformation: string; reason: string } | null {
    const paramName = property.name;
    const sourceType = sourceNode.type;

    if (paramName.toLowerCase().includes('url') && sourceType.includes('http')) {
      return {
        parameter: paramName,
        transformation: `{{$node["${sourceNode.name}"].json["url"]}}`,
        reason: 'Map URL from HTTP response',
      };
    }

    if (paramName.toLowerCase().includes('id') && sourceType.includes('database')) {
      return {
        parameter: paramName,
        transformation: `{{$node["${sourceNode.name}"].json["id"]}}`,
        reason: 'Map ID from database result',
      };
    }

    return null;
  }
}
