import { N8nWorkflow, N8nNode } from '../types/n8n.js';

export interface VariableDiscoveryOptions {
  includeGlobal?: boolean;
  includeNodeOutputs?: boolean;
  includeExpressionFunctions?: boolean;
}

export interface WorkflowVariable {
  name: string;
  type: 'global' | 'node_output' | 'workflow_data' | 'execution_data' | 'expression_function';
  source: string;
  description?: string;
  example?: string;
  dataType?: string;
  path?: string;
}

export interface VariableContext {
  [category: string]: WorkflowVariable[];
}

/**
 * Discover available variables within a workflow context
 */
export async function discoverWorkflowVariables(
  workflow: N8nWorkflow,
  nodeId?: string,
  options: VariableDiscoveryOptions = {}
): Promise<VariableContext> {
  const {
    includeGlobal = true,
    includeNodeOutputs = true,
    includeExpressionFunctions = false,
  } = options;

  const variables: VariableContext = {};

  // Global variables available in all workflows
  if (includeGlobal) {
    variables.global = getGlobalVariables();
  }

  // Workflow-specific variables
  variables.workflow = getWorkflowVariables(workflow);

  // Execution context variables
  variables.execution = getExecutionVariables();

  // Node-specific variables based on context
  if (nodeId && includeNodeOutputs) {
    variables.nodeOutputs = await getNodeOutputVariables(workflow, nodeId);
  } else if (includeNodeOutputs) {
    variables.nodeOutputs = await getAllNodeOutputVariables(workflow);
  }

  // Expression functions
  if (includeExpressionFunctions) {
    variables.functions = getExpressionFunctions();
  }

  return variables;
}

/**
 * Extract available variables for a specific node context
 */
export async function extractAvailableVariables(
  workflow: N8nWorkflow,
  nodeId: string
): Promise<WorkflowVariable[]> {
  const variables: WorkflowVariable[] = [];

  // Add global variables
  variables.push(...getGlobalVariables());

  // Add workflow variables
  variables.push(...getWorkflowVariables(workflow));

  // Add execution variables
  variables.push(...getExecutionVariables());

  // Add preceding node outputs
  variables.push(...(await getNodeOutputVariables(workflow, nodeId)));

  return variables;
}

/**
 * Get global variables available in all n8n workflows
 */
function getGlobalVariables(): WorkflowVariable[] {
  return [
    {
      name: '$now',
      type: 'global',
      source: 'n8n-core',
      description: 'Current timestamp',
      example: '{{ $now }}',
      dataType: 'DateTime',
      path: '$now',
    },
    {
      name: '$today',
      type: 'global',
      source: 'n8n-core',
      description: 'Current date at midnight',
      example: '{{ $today }}',
      dataType: 'DateTime',
      path: '$today',
    },
    {
      name: '$workflow',
      type: 'global',
      source: 'n8n-core',
      description: 'Workflow information',
      example: '{{ $workflow.id }}',
      dataType: 'Object',
      path: '$workflow',
    },
    {
      name: '$execution',
      type: 'global',
      source: 'n8n-core',
      description: 'Current execution information',
      example: '{{ $execution.id }}',
      dataType: 'Object',
      path: '$execution',
    },
    {
      name: '$vars',
      type: 'global',
      source: 'n8n-core',
      description: 'Environment variables',
      example: '{{ $vars.MY_VARIABLE }}',
      dataType: 'Object',
      path: '$vars',
    },
    {
      name: '$secrets',
      type: 'global',
      source: 'n8n-core',
      description: 'Secret variables',
      example: '{{ $secrets.MY_SECRET }}',
      dataType: 'Object',
      path: '$secrets',
    },
    {
      name: '$prevNode',
      type: 'global',
      source: 'n8n-core',
      description: 'Data from the previous node',
      example: '{{ $prevNode.data }}',
      dataType: 'Object',
      path: '$prevNode',
    },
    {
      name: '$input',
      type: 'global',
      source: 'n8n-core',
      description: 'Input data for current node',
      example: '{{ $input.all() }}',
      dataType: 'Object',
      path: '$input',
    },
    {
      name: '$json',
      type: 'global',
      source: 'n8n-core',
      description: 'JSON data from previous node',
      example: '{{ $json.propertyName }}',
      dataType: 'Object',
      path: '$json',
    },
    {
      name: '$binary',
      type: 'global',
      source: 'n8n-core',
      description: 'Binary data from previous node',
      example: '{{ $binary.data }}',
      dataType: 'Object',
      path: '$binary',
    },
  ];
}

/**
 * Get workflow-specific variables
 */
function getWorkflowVariables(workflow: N8nWorkflow): WorkflowVariable[] {
  const variables: WorkflowVariable[] = [];

  // Workflow metadata
  variables.push({
    name: 'workflow.id',
    type: 'workflow_data',
    source: workflow.name || 'Current Workflow',
    description: 'Workflow ID',
    example: `{{ $workflow.id }} // ${workflow.id}`,
    dataType: 'string',
    path: '$workflow.id',
  });

  variables.push({
    name: 'workflow.name',
    type: 'workflow_data',
    source: workflow.name || 'Current Workflow',
    description: 'Workflow name',
    example: `{{ $workflow.name }} // ${workflow.name}`,
    dataType: 'string',
    path: '$workflow.name',
  });

  variables.push({
    name: 'workflow.active',
    type: 'workflow_data',
    source: workflow.name || 'Current Workflow',
    description: 'Whether workflow is active',
    example: `{{ $workflow.active }} // ${workflow.active}`,
    dataType: 'boolean',
    path: '$workflow.active',
  });

  // Static data if available
  if (workflow.staticData && Object.keys(workflow.staticData).length > 0) {
    Object.keys(workflow.staticData).forEach(key => {
      variables.push({
        name: `staticData.${key}`,
        type: 'workflow_data',
        source: workflow.name || 'Current Workflow',
        description: `Static data: ${key}`,
        example: `{{ $workflow.staticData.${key} }}`,
        dataType: 'unknown',
        path: `$workflow.staticData.${key}`,
      });
    });
  }

  return variables;
}

/**
 * Get execution context variables
 */
function getExecutionVariables(): WorkflowVariable[] {
  return [
    {
      name: 'execution.id',
      type: 'execution_data',
      source: 'n8n-execution',
      description: 'Current execution ID',
      example: '{{ $execution.id }}',
      dataType: 'string',
      path: '$execution.id',
    },
    {
      name: 'execution.mode',
      type: 'execution_data',
      source: 'n8n-execution',
      description: 'Execution mode (manual, trigger, etc.)',
      example: '{{ $execution.mode }}',
      dataType: 'string',
      path: '$execution.mode',
    },
    {
      name: 'execution.resumeUrl',
      type: 'execution_data',
      source: 'n8n-execution',
      description: 'URL to resume execution',
      example: '{{ $execution.resumeUrl }}',
      dataType: 'string',
      path: '$execution.resumeUrl',
    },
  ];
}

/**
 * Get variables from node outputs that precede the given node
 */
async function getNodeOutputVariables(
  workflow: N8nWorkflow,
  currentNodeId: string
): Promise<WorkflowVariable[]> {
  const variables: WorkflowVariable[] = [];

  if (!workflow.nodes) {
    return variables;
  }

  // Find nodes that can provide data to the current node
  const precedingNodes = findPrecedingNodes(workflow, currentNodeId);

  precedingNodes.forEach(node => {
    // Add node-specific variables
    variables.push({
      name: `${node.name}.json`,
      type: 'node_output',
      source: node.name,
      description: `JSON output from ${node.name}`,
      example: `{{ $node["${node.name}"].json }}`,
      dataType: 'Object',
      path: `$node["${node.name}"].json`,
    });

    variables.push({
      name: `${node.name}.binary`,
      type: 'node_output',
      source: node.name,
      description: `Binary output from ${node.name}`,
      example: `{{ $node["${node.name}"].binary }}`,
      dataType: 'Object',
      path: `$node["${node.name}"].binary`,
    });

    variables.push({
      name: `${node.name}.context`,
      type: 'node_output',
      source: node.name,
      description: `Context from ${node.name}`,
      example: `{{ $node["${node.name}"].context }}`,
      dataType: 'Object',
      path: `$node["${node.name}"].context`,
    });

    // Add parameter-based variables if available
    if (node.parameters && Object.keys(node.parameters).length > 0) {
      Object.keys(node.parameters).forEach(param => {
        variables.push({
          name: `${node.name}.parameter.${param}`,
          type: 'node_output',
          source: node.name,
          description: `Parameter "${param}" from ${node.name}`,
          example: `{{ $node["${node.name}"].parameter["${param}"] }}`,
          dataType: 'unknown',
          path: `$node["${node.name}"].parameter["${param}"]`,
        });
      });
    }
  });

  return variables;
}

/**
 * Get all possible node output variables from the workflow
 */
async function getAllNodeOutputVariables(workflow: N8nWorkflow): Promise<WorkflowVariable[]> {
  const variables: WorkflowVariable[] = [];

  if (!workflow.nodes) {
    return variables;
  }

  workflow.nodes.forEach(node => {
    variables.push({
      name: `${node.name}.json`,
      type: 'node_output',
      source: node.name,
      description: `JSON output from ${node.name} (${node.type})`,
      example: `{{ $node["${node.name}"].json }}`,
      dataType: 'Object',
      path: `$node["${node.name}"].json`,
    });

    variables.push({
      name: `${node.name}.binary`,
      type: 'node_output',
      source: node.name,
      description: `Binary output from ${node.name} (${node.type})`,
      example: `{{ $node["${node.name}"].binary }}`,
      dataType: 'Object',
      path: `$node["${node.name}"].binary`,
    });
  });

  return variables;
}

/**
 * Get available expression functions
 */
function getExpressionFunctions(): WorkflowVariable[] {
  return [
    // Date functions
    {
      name: 'DateTime.now()',
      type: 'expression_function',
      source: 'n8n-expressions',
      description: 'Get current date and time',
      example: '{{ DateTime.now() }}',
      dataType: 'DateTime',
    },
    {
      name: 'DateTime.format()',
      type: 'expression_function',
      source: 'n8n-expressions',
      description: 'Format date and time',
      example: '{{ DateTime.now().format("yyyy-MM-dd") }}',
      dataType: 'string',
    },

    // String functions
    {
      name: 'String.toLowerCase()',
      type: 'expression_function',
      source: 'n8n-expressions',
      description: 'Convert string to lowercase',
      example: '{{ "HELLO".toLowerCase() }}',
      dataType: 'string',
    },
    {
      name: 'String.toUpperCase()',
      type: 'expression_function',
      source: 'n8n-expressions',
      description: 'Convert string to uppercase',
      example: '{{ "hello".toUpperCase() }}',
      dataType: 'string',
    },

    // Math functions
    {
      name: 'Math.floor()',
      type: 'expression_function',
      source: 'n8n-expressions',
      description: 'Round number down',
      example: '{{ Math.floor(4.7) }}',
      dataType: 'number',
    },
    {
      name: 'Math.random()',
      type: 'expression_function',
      source: 'n8n-expressions',
      description: 'Generate random number',
      example: '{{ Math.random() }}',
      dataType: 'number',
    },

    // Array functions
    {
      name: 'Array.length',
      type: 'expression_function',
      source: 'n8n-expressions',
      description: 'Get array length',
      example: '{{ $json.items.length }}',
      dataType: 'number',
    },

    // Object functions
    {
      name: 'Object.keys()',
      type: 'expression_function',
      source: 'n8n-expressions',
      description: 'Get object keys',
      example: '{{ Object.keys($json) }}',
      dataType: 'Array<string>',
    },
  ];
}

/**
 * Find nodes that precede the given node in the workflow
 */
function findPrecedingNodes(workflow: N8nWorkflow, nodeId: string): N8nNode[] {
  const precedingNodes: N8nNode[] = [];

  if (!workflow.nodes || !workflow.connections) {
    return precedingNodes;
  }

  // Look through connections to find nodes that connect to the current node
  Object.keys(workflow.connections).forEach(sourceNodeId => {
    const connections = workflow.connections[sourceNodeId] as any;
    if (connections && connections.main) {
      connections.main.forEach((outputConnections: any) => {
        if (Array.isArray(outputConnections)) {
          outputConnections.forEach((connection: any) => {
            if (connection.node === nodeId) {
              const sourceNode = workflow.nodes!.find(n => n.id === sourceNodeId);
              if (sourceNode && !precedingNodes.find(n => n.id === sourceNode.id)) {
                precedingNodes.push(sourceNode);
              }
            }
          });
        }
      });
    }
  });

  return precedingNodes;
}
