import { N8nNode, N8nWorkflow, N8nNodeTypeDescription } from '../types/n8n.js';

export interface NodeConnectionSuggestion {
  sourceNodeId: string;
  targetNodeId: string;
  sourceOutput: string;
  targetInput: string;
  confidence: number;
  reasoning: string;
  dataTypeMatch: boolean;
  suggestedParameters?: Record<string, unknown>;
}

export interface ParameterMapping {
  sourceParameter: string;
  targetParameter: string;
  transformation?: string;
  confidence: number;
  dataType: string;
}

export interface NodeFlowAnalysis {
  nodeId: string;
  nodeType: string;
  inputs: Array<{
    name: string;
    type: string;
    required: boolean;
    connectedFrom?: string;
  }>;
  outputs: Array<{
    name: string;
    type: string;
    dataStructure?: Record<string, unknown>;
  }>;
  suggestedConnections: NodeConnectionSuggestion[];
  parameterMappings: ParameterMapping[];
}

export class SuggestionEngine {
  private nodeTypeRegistry: Map<string, N8nNodeTypeDescription> = new Map();

  constructor(nodeTypes?: N8nNodeTypeDescription[]) {
    if (nodeTypes) {
      this.loadNodeTypes(nodeTypes);
    }
  }

  loadNodeTypes(nodeTypes: N8nNodeTypeDescription[]): void {
    this.nodeTypeRegistry.clear();
    for (const nodeType of nodeTypes) {
      this.nodeTypeRegistry.set(nodeType.name, nodeType);
    }
  }

  analyzeWorkflowConnections(workflow: N8nWorkflow): NodeFlowAnalysis[] {
    const nodes = workflow.nodes || [];
    const connections = workflow.connections || {};
    const analyses: NodeFlowAnalysis[] = [];

    for (const node of nodes) {
      const analysis = this.analyzeNodeConnections(node, nodes, connections);
      analyses.push(analysis);
    }

    return analyses;
  }

  private analyzeNodeConnections(
    node: N8nNode,
    allNodes: N8nNode[],
    connections: Record<string, unknown>
  ): NodeFlowAnalysis {
    const nodeTypeInfo = this.nodeTypeRegistry.get(node.type);

    const analysis: NodeFlowAnalysis = {
      nodeId: node.id,
      nodeType: node.type,
      inputs: this.analyzeNodeInputs(node, nodeTypeInfo, connections),
      outputs: this.analyzeNodeOutputs(node, nodeTypeInfo),
      suggestedConnections: [],
      parameterMappings: [],
    };

    // Generate connection suggestions
    analysis.suggestedConnections = this.generateConnectionSuggestions(
      node,
      allNodes,
      nodeTypeInfo,
      connections
    );

    // Generate parameter mappings
    analysis.parameterMappings = this.generateParameterMappings(node, allNodes, nodeTypeInfo);

    return analysis;
  }

  private analyzeNodeInputs(
    node: N8nNode,
    nodeTypeInfo?: N8nNodeTypeDescription,
    connections?: Record<string, unknown>
  ) {
    const inputs = [];

    if (nodeTypeInfo) {
      // Use node type information to determine expected inputs
      const inputProperties = nodeTypeInfo.properties.filter(
        prop => prop.type !== 'hidden' && prop.type !== 'notice'
      );

      for (const prop of inputProperties) {
        inputs.push({
          name: prop.name,
          type: prop.type,
          required: prop.required || false,
          connectedFrom: this.findConnectionSource(node.id, prop.name, connections),
        });
      }
    } else {
      // Fallback: analyze based on common input patterns
      inputs.push({
        name: 'main',
        type: 'object',
        required: true,
        connectedFrom: this.findConnectionSource(node.id, 'main', connections),
      });
    }

    return inputs;
  }

  private analyzeNodeOutputs(node: N8nNode, nodeTypeInfo?: N8nNodeTypeDescription) {
    const outputs = [];

    if (nodeTypeInfo) {
      // Most n8n nodes have a 'main' output
      outputs.push({
        name: 'main',
        type: 'object',
        dataStructure: this.predictOutputStructure(node, nodeTypeInfo),
      });
    } else {
      // Default output structure
      outputs.push({
        name: 'main',
        type: 'object',
        dataStructure: {},
      });
    }

    return outputs;
  }

  private generateConnectionSuggestions(
    targetNode: N8nNode,
    allNodes: N8nNode[],
    targetNodeTypeInfo?: N8nNodeTypeDescription,
    connections?: Record<string, unknown>
  ): NodeConnectionSuggestion[] {
    const suggestions: NodeConnectionSuggestion[] = [];

    for (const sourceNode of allNodes) {
      if (sourceNode.id === targetNode.id) continue;

      const sourceNodeTypeInfo = this.nodeTypeRegistry.get(sourceNode.type);
      const suggestion = this.evaluateNodeConnection(
        sourceNode,
        targetNode,
        sourceNodeTypeInfo,
        targetNodeTypeInfo,
        connections
      );

      if (suggestion && suggestion.confidence > 0.3) {
        suggestions.push(suggestion);
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  private evaluateNodeConnection(
    sourceNode: N8nNode,
    targetNode: N8nNode,
    sourceTypeInfo?: N8nNodeTypeDescription,
    targetTypeInfo?: N8nNodeTypeDescription,
    connections?: Record<string, unknown>
  ): NodeConnectionSuggestion | null {
    let confidence = 0;
    let reasoning = '';
    const dataTypeMatch = this.checkDataTypeCompatibility(
      sourceNode,
      targetNode,
      sourceTypeInfo,
      targetTypeInfo
    );

    // Rule-based scoring
    confidence += this.scoreBasedOnNodeTypes(sourceNode.type, targetNode.type);
    confidence += this.scoreBasedOnNodeNames(sourceNode.name, targetNode.name);
    confidence += this.scoreBasedOnPosition(sourceNode.position, targetNode.position);
    confidence += dataTypeMatch ? 0.3 : 0;

    // Check if already connected
    if (this.areNodesConnected(sourceNode.id, targetNode.id, connections)) {
      confidence -= 0.5; // Reduce score for already connected nodes
      reasoning += 'Already connected. ';
    }

    // Generate reasoning
    reasoning += this.generateConnectionReasoning(
      sourceNode,
      targetNode,
      sourceTypeInfo,
      targetTypeInfo
    );

    if (confidence <= 0) {
      return null;
    }

    return {
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      sourceOutput: 'main',
      targetInput: 'main',
      confidence: Math.min(confidence, 1),
      reasoning: reasoning.trim(),
      dataTypeMatch,
      suggestedParameters: this.generateSuggestedParameters(
        sourceNode,
        targetNode,
        sourceTypeInfo,
        targetTypeInfo
      ),
    };
  }

  private scoreBasedOnNodeTypes(sourceType: string, targetType: string): number {
    // Define common node type connection patterns
    const connectionPatterns = [
      { source: 'trigger', target: 'action', score: 0.4 },
      { source: 'webhook', target: 'set', score: 0.3 },
      { source: 'http', target: 'json', score: 0.3 },
      { source: 'database', target: 'set', score: 0.2 },
      { source: 'if', target: 'action', score: 0.2 },
    ];

    for (const pattern of connectionPatterns) {
      if (
        sourceType.toLowerCase().includes(pattern.source) &&
        targetType.toLowerCase().includes(pattern.target)
      ) {
        return pattern.score;
      }
    }

    return 0;
  }

  private scoreBasedOnNodeNames(sourceName: string, targetName: string): number {
    // Score based on semantic similarity of node names
    const sourceWords = sourceName.toLowerCase().split(/\s+/);
    const targetWords = targetName.toLowerCase().split(/\s+/);

    let commonWords = 0;
    for (const sourceWord of sourceWords) {
      if (targetWords.includes(sourceWord)) {
        commonWords++;
      }
    }

    return commonWords > 0 ? 0.1 * commonWords : 0;
  }

  private scoreBasedOnPosition(sourcePos: [number, number], targetPos: [number, number]): number {
    const distance = Math.sqrt(
      Math.pow(targetPos[0] - sourcePos[0], 2) + Math.pow(targetPos[1] - sourcePos[1], 2)
    );

    // Closer nodes are more likely to be connected
    return Math.max(0, 0.2 - distance / 1000);
  }

  private checkDataTypeCompatibility(
    sourceNode: N8nNode,
    targetNode: N8nNode,
    sourceTypeInfo?: N8nNodeTypeDescription,
    targetTypeInfo?: N8nNodeTypeDescription
  ): boolean {
    // Basic data type compatibility check
    // Most n8n nodes work with JSON objects, so we'll be optimistic
    return true;
  }

  private generateConnectionReasoning(
    sourceNode: N8nNode,
    targetNode: N8nNode,
    sourceTypeInfo?: N8nNodeTypeDescription,
    targetTypeInfo?: N8nNodeTypeDescription
  ): string {
    const reasons = [];

    if (sourceNode.type.includes('trigger')) {
      reasons.push('Source is a trigger node, typically connects to action nodes');
    }

    if (targetNode.type.includes('http')) {
      reasons.push('Target accepts HTTP data, compatible with most outputs');
    }

    if (
      sourceNode.name.toLowerCase().includes('get') &&
      targetNode.name.toLowerCase().includes('set')
    ) {
      reasons.push('Data flow pattern: retrieve then process/store');
    }

    const distance = Math.sqrt(
      Math.pow(targetNode.position[0] - sourceNode.position[0], 2) +
        Math.pow(targetNode.position[1] - sourceNode.position[1], 2)
    );

    if (distance < 300) {
      reasons.push('Nodes are positioned close together');
    }

    return reasons.join('. ');
  }

  private generateParameterMappings(
    node: N8nNode,
    allNodes: N8nNode[],
    nodeTypeInfo?: N8nNodeTypeDescription
  ): ParameterMapping[] {
    const mappings: ParameterMapping[] = [];

    if (!nodeTypeInfo) return mappings;

    // Find upstream nodes that could provide data
    const upstreamNodes = allNodes.filter(n => n.id !== node.id && this.isUpstreamNode(n, node));

    for (const prop of nodeTypeInfo.properties) {
      if (prop.type === 'hidden' || prop.type === 'notice') continue;

      const mapping = this.generateParameterMapping(node, prop, upstreamNodes);
      if (mapping) {
        mappings.push(mapping);
      }
    }

    return mappings.sort((a, b) => b.confidence - a.confidence);
  }

  private generateParameterMapping(
    node: N8nNode,
    property: any,
    upstreamNodes: N8nNode[]
  ): ParameterMapping | null {
    // Generate mappings based on parameter names and types
    for (const upstreamNode of upstreamNodes) {
      const similarity = this.calculateParameterSimilarity(property.name, upstreamNode);

      if (similarity > 0.5) {
        return {
          sourceParameter: `{{$node["${upstreamNode.name}"].json["${this.findBestSourceParameter(property.name, upstreamNode)}"]}}`,
          targetParameter: property.name,
          transformation: this.suggestTransformation(property, upstreamNode),
          confidence: similarity,
          dataType: property.type,
        };
      }
    }

    return null;
  }

  private calculateParameterSimilarity(paramName: string, sourceNode: N8nNode): number {
    // Simple similarity based on common parameter names
    const commonMappings = {
      email: ['email', 'mail', 'emailAddress'],
      name: ['name', 'title', 'displayName'],
      url: ['url', 'link', 'href'],
      id: ['id', 'identifier', 'key'],
      data: ['data', 'payload', 'content'],
    };

    const paramLower = paramName.toLowerCase();

    for (const [target, sources] of Object.entries(commonMappings)) {
      if (paramLower.includes(target)) {
        // Check if source node likely produces this type of data
        if (sources.some(source => sourceNode.name.toLowerCase().includes(source))) {
          return 0.8;
        }
      }
    }

    return 0;
  }

  private findBestSourceParameter(targetParam: string, sourceNode: N8nNode): string {
    // Try to match parameter names
    const targetLower = targetParam.toLowerCase();

    const commonMatches = {
      email: 'email',
      name: 'name',
      url: 'url',
      id: 'id',
      data: 'data',
    };

    for (const [pattern, param] of Object.entries(commonMatches)) {
      if (targetLower.includes(pattern)) {
        return param;
      }
    }

    return 'data'; // Default fallback
  }

  private suggestTransformation(property: any, sourceNode: N8nNode): string | undefined {
    if (property.type === 'string' && sourceNode.type.includes('json')) {
      return 'JSON.stringify()';
    }

    if (property.type === 'number' && sourceNode.name.toLowerCase().includes('string')) {
      return 'parseInt()';
    }

    return undefined;
  }

  private isUpstreamNode(sourceNode: N8nNode, targetNode: N8nNode): boolean {
    // Simple position-based heuristic
    return (
      sourceNode.position[0] < targetNode.position[0] ||
      sourceNode.position[1] < targetNode.position[1]
    );
  }

  private findConnectionSource(
    nodeId: string,
    inputName: string,
    connections?: Record<string, unknown>
  ): string | undefined {
    if (!connections) return undefined;

    // Parse n8n connections format to find source
    for (const [sourceNodeName, sourceConnections] of Object.entries(connections)) {
      if (typeof sourceConnections === 'object' && sourceConnections !== null) {
        // Check if this source connects to our target node
        // This is a simplified check - actual n8n connection format is more complex
        return sourceNodeName;
      }
    }

    return undefined;
  }

  private areNodesConnected(
    sourceId: string,
    targetId: string,
    connections?: Record<string, unknown>
  ): boolean {
    if (!connections) return false;

    // Simplified connection check
    for (const [nodeId, nodeConnections] of Object.entries(connections)) {
      if (nodeId === sourceId && typeof nodeConnections === 'object' && nodeConnections !== null) {
        // Check if target is in the connections
        return JSON.stringify(nodeConnections).includes(targetId);
      }
    }

    return false;
  }

  private predictOutputStructure(
    node: N8nNode,
    nodeTypeInfo: N8nNodeTypeDescription
  ): Record<string, unknown> {
    // Predict the likely output structure based on node type
    const outputStructure: Record<string, unknown> = {};

    if (node.type.includes('http')) {
      outputStructure.data = {};
      outputStructure.headers = {};
      outputStructure.status = 200;
    } else if (node.type.includes('database')) {
      outputStructure.rows = [];
      outputStructure.count = 0;
    } else if (node.type.includes('file')) {
      outputStructure.filename = '';
      outputStructure.content = '';
      outputStructure.size = 0;
    } else {
      outputStructure.data = {};
    }

    return outputStructure;
  }

  private generateSuggestedParameters(
    sourceNode: N8nNode,
    targetNode: N8nNode,
    sourceTypeInfo?: N8nNodeTypeDescription,
    targetTypeInfo?: N8nNodeTypeDescription
  ): Record<string, unknown> | undefined {
    if (!targetTypeInfo) return undefined;

    const suggestions: Record<string, unknown> = {};

    // Generate parameter suggestions based on source node data
    for (const property of targetTypeInfo.properties.slice(0, 3)) {
      // Limit to prevent large responses
      if (property.type === 'hidden' || property.type === 'notice') continue;

      const suggestion = this.suggestParameterFromSource(property, sourceNode, sourceTypeInfo);
      if (suggestion !== undefined) {
        suggestions[property.name] = suggestion;
      }
    }

    return Object.keys(suggestions).length > 0 ? suggestions : undefined;
  }

  private suggestParameterFromSource(
    property: any,
    sourceNode: N8nNode,
    sourceTypeInfo?: N8nNodeTypeDescription
  ): unknown {
    const paramName = property.name.toLowerCase();

    // Common parameter mapping patterns
    if (paramName.includes('url') && sourceNode.type.includes('http')) {
      return `{{$node["${sourceNode.name}"].json["url"]}}`;
    }

    if (paramName.includes('data') || paramName.includes('body')) {
      return `{{$node["${sourceNode.name}"].json}}`;
    }

    if (paramName.includes('id') && sourceNode.parameters?.id) {
      return `{{$node["${sourceNode.name}"].json["id"]}}`;
    }

    return undefined;
  }

  generateSmartWorkflowSuggestions(workflow: N8nWorkflow): {
    missingConnections: NodeConnectionSuggestion[];
    optimizationSuggestions: string[];
    parameterMappingOpportunities: ParameterMapping[];
  } {
    const analyses = this.analyzeWorkflowConnections(workflow);
    const missingConnections: NodeConnectionSuggestion[] = [];
    const optimizationSuggestions: string[] = [];
    const parameterMappingOpportunities: ParameterMapping[] = [];

    for (const analysis of analyses) {
      missingConnections.push(...analysis.suggestedConnections);
      parameterMappingOpportunities.push(...analysis.parameterMappings);
    }

    // Generate optimization suggestions
    if (workflow.nodes && workflow.nodes.length > 10) {
      optimizationSuggestions.push(
        'Consider breaking this large workflow into smaller, reusable workflows'
      );
    }

    const triggerNodes = workflow.nodes?.filter(n => n.type.includes('trigger')) || [];
    if (triggerNodes.length === 0) {
      optimizationSuggestions.push('This workflow appears to be missing a trigger node');
    }

    const disconnectedNodes =
      workflow.nodes?.filter(n => {
        const hasConnections = missingConnections.some(
          c => c.sourceNodeId === n.id || c.targetNodeId === n.id
        );
        return !hasConnections;
      }) || [];

    if (disconnectedNodes.length > 0) {
      optimizationSuggestions.push(
        `${disconnectedNodes.length} nodes appear to be disconnected from the workflow`
      );
    }

    return {
      missingConnections: missingConnections.slice(0, 10), // Top 10 suggestions
      optimizationSuggestions,
      parameterMappingOpportunities: parameterMappingOpportunities.slice(0, 15), // Top 15 mappings
    };
  }
}
