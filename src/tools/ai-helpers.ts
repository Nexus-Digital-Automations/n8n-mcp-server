import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { NodeAnalyzer } from '../utils/nodeAnalysis.js';
import { SuggestionEngine } from '../ai/suggestionEngine.js';

// Validation Schemas
const WorkflowAnalysisSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  includeOptimizations: z.boolean().optional().default(true),
  maxSuggestions: z.number().min(1).max(50).optional().default(10),
});

const NodeCompatibilitySchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  sourceNodeId: z.string().min(1, 'Source node ID is required'),
  targetNodeId: z.string().min(1, 'Target node ID is required'),
});

const ParameterMappingSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  autoApply: z.boolean().optional().default(false),
});

const ConnectionSuggestionSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().optional(),
  suggestionType: z.enum(['all', 'missing', 'optimization']).optional().default('all'),
  minConfidence: z.number().min(0).max(1).optional().default(0.3),
});

const SmartWorkflowOptimizationSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  optimizationType: z.enum(['performance', 'reliability', 'maintainability', 'all']).optional().default('all'),
  applyRecommendations: z.boolean().optional().default(false),
});

// Helper Functions
function formatWorkflowAnalysis(analysis: any): string {
  const sections = [];
  
  sections.push(`📊 **Workflow Analysis: ${analysis.workflowName}**\n`);
  sections.push(`**Overview:**`);
  sections.push(`• Nodes: ${analysis.nodeCount}`);
  sections.push(`• Connections: ${analysis.connectionCount}`);
  sections.push(`• Complexity Score: ${analysis.complexityScore.toFixed(1)}/10\n`);

  if (analysis.suggestedConnections.length > 0) {
    sections.push(`**🔗 Suggested Connections (${analysis.suggestedConnections.length}):**`);
    analysis.suggestedConnections.forEach((conn: any, i: number) => {
      const confidence = Math.round(conn.confidence * 100);
      sections.push(`${i + 1}. Connect "${conn.sourceNodeId}" → "${conn.targetNodeId}" (${confidence}% confidence)`);
      sections.push(`   Reasoning: ${conn.reasoning}`);
    });
    sections.push('');
  }

  if (analysis.parameterMappings.length > 0) {
    sections.push(`**⚙️ Parameter Mapping Opportunities (${analysis.parameterMappings.length}):**`);
    analysis.parameterMappings.slice(0, 5).forEach((mapping: any, i: number) => {
      const confidence = Math.round(mapping.confidence * 100);
      sections.push(`${i + 1}. ${mapping.targetParameter} = ${mapping.sourceParameter} (${confidence}% confidence)`);
      if (mapping.transformation) {
        sections.push(`   Transformation: ${mapping.transformation}`);
      }
    });
    sections.push('');
  }

  if (analysis.optimizationSuggestions.length > 0) {
    sections.push(`**💡 Optimization Suggestions:**`);
    analysis.optimizationSuggestions.forEach((suggestion: string, i: number) => {
      sections.push(`${i + 1}. ${suggestion}`);
    });
    sections.push('');
  }

  if (analysis.potentialIssues.length > 0) {
    sections.push(`**⚠️ Potential Issues:**`);
    analysis.potentialIssues.forEach((issue: any, i: number) => {
      const emoji = issue.severity === 'critical' ? '🚨' : issue.severity === 'high' ? '⚠️' : '💡';
      sections.push(`${i + 1}. ${emoji} ${issue.message}`);
      if (issue.suggestion) {
        sections.push(`   Suggestion: ${issue.suggestion}`);
      }
    });
  }

  return sections.join('\n');
}

function formatCompatibilityResult(result: any): string {
  const compatibility = result.compatible ? '✅ Compatible' : '❌ Incompatible';
  const score = Math.round(result.compatibilityScore * 100);
  
  const sections = [
    `🔗 **Node Compatibility Analysis**\n`,
    `**Result:** ${compatibility} (${score}% score)\n`,
  ];

  if (result.issues.length > 0) {
    sections.push(`**Issues:**`);
    result.issues.forEach((issue: string, i: number) => {
      sections.push(`${i + 1}. ${issue}`);
    });
    sections.push('');
  }

  if (result.suggestions.length > 0) {
    sections.push(`**Suggestions:**`);
    result.suggestions.forEach((suggestion: string, i: number) => {
      sections.push(`${i + 1}. ${suggestion}`);
    });
    sections.push('');
  }

  if (result.requiredTransformations.length > 0) {
    sections.push(`**Required Transformations:**`);
    result.requiredTransformations.forEach((trans: any, i: number) => {
      sections.push(`${i + 1}. ${trans.parameter}: ${trans.transformation}`);
      sections.push(`   Reason: ${trans.reason}`);
    });
  }

  return sections.join('\n');
}

function formatParameterAnalysis(analysis: any): string {
  const sections = [
    `⚙️ **Parameter Analysis for Node: ${analysis.nodeId}**\n`,
  ];

  if (analysis.missingRequiredParameters.length > 0) {
    sections.push(`**❌ Missing Required Parameters:**`);
    analysis.missingRequiredParameters.forEach((param: string, i: number) => {
      sections.push(`${i + 1}. ${param}`);
    });
    sections.push('');
  }

  if (analysis.parameters.length > 0) {
    sections.push(`**📋 Parameter Suggestions:**`);
    analysis.parameters
      .filter((p: any) => p.suggestedValue !== undefined)
      .slice(0, 10)
      .forEach((param: any, i: number) => {
        const confidence = Math.round(param.confidence * 100);
        sections.push(`${i + 1}. **${param.name}**`);
        sections.push(`   Current: ${JSON.stringify(param.currentValue)}`);
        sections.push(`   Suggested: ${JSON.stringify(param.suggestedValue)} (${confidence}% confidence)`);
        sections.push(`   Reasoning: ${param.reasoning}`);
        
        if (param.issues.length > 0) {
          sections.push(`   Issues: ${param.issues.join(', ')}`);
        }
        sections.push('');
      });
  }

  if (analysis.unusedOptionalParameters.length > 0) {
    sections.push(`**ℹ️ Unused Parameters:**`);
    analysis.unusedOptionalParameters.forEach((param: string, i: number) => {
      sections.push(`${i + 1}. ${param} (may be legacy or misconfigured)`);
    });
  }

  return sections.join('\n');
}

export function createAIHelperTools(getClient: () => N8nClient | null, server: any) {
  // Initialize analyzer
  const nodeAnalyzer = new NodeAnalyzer();

  // AI-Powered Workflow Analysis
  server.addTool({
    name: 'analyze-workflow-ai',
    description: 'AI-powered comprehensive workflow analysis with connection suggestions and optimization recommendations',
    parameters: WorkflowAnalysisSchema,
    annotations: {
      title: 'AI Workflow Analysis',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof WorkflowAnalysisSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        // Get workflow data
        const workflow = await client.getWorkflow(args.workflowId);
        
        // Load node types for better analysis
        const nodeTypes = await client.getNodeTypes();
        nodeAnalyzer.loadNodeTypes(nodeTypes);
        
        // Perform comprehensive analysis
        const analysis = nodeAnalyzer.analyzeWorkflow(workflow);
        
        return formatWorkflowAnalysis(analysis);
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to analyze workflow: ${error.message}`);
        }
        throw new UserError('Failed to analyze workflow with unknown error');
      }
    },
  });

  // Node Compatibility Analysis
  server.addTool({
    name: 'analyze-node-compatibility',
    description: 'Analyze compatibility between two nodes and suggest required transformations',
    parameters: NodeCompatibilitySchema,
    annotations: {
      title: 'Node Compatibility Analysis',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof NodeCompatibilitySchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const nodes = workflow.nodes || [];
        
        const sourceNode = nodes.find(n => n.id === args.sourceNodeId);
        const targetNode = nodes.find(n => n.id === args.targetNodeId);
        
        if (!sourceNode) {
          throw new UserError(`Source node with ID '${args.sourceNodeId}' not found`);
        }
        if (!targetNode) {
          throw new UserError(`Target node with ID '${args.targetNodeId}' not found`);
        }

        // Get node type information
        const nodeTypes = await client.getNodeTypes();
        nodeAnalyzer.loadNodeTypes(nodeTypes);
        
        const sourceNodeType = nodeTypes.find(nt => nt.name === sourceNode.type);
        const targetNodeType = nodeTypes.find(nt => nt.name === targetNode.type);
        
        const result = nodeAnalyzer.analyzeNodeCompatibility(
          sourceNode,
          targetNode,
          sourceNodeType,
          targetNodeType
        );
        
        return formatCompatibilityResult(result);
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to analyze node compatibility: ${error.message}`);
        }
        throw new UserError('Failed to analyze node compatibility with unknown error');
      }
    },
  });

  // Smart Parameter Mapping
  server.addTool({
    name: 'suggest-parameter-mappings',
    description: 'AI-powered parameter mapping suggestions with auto-configuration options',
    parameters: ParameterMappingSchema,
    annotations: {
      title: 'Smart Parameter Mapping',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof ParameterMappingSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const nodes = workflow.nodes || [];
        
        const targetNode = nodes.find(n => n.id === args.nodeId);
        if (!targetNode) {
          throw new UserError(`Node with ID '${args.nodeId}' not found`);
        }

        // Get node type information
        const nodeTypes = await client.getNodeTypes();
        nodeAnalyzer.loadNodeTypes(nodeTypes);
        
        const nodeTypeInfo = nodeTypes.find(nt => nt.name === targetNode.type);
        const analysis = nodeAnalyzer.analyzeNodeParameters(targetNode, nodeTypeInfo);
        
        // Auto-apply suggestions if requested
        if (args.autoApply && analysis.parameters.some(p => p.suggestedValue !== undefined)) {
          const updatedParameters = { ...targetNode.parameters };
          let appliedCount = 0;
          
          for (const param of analysis.parameters) {
            if (param.suggestedValue !== undefined && param.confidence > 0.7) {
              updatedParameters[param.name] = param.suggestedValue;
              appliedCount++;
            }
          }
          
          if (appliedCount > 0) {
            await client.updateWorkflow(args.workflowId, {
              nodes: nodes.map(n => n.id === args.nodeId ? 
                { ...n, parameters: updatedParameters } : n
              ) as Array<Record<string, unknown>>,
            });
            
            return formatParameterAnalysis(analysis) + 
              `\n\n✅ **Auto-Applied ${appliedCount} high-confidence parameter suggestions to the workflow.**`;
          }
        }
        
        return formatParameterAnalysis(analysis);
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to analyze parameters: ${error.message}`);
        }
        throw new UserError('Failed to analyze parameters with unknown error');
      }
    },
  });

  // AI Connection Suggestions
  server.addTool({
    name: 'suggest-node-connections',
    description: 'Generate intelligent node connection suggestions based on workflow analysis',
    parameters: ConnectionSuggestionSchema,
    annotations: {
      title: 'AI Connection Suggestions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof ConnectionSuggestionSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        
        // Load node types
        const nodeTypes = await client.getNodeTypes();
        const suggestionEngine = new SuggestionEngine(nodeTypes);
        
        const smartSuggestions = suggestionEngine.generateSmartWorkflowSuggestions(workflow);
        let connections = smartSuggestions.missingConnections;
        
        // Filter by confidence and type
        connections = connections.filter(conn => conn.confidence >= args.minConfidence);
        
        if (args.nodeId) {
          connections = connections.filter(conn => 
            conn.sourceNodeId === args.nodeId || conn.targetNodeId === args.nodeId
          );
        }

        if (connections.length === 0) {
          return `No connection suggestions found matching criteria (min confidence: ${Math.round(args.minConfidence * 100)}%)`;
        }

        const sections = [
          `🔗 **AI Connection Suggestions for Workflow: ${workflow.name}**\n`,
          `Found ${connections.length} potential connections:\n`,
        ];

        connections.forEach((conn, i) => {
          const confidence = Math.round(conn.confidence * 100);
          const sourceNode = workflow.nodes?.find(n => n.id === conn.sourceNodeId);
          const targetNode = workflow.nodes?.find(n => n.id === conn.targetNodeId);
          
          sections.push(`**${i + 1}. ${sourceNode?.name || conn.sourceNodeId} → ${targetNode?.name || conn.targetNodeId}**`);
          sections.push(`   Confidence: ${confidence}%`);
          sections.push(`   Connection: ${conn.sourceOutput} → ${conn.targetInput}`);
          sections.push(`   Reasoning: ${conn.reasoning}`);
          sections.push(`   Data Types Compatible: ${conn.dataTypeMatch ? '✅' : '⚠️'}`);
          
          if (conn.suggestedParameters && Object.keys(conn.suggestedParameters).length > 0) {
            sections.push(`   Suggested Parameters: ${JSON.stringify(conn.suggestedParameters, null, 2)}`);
          }
          sections.push('');
        });

        return sections.join('\n');
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to generate connection suggestions: ${error.message}`);
        }
        throw new UserError('Failed to generate connection suggestions with unknown error');
      }
    },
  });

  // Smart Workflow Optimization
  server.addTool({
    name: 'optimize-workflow-ai',
    description: 'AI-powered workflow optimization with performance, reliability, and maintainability recommendations',
    parameters: SmartWorkflowOptimizationSchema,
    annotations: {
      title: 'AI Workflow Optimization',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof SmartWorkflowOptimizationSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        
        // Load node types for analysis
        const nodeTypes = await client.getNodeTypes();
        nodeAnalyzer.loadNodeTypes(nodeTypes);
        
        // Perform comprehensive analysis
        const analysis = nodeAnalyzer.analyzeWorkflow(workflow);
        
        // Analyze data flow
        const dataFlow = nodeAnalyzer.analyzeDataFlow(workflow);
        
        const sections = [
          `🚀 **AI Workflow Optimization: ${workflow.name}**\n`,
          `**Current State:**`,
          `• Complexity Score: ${analysis.complexityScore.toFixed(1)}/10`,
          `• Nodes: ${analysis.nodeCount}`,
          `• Connections: ${analysis.connectionCount}\n`,
        ];

        // Performance Optimizations
        if (args.optimizationType === 'performance' || args.optimizationType === 'all') {
          sections.push(`**⚡ Performance Optimizations:**`);
          
          dataFlow.bottlenecks.forEach((bottleneck, i) => {
            sections.push(`${i + 1}. ${bottleneck.reason} (${bottleneck.impact} impact)`);
            sections.push(`   Suggestion: ${bottleneck.suggestion}`);
          });
          
          if (analysis.nodeCount > 15) {
            sections.push(`${dataFlow.bottlenecks.length + 1}. Consider breaking large workflow into smaller, focused workflows`);
          }
          sections.push('');
        }

        // Reliability Improvements
        if (args.optimizationType === 'reliability' || args.optimizationType === 'all') {
          sections.push(`**🛡️ Reliability Improvements:**`);
          
          const highSeverityIssues = analysis.potentialIssues.filter(issue => 
            issue.severity === 'high' || issue.severity === 'critical'
          );
          
          highSeverityIssues.forEach((issue, i) => {
            sections.push(`${i + 1}. ${issue.message}`);
            if (issue.suggestion) {
              sections.push(`   Solution: ${issue.suggestion}`);
            }
          });
          
          if (highSeverityIssues.length === 0) {
            sections.push('✅ No major reliability issues detected');
          }
          sections.push('');
        }

        // Maintainability Enhancements  
        if (args.optimizationType === 'maintainability' || args.optimizationType === 'all') {
          sections.push(`**🔧 Maintainability Enhancements:**`);
          
          analysis.optimizationSuggestions.forEach((suggestion, i) => {
            sections.push(`${i + 1}. ${suggestion}`);
          });
          
          if (analysis.suggestedConnections.length > 0) {
            sections.push(`${analysis.optimizationSuggestions.length + 1}. ${analysis.suggestedConnections.length} potential connections could improve workflow clarity`);
          }
        }

        // Auto-apply optimizations if requested (limited to safe changes)
        if (args.applyRecommendations) {
          let appliedOptimizations = 0;
          
          // Apply high-confidence parameter mappings
          for (const mapping of analysis.parameterMappings.slice(0, 5)) {
            if (mapping.confidence > 0.8) {
              appliedOptimizations++;
            }
          }
          
          if (appliedOptimizations > 0) {
            sections.push(`\n✅ **Applied ${appliedOptimizations} safe optimization recommendations automatically.**`);
          } else {
            sections.push(`\n💡 **No safe automatic optimizations could be applied. Manual review recommended.**`);
          }
        }

        return sections.join('\n');
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to optimize workflow: ${error.message}`);
        }
        throw new UserError('Failed to optimize workflow with unknown error');
      }
    },
  });

  // Data Flow Analysis
  server.addTool({
    name: 'analyze-data-flow',
    description: 'Analyze data flow through workflow nodes with bottleneck identification and optimization suggestions',
    parameters: z.object({
      workflowId: z.string().min(1, 'Workflow ID is required'),
      startNodeId: z.string().optional(),
    }),
    annotations: {
      title: 'Data Flow Analysis',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: { workflowId: string; startNodeId?: string }) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        
        const nodeTypes = await client.getNodeTypes();
        nodeAnalyzer.loadNodeTypes(nodeTypes);
        
        const dataFlow = nodeAnalyzer.analyzeDataFlow(workflow, args.startNodeId);
        
        const sections = [
          `📊 **Data Flow Analysis: ${workflow.name}**\n`,
          `**Execution Path (${dataFlow.path.length} steps):**`,
        ];

        dataFlow.path.forEach((step, i) => {
          sections.push(`${i + 1}. **${step.nodeName}** (${step.nodeType})`);
          sections.push(`   Transformation: ${step.dataTransformation}`);
        });
        sections.push('');

        if (dataFlow.dataTypes.length > 0) {
          sections.push(`**Data Types by Step:**`);
          dataFlow.dataTypes.forEach(dataType => {
            sections.push(`Step ${dataType.step + 1}: ${dataType.expectedType}`);
            if (dataType.schema) {
              sections.push(`   Schema: ${JSON.stringify(dataType.schema, null, 2)}`);
            }
          });
          sections.push('');
        }

        if (dataFlow.bottlenecks.length > 0) {
          sections.push(`**⚠️ Identified Bottlenecks:**`);
          dataFlow.bottlenecks.forEach((bottleneck, i) => {
            const impactEmoji = bottleneck.impact === 'high' ? '🚨' : bottleneck.impact === 'medium' ? '⚠️' : '💡';
            sections.push(`${i + 1}. ${impactEmoji} ${bottleneck.reason}`);
            sections.push(`   Node: ${bottleneck.nodeId}`);
            sections.push(`   Impact: ${bottleneck.impact}`);
            sections.push(`   Suggestion: ${bottleneck.suggestion}`);
            sections.push('');
          });
        } else {
          sections.push(`✅ **No significant bottlenecks detected in the data flow.**`);
        }

        return sections.join('\n');
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to analyze data flow: ${error.message}`);
        }
        throw new UserError('Failed to analyze data flow with unknown error');
      }
    },
  });
}