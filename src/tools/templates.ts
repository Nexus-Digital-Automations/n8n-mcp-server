import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { N8nWorkflow } from '../types/n8n.js';

// Zod schemas for template and pattern management
const TemplateSearchSchema = z.object({
  query: z.string().optional(),
  category: z.enum(['automation', 'data-processing', 'integration', 'notification', 'ai-workflow', 'e-commerce', 'all']).optional().default('all'),
  complexity: z.enum(['simple', 'intermediate', 'advanced', 'all']).optional().default('all'),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(50).optional().default(20),
});

const TemplateExportSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  templateName: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  category: z.enum(['automation', 'data-processing', 'integration', 'notification', 'ai-workflow', 'e-commerce']),
  tags: z.array(z.string()).optional(),
  includeCredentials: z.boolean().optional().default(false),
  makeSensitiveDataGeneric: z.boolean().optional().default(true),
});

const TemplateImportSchema = z.object({
  templateData: z.record(z.any()),
  workflowName: z.string().min(1, 'Workflow name is required'),
  parameterMapping: z.record(z.string()).optional(),
  replaceCredentials: z.record(z.string()).optional(),
  activate: z.boolean().optional().default(false),
});

const PatternAnalysisSchema = z.object({
  workflowId: z.string().optional(),
  patternType: z.enum(['integration', 'data-transformation', 'error-handling', 'notification', 'ai-processing', 'all']).optional().default('all'),
  includeRecommendations: z.boolean().optional().default(true),
});

const BestPracticesSchema = z.object({
  workflowId: z.string().optional(),
  category: z.enum(['structure', 'performance', 'security', 'maintainability', 'all']).optional().default('all'),
  includeExamples: z.boolean().optional().default(true),
});

// Curated template library (in production, this would connect to n8n's template API or database)
const TEMPLATE_LIBRARY = {
  automation: [
    {
      id: 'auto-1',
      name: 'Automated Email Response System',
      description: 'Automatically respond to emails based on content analysis and predefined rules',
      category: 'automation',
      complexity: 'intermediate',
      tags: ['email', 'automation', 'ai', 'response'],
      nodeCount: 8,
      estimatedSetupTime: '30 minutes',
      features: ['Email parsing', 'AI content analysis', 'Conditional responses', 'Logging'],
      useCase: 'Customer support automation'
    },
    {
      id: 'auto-2', 
      name: 'Social Media Post Scheduler',
      description: 'Schedule and automatically post content across multiple social media platforms',
      category: 'automation',
      complexity: 'simple',
      tags: ['social-media', 'scheduling', 'content'],
      nodeCount: 6,
      estimatedSetupTime: '20 minutes',
      features: ['Multi-platform posting', 'Content scheduling', 'Image handling', 'Analytics tracking'],
      useCase: 'Social media management'
    }
  ],
  'data-processing': [
    {
      id: 'data-1',
      name: 'CSV Data Transformation Pipeline',
      description: 'Transform, validate, and enrich CSV data with external APIs',
      category: 'data-processing',
      complexity: 'intermediate',
      tags: ['csv', 'data-transformation', 'validation', 'api'],
      nodeCount: 12,
      estimatedSetupTime: '45 minutes',
      features: ['CSV parsing', 'Data validation', 'API enrichment', 'Error handling', 'Output formatting'],
      useCase: 'Data migration and processing'
    },
    {
      id: 'data-2',
      name: 'Real-time Data Aggregation',
      description: 'Aggregate data from multiple sources in real-time with caching',
      category: 'data-processing',
      complexity: 'advanced',
      tags: ['real-time', 'aggregation', 'caching', 'multiple-sources'],
      nodeCount: 15,
      estimatedSetupTime: '60 minutes',
      features: ['Multi-source integration', 'Real-time processing', 'Data caching', 'Performance optimization'],
      useCase: 'Business intelligence dashboards'
    }
  ],
  integration: [
    {
      id: 'int-1',
      name: 'CRM to Marketing Automation Sync',
      description: 'Sync customer data between CRM and marketing automation platforms',
      category: 'integration',
      complexity: 'intermediate',
      tags: ['crm', 'marketing', 'sync', 'customer-data'],
      nodeCount: 10,
      estimatedSetupTime: '40 minutes',
      features: ['Bidirectional sync', 'Data mapping', 'Conflict resolution', 'Audit logging'],
      useCase: 'Sales and marketing alignment'
    },
    {
      id: 'int-2',
      name: 'E-commerce Order Processing',
      description: 'Process e-commerce orders across multiple systems and platforms',
      category: 'integration',
      complexity: 'advanced',
      tags: ['e-commerce', 'orders', 'inventory', 'fulfillment'],
      nodeCount: 18,
      estimatedSetupTime: '90 minutes',
      features: ['Order validation', 'Inventory management', 'Payment processing', 'Fulfillment automation'],
      useCase: 'E-commerce operations'
    }
  ],
  notification: [
    {
      id: 'notif-1',
      name: 'Smart Alert System',
      description: 'Intelligent alert system with escalation and multiple notification channels',
      category: 'notification',
      complexity: 'intermediate',
      tags: ['alerts', 'escalation', 'multi-channel', 'intelligent'],
      nodeCount: 9,
      estimatedSetupTime: '35 minutes',
      features: ['Smart routing', 'Escalation rules', 'Multiple channels', 'Alert deduplication'],
      useCase: 'System monitoring and alerting'
    }
  ],
  'ai-workflow': [
    {
      id: 'ai-1',
      name: 'Document Analysis and Classification',
      description: 'AI-powered document analysis with automatic classification and data extraction',
      category: 'ai-workflow',
      complexity: 'advanced',
      tags: ['ai', 'document-processing', 'classification', 'extraction'],
      nodeCount: 14,
      estimatedSetupTime: '75 minutes',
      features: ['AI document analysis', 'Auto-classification', 'Data extraction', 'Confidence scoring'],
      useCase: 'Document management and processing'
    },
    {
      id: 'ai-2',
      name: 'Intelligent Content Generation',
      description: 'Generate and optimize content using AI with quality validation',
      category: 'ai-workflow',
      complexity: 'intermediate',
      tags: ['ai', 'content-generation', 'optimization', 'validation'],
      nodeCount: 11,
      estimatedSetupTime: '50 minutes',
      features: ['AI content generation', 'Quality validation', 'Multi-format output', 'Brand consistency'],
      useCase: 'Content marketing automation'
    }
  ]
};

// Common workflow patterns
const WORKFLOW_PATTERNS = {
  'error-handling': {
    name: 'Comprehensive Error Handling',
    description: 'Best practices for implementing robust error handling in workflows',
    pattern: 'Try-Catch blocks with retry logic, fallback mechanisms, and error notifications',
    nodes: ['Error Trigger', 'Retry Logic', 'Fallback Action', 'Error Notification'],
    implementation: 'Use error trigger nodes after critical operations, implement exponential backoff for retries'
  },
  'data-validation': {
    name: 'Data Validation Pipeline',
    description: 'Systematic approach to validating and sanitizing input data',
    pattern: 'Input validation → Data sanitization → Business rule validation → Error reporting',
    nodes: ['Validation Node', 'Set Node (cleaning)', 'IF Node (business rules)', 'Error Handler'],
    implementation: 'Validate data types, check business rules, sanitize inputs, handle validation failures'
  },
  'api-integration': {
    name: 'Reliable API Integration',
    description: 'Best practices for integrating with external APIs',
    pattern: 'Rate limiting → Authentication → Request → Retry logic → Response handling',
    nodes: ['Wait Node', 'HTTP Request', 'IF Node (status check)', 'Error Handler'],
    implementation: 'Implement rate limiting, proper authentication, status code handling, and retry mechanisms'
  },
  'notification-system': {
    name: 'Multi-Channel Notification System',
    description: 'Flexible notification system with multiple channels and priorities',
    pattern: 'Priority assessment → Channel selection → Message formatting → Delivery → Confirmation',
    nodes: ['Switch Node (priority)', 'Multiple notification nodes', 'Webhook (confirmation)'],
    implementation: 'Route notifications based on priority, use multiple channels, confirm delivery'
  }
};

// Tool registration function for template and pattern management tools
export function createTemplateTools(getClient: () => N8nClient | null, server: any) {
  // Search workflow templates
  server.addTool({
    name: 'search-workflow-templates',
    description: 'Search and browse curated workflow templates by category, complexity, and functionality',
    parameters: TemplateSearchSchema,
    annotations: {
      title: 'Search Workflow Templates',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof TemplateSearchSchema>) => {
      try {
        let allTemplates: any[] = [];
        
        // Collect templates from all categories
        Object.entries(TEMPLATE_LIBRARY).forEach(([category, templates]) => {
          if (args.category === 'all' || args.category === category) {
            allTemplates.push(...templates.map(template => ({ ...template, category })));
          }
        });

        // Filter by complexity
        if (args.complexity !== 'all') {
          allTemplates = allTemplates.filter(template => template.complexity === args.complexity);
        }

        // Filter by search query
        if (args.query) {
          const query = args.query.toLowerCase();
          allTemplates = allTemplates.filter(template =>
            template.name.toLowerCase().includes(query) ||
            template.description.toLowerCase().includes(query) ||
            template.tags.some((tag: string) => tag.toLowerCase().includes(query)) ||
            template.useCase.toLowerCase().includes(query)
          );
        }

        // Filter by tags
        if (args.tags && args.tags.length > 0) {
          allTemplates = allTemplates.filter(template =>
            args.tags!.some(tag => template.tags.includes(tag.toLowerCase()))
          );
        }

        // Limit results
        allTemplates = allTemplates.slice(0, args.limit);

        if (allTemplates.length === 0) {
          return `No templates found matching your criteria:\n` +
                 `- Category: ${args.category}\n` +
                 `- Complexity: ${args.complexity}\n` +
                 `- Query: ${args.query || 'None'}\n` +
                 `- Tags: ${args.tags?.join(', ') || 'None'}\n\n` +
                 `Try broadening your search criteria or browse all templates.`;
        }

        let result = `# Workflow Template Search Results\n\n`;
        result += `**Found ${allTemplates.length} template(s) matching your criteria**\n`;
        result += `**Search Query**: ${args.query || 'All templates'}\n`;
        result += `**Category**: ${args.category}\n`;
        result += `**Complexity**: ${args.complexity}\n\n`;

        allTemplates.forEach((template, index) => {
          const complexityIcon = template.complexity === 'simple' ? '🟢' :
                                 template.complexity === 'intermediate' ? '🟡' : '🔴';
          
          result += `## ${index + 1}. ${template.name} ${complexityIcon}\n`;
          result += `**Category**: ${template.category.charAt(0).toUpperCase() + template.category.slice(1)}\n`;
          result += `**Complexity**: ${template.complexity.charAt(0).toUpperCase() + template.complexity.slice(1)}\n`;
          result += `**Description**: ${template.description}\n`;
          result += `**Use Case**: ${template.useCase}\n`;
          result += `**Setup Time**: ${template.estimatedSetupTime}\n`;
          result += `**Node Count**: ${template.nodeCount} nodes\n`;
          result += `**Tags**: ${template.tags.join(', ')}\n`;
          
          result += `**Features**:\n`;
          template.features.forEach((feature: string) => {
            result += `- ${feature}\n`;
          });
          
          result += `**Template ID**: \`${template.id}\` (use with import-workflow-template)\n\n`;
        });

        result += `## 🔧 Next Steps\n`;
        result += `- Use \`import-workflow-template\` with a template ID to import a template\n`;
        result += `- Use \`export-workflow-template\` to create your own templates\n`;
        result += `- Use \`analyze-workflow-patterns\` to understand common patterns\n`;

        return result;
      } catch (error: any) {
        throw new UserError(`Failed to search templates: ${error.message}`);
      }
    },
  });

  // Export workflow as template
  server.addTool({
    name: 'export-workflow-template',
    description: 'Export an existing workflow as a reusable template with parameter mapping and sensitive data protection',
    parameters: TemplateExportSchema,
    annotations: {
      title: 'Export Workflow Template',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof TemplateExportSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        
        // Create template structure
        const template = {
          id: `custom-${Date.now()}`,
          name: args.templateName,
          description: args.description || `Template created from workflow: ${workflow.name}`,
          category: args.category,
          tags: args.tags || [],
          complexity: workflow.nodes && workflow.nodes.length > 15 ? 'advanced' :
                      workflow.nodes && workflow.nodes.length > 8 ? 'intermediate' : 'simple',
          nodeCount: workflow.nodes?.length || 0,
          estimatedSetupTime: workflow.nodes && workflow.nodes.length > 15 ? '60+ minutes' :
                              workflow.nodes && workflow.nodes.length > 8 ? '30-45 minutes' : '15-30 minutes',
          exportDate: new Date().toISOString(),
          originalWorkflow: {
            id: workflow.id,
            name: workflow.name,
            active: workflow.active,
          },
          template: {
            nodes: workflow.nodes || [],
            connections: workflow.connections || {},
            settings: workflow.settings || {},
          },
          parameterMapping: {} as Record<string, string>,
          sensitiveDataFields: [] as string[],
          requirements: {
            credentials: [] as string[],
            externalServices: [] as string[],
            prerequisites: [] as string[],
          },
        };

        // Analyze workflow for sensitive data and requirements
        const credentialTypes = new Set<string>();
        const externalServices = new Set<string>();
        const sensitiveFields: string[] = [];
        const parameterMapping: Record<string, string> = {};

        (workflow.nodes || []).forEach((node, nodeIndex) => {
          // Track credentials
          if (node.credentials) {
            Object.keys(node.credentials).forEach(credType => credentialTypes.add(credType));
          }

          // Identify external services
          const nodeType = node.type.toLowerCase();
          if (nodeType.includes('http') || nodeType.includes('webhook')) {
            externalServices.add('HTTP/Webhook APIs');
          } else if (nodeType.includes('slack')) {
            externalServices.add('Slack');
          } else if (nodeType.includes('gmail') || nodeType.includes('email')) {
            externalServices.add('Email Service');
          } else if (nodeType.includes('mysql') || nodeType.includes('postgres')) {
            externalServices.add('Database');
          } else if (nodeType.includes('ai') || nodeType.includes('openai') || nodeType.includes('anthropic')) {
            externalServices.add('AI Services');
          }

          // Process sensitive data
          if (args.makeSensitiveDataGeneric && node.parameters) {
            Object.entries(node.parameters).forEach(([key, value]) => {
              if (typeof value === 'string') {
                // Check for potentially sensitive data patterns
                if (value.includes('@') && value.includes('.')) {
                  // Email
                  parameterMapping[`node_${nodeIndex}_${key}`] = 'user@example.com';
                  sensitiveFields.push(`Node "${node.name}" - ${key} (email)`);
                } else if (value.match(/^https?:\/\//)) {
                  // URL
                  parameterMapping[`node_${nodeIndex}_${key}`] = 'https://example.com/api';
                  sensitiveFields.push(`Node "${node.name}" - ${key} (URL)`);
                } else if (value.match(/\b\d{10,}\b/)) {
                  // Long number (could be phone, ID, etc.)
                  parameterMapping[`node_${nodeIndex}_${key}`] = '1234567890';
                  sensitiveFields.push(`Node "${node.name}" - ${key} (numeric ID)`);
                } else if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token') || 
                          key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')) {
                  // API keys, tokens, secrets
                  parameterMapping[`node_${nodeIndex}_${key}`] = 'YOUR_API_KEY_HERE';
                  sensitiveFields.push(`Node "${node.name}" - ${key} (credential)`);
                }
              }
            });
          }
        });

        // Update template with analysis results
        template.requirements.credentials = Array.from(credentialTypes);
        template.requirements.externalServices = Array.from(externalServices);
        template.parameterMapping = parameterMapping;
        template.sensitiveDataFields = sensitiveFields;

        // Remove credentials from template if not explicitly included
        if (!args.includeCredentials) {
          template.template.nodes = template.template.nodes.map(node => ({
            ...node,
            credentials: {}
          }));
        }

        // Generate template export
        let exportResult = `# Template Export: "${args.templateName}"\n\n`;
        exportResult += `**Export Date**: ${new Date().toLocaleString()}\n`;
        exportResult += `**Source Workflow**: ${workflow.name} (${workflow.id})\n`;
        exportResult += `**Category**: ${args.category}\n`;
        exportResult += `**Complexity**: ${template.complexity}\n`;
        exportResult += `**Estimated Setup Time**: ${template.estimatedSetupTime}\n\n`;

        exportResult += `## 📋 Template Details\n`;
        exportResult += `- **Node Count**: ${template.nodeCount}\n`;
        exportResult += `- **Description**: ${template.description}\n`;
        exportResult += `- **Tags**: ${template.tags.join(', ') || 'None'}\n\n`;

        if (template.requirements.credentials.length > 0) {
          exportResult += `## 🔐 Required Credentials\n`;
          template.requirements.credentials.forEach(cred => {
            exportResult += `- ${cred}\n`;
          });
          exportResult += '\n';
        }

        if (template.requirements.externalServices.length > 0) {
          exportResult += `## 🌐 External Services\n`;
          template.requirements.externalServices.forEach(service => {
            exportResult += `- ${service}\n`;
          });
          exportResult += '\n';
        }

        if (sensitiveFields.length > 0) {
          exportResult += `## ⚠️ Sensitive Data Replaced\n`;
          exportResult += `The following fields contained sensitive data and were replaced with generic values:\n`;
          sensitiveFields.forEach(field => {
            exportResult += `- ${field}\n`;
          });
          exportResult += '\n';
        }

        exportResult += `## 🔧 Parameter Mapping\n`;
        if (Object.keys(parameterMapping).length > 0) {
          exportResult += `When importing this template, update these parameters:\n`;
          Object.entries(parameterMapping).forEach(([field, placeholder]) => {
            exportResult += `- **${field}**: Currently set to "${placeholder}"\n`;
          });
        } else {
          exportResult += `No sensitive parameters detected - template should work with minimal configuration.\n`;
        }
        exportResult += '\n';

        exportResult += `## 📦 Template Data\n`;
        exportResult += `\`\`\`json\n${JSON.stringify(template, null, 2)}\n\`\`\`\n\n`;

        exportResult += `## 🚀 Usage Instructions\n`;
        exportResult += `1. Save the template JSON above to a file\n`;
        exportResult += `2. Use \`import-workflow-template\` with the template data\n`;
        exportResult += `3. Configure required credentials and external service connections\n`;
        exportResult += `4. Update any parameter mappings with your specific values\n`;
        exportResult += `5. Test the imported workflow before activating\n\n`;

        exportResult += `## 📤 Quick Import Command\n`;
        exportResult += `Use this template ID for quick import: \`${template.id}\`\n`;
        exportResult += `Note: Custom templates are stored locally and may not persist across sessions.`;

        return exportResult;
      } catch (error: any) {
        throw new UserError(`Failed to export workflow template: ${error.message}`);
      }
    },
  });

  // Import workflow template
  server.addTool({
    name: 'import-workflow-template',
    description: 'Import a workflow template and create a new workflow with parameter mapping and credential configuration',
    parameters: TemplateImportSchema,
    annotations: {
      title: 'Import Workflow Template',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof TemplateImportSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const templateData = args.templateData;
        
        // Validate template structure
        if (!templateData.template || !templateData.template.nodes) {
          throw new UserError('Invalid template data: missing nodes structure');
        }

        // Clone template data to avoid modifying original
        const workflowData = JSON.parse(JSON.stringify(templateData.template));
        
        // Apply parameter mapping
        if (args.parameterMapping && Object.keys(args.parameterMapping).length > 0) {
          workflowData.nodes = workflowData.nodes.map((node: any, nodeIndex: number) => {
            if (node.parameters) {
              Object.entries(node.parameters).forEach(([key, value]) => {
                const mappingKey = `node_${nodeIndex}_${key}`;
                if (args.parameterMapping![mappingKey]) {
                  node.parameters[key] = args.parameterMapping![mappingKey];
                }
              });
            }
            return node;
          });
        }

        // Apply credential replacements
        if (args.replaceCredentials && Object.keys(args.replaceCredentials).length > 0) {
          workflowData.nodes = workflowData.nodes.map((node: any) => {
            if (node.credentials) {
              Object.entries(node.credentials).forEach(([credType, credData]) => {
                if (args.replaceCredentials![credType]) {
                  node.credentials[credType] = {
                    id: args.replaceCredentials![credType],
                    name: args.replaceCredentials![credType]
                  };
                }
              });
            }
            return node;
          });
        }

        // Generate unique node IDs
        const nodeIdMap = new Map<string, string>();
        workflowData.nodes = workflowData.nodes.map((node: any) => {
          const newId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          nodeIdMap.set(node.id, newId);
          return {
            ...node,
            id: newId,
            position: node.position || [100, 100],
          };
        });

        // Update connections with new node IDs
        const newConnections: Record<string, any> = {};
        Object.entries(workflowData.connections).forEach(([oldNodeId, connections]) => {
          const newNodeId = nodeIdMap.get(oldNodeId);
          if (newNodeId) {
            const updatedConnections: Record<string, any> = {};
            Object.entries(connections as Record<string, any>).forEach(([outputName, outputs]) => {
              if (Array.isArray(outputs)) {
                updatedConnections[outputName] = outputs.map((output: any) => ({
                  ...output,
                  node: nodeIdMap.get(output.node) || output.node,
                }));
              }
            });
            newConnections[newNodeId] = updatedConnections;
          }
        });

        workflowData.connections = newConnections;

        // Create the workflow
        const createWorkflowRequest = {
          name: args.workflowName,
          nodes: workflowData.nodes,
          connections: workflowData.connections,
          active: args.activate,
          settings: workflowData.settings || {},
        };

        const newWorkflow = await client.createWorkflow(createWorkflowRequest);

        let result = `# Template Import Successful! 🎉\n\n`;
        result += `**New Workflow Created**: ${newWorkflow.name}\n`;
        result += `**Workflow ID**: ${newWorkflow.id}\n`;
        result += `**Status**: ${newWorkflow.active ? '🟢 Active' : '🔴 Inactive'}\n`;
        result += `**Nodes Imported**: ${workflowData.nodes.length}\n`;
        result += `**Import Date**: ${new Date().toLocaleString()}\n\n`;

        // Show template information if available
        if (templateData.name) {
          result += `## 📋 Template Information\n`;
          result += `- **Template Name**: ${templateData.name}\n`;
          result += `- **Category**: ${templateData.category || 'Unknown'}\n`;
          result += `- **Complexity**: ${templateData.complexity || 'Unknown'}\n`;
          if (templateData.description) {
            result += `- **Description**: ${templateData.description}\n`;
          }
          result += '\n';
        }

        // Show applied mappings
        if (args.parameterMapping && Object.keys(args.parameterMapping).length > 0) {
          result += `## 🔧 Applied Parameter Mappings\n`;
          Object.entries(args.parameterMapping).forEach(([field, value]) => {
            result += `- **${field}**: ${value}\n`;
          });
          result += '\n';
        }

        // Show credential mappings
        if (args.replaceCredentials && Object.keys(args.replaceCredentials).length > 0) {
          result += `## 🔐 Applied Credential Mappings\n`;
          Object.entries(args.replaceCredentials).forEach(([credType, credId]) => {
            result += `- **${credType}**: ${credId}\n`;
          });
          result += '\n';
        }

        // Show requirements if available
        if (templateData.requirements) {
          const req = templateData.requirements;
          
          if (req.credentials && req.credentials.length > 0) {
            result += `## ⚠️ Required Credentials\n`;
            result += `Ensure these credentials are configured:\n`;
            req.credentials.forEach((cred: string) => {
              result += `- ${cred}\n`;
            });
            result += '\n';
          }

          if (req.externalServices && req.externalServices.length > 0) {
            result += `## 🌐 External Service Dependencies\n`;
            req.externalServices.forEach((service: string) => {
              result += `- ${service}\n`;
            });
            result += '\n';
          }

          if (req.prerequisites && req.prerequisites.length > 0) {
            result += `## 📋 Prerequisites\n`;
            req.prerequisites.forEach((prereq: string) => {
              result += `- ${prereq}\n`;
            });
            result += '\n';
          }
        }

        result += `## 🚀 Next Steps\n`;
        result += `1. **Review Configuration**: Check all node parameters and connections\n`;
        result += `2. **Configure Credentials**: Set up any required authentication\n`;
        result += `3. **Test Workflow**: Run a test execution to verify functionality\n`;
        if (!args.activate) {
          result += `4. **Activate Workflow**: Use \`activate-workflow\` when ready\n`;
        }
        result += `5. **Monitor Performance**: Use monitoring tools to track execution\n\n`;

        result += `## 🔧 Useful Commands\n`;
        result += `- \`get-workflow ${newWorkflow.id}\` - View workflow details\n`;
        result += `- \`test-workflow ${newWorkflow.id}\` - Test workflow execution\n`;
        result += `- \`analyze-workflow-complexity ${newWorkflow.id}\` - Analyze complexity\n`;

        return result;
      } catch (error: any) {
        throw new UserError(`Failed to import workflow template: ${error.message}`);
      }
    },
  });

  // Analyze workflow patterns
  server.addTool({
    name: 'analyze-workflow-patterns',
    description: 'Analyze workflows to identify common patterns, best practices, and suggest improvements based on established patterns',
    parameters: PatternAnalysisSchema,
    annotations: {
      title: 'Analyze Workflow Patterns',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof PatternAnalysisSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        let workflows: N8nWorkflow[] = [];
        
        if (args.workflowId) {
          const workflow = await client.getWorkflow(args.workflowId);
          workflows = [workflow];
        } else {
          const response = await client.getWorkflows({ limit: 20 });
          workflows = response.data;
        }

        let analysis = `# Workflow Pattern Analysis\n\n`;
        analysis += `**Analysis Date**: ${new Date().toLocaleString()}\n`;
        analysis += `**Workflows Analyzed**: ${workflows.length}\n`;
        analysis += `**Pattern Type**: ${args.patternType}\n\n`;

        const patternMatches: Record<string, Array<{workflow: N8nWorkflow, score: number, details: string[]}>> = {};

        for (const workflow of workflows) {
          if (!workflow.nodes || workflow.nodes.length === 0) continue;

          const nodeTypes = workflow.nodes.map(node => node.type.toLowerCase());
          const hasConnections = workflow.connections && Object.keys(workflow.connections).length > 0;

          // Analyze integration patterns
          if (args.patternType === 'integration' || args.patternType === 'all') {
            const integrationScore = analyzeIntegrationPattern(workflow);
            if (integrationScore.score > 0) {
              if (!patternMatches['integration']) patternMatches['integration'] = [];
              patternMatches['integration'].push({
                workflow,
                score: integrationScore.score,
                details: integrationScore.details
              });
            }
          }

          // Analyze data transformation patterns
          if (args.patternType === 'data-transformation' || args.patternType === 'all') {
            const dataScore = analyzeDataTransformationPattern(workflow);
            if (dataScore.score > 0) {
              if (!patternMatches['data-transformation']) patternMatches['data-transformation'] = [];
              patternMatches['data-transformation'].push({
                workflow,
                score: dataScore.score,
                details: dataScore.details
              });
            }
          }

          // Analyze error handling patterns
          if (args.patternType === 'error-handling' || args.patternType === 'all') {
            const errorScore = analyzeErrorHandlingPattern(workflow);
            if (errorScore.score > 0) {
              if (!patternMatches['error-handling']) patternMatches['error-handling'] = [];
              patternMatches['error-handling'].push({
                workflow,
                score: errorScore.score,
                details: errorScore.details
              });
            }
          }

          // Analyze notification patterns
          if (args.patternType === 'notification' || args.patternType === 'all') {
            const notificationScore = analyzeNotificationPattern(workflow);
            if (notificationScore.score > 0) {
              if (!patternMatches['notification']) patternMatches['notification'] = [];
              patternMatches['notification'].push({
                workflow,
                score: notificationScore.score,
                details: notificationScore.details
              });
            }
          }

          // Analyze AI processing patterns
          if (args.patternType === 'ai-processing' || args.patternType === 'all') {
            const aiScore = analyzeAIProcessingPattern(workflow);
            if (aiScore.score > 0) {
              if (!patternMatches['ai-processing']) patternMatches['ai-processing'] = [];
              patternMatches['ai-processing'].push({
                workflow,
                score: aiScore.score,
                details: aiScore.details
              });
            }
          }
        }

        // Generate pattern analysis report
        if (Object.keys(patternMatches).length === 0) {
          analysis += `No significant patterns detected in the analyzed workflows.\n`;
          analysis += `This could indicate:\n`;
          analysis += `- Workflows are using custom patterns\n`;
          analysis += `- Limited workflow data available\n`;
          analysis += `- Patterns don't match common templates\n\n`;
          analysis += `Consider analyzing individual workflows or using template search.`;
          return analysis;
        }

        Object.entries(patternMatches).forEach(([patternType, matches]) => {
          matches.sort((a, b) => b.score - a.score);
          const patternInfo = WORKFLOW_PATTERNS[patternType as keyof typeof WORKFLOW_PATTERNS];
          
          analysis += `## ${patternInfo?.name || patternType.charAt(0).toUpperCase() + patternType.slice(1)} Pattern\n`;
          if (patternInfo) {
            analysis += `**Description**: ${patternInfo.description}\n`;
            analysis += `**Typical Implementation**: ${patternInfo.pattern}\n\n`;
          }

          analysis += `**Workflows Using This Pattern** (${matches.length}):\n`;
          matches.forEach((match, index) => {
            const scoreLevel = match.score >= 80 ? '🟢 Excellent' :
                             match.score >= 60 ? '🟡 Good' :
                             match.score >= 40 ? '🟠 Partial' : '🔴 Basic';
            
            analysis += `${index + 1}. **${match.workflow.name}** - ${scoreLevel} (${match.score}/100)\n`;
            match.details.forEach(detail => {
              analysis += `   - ${detail}\n`;
            });
            analysis += '\n';
          });
        });

        // Pattern recommendations
        if (args.includeRecommendations) {
          analysis += `## 💡 Pattern-Based Recommendations\n\n`;
          
          const recommendations = [];
          
          // Check for missing error handling
          const workflowsWithoutErrorHandling = workflows.filter(workflow => 
            !patternMatches['error-handling']?.some(match => match.workflow.id === workflow.id)
          );
          
          if (workflowsWithoutErrorHandling.length > 0) {
            recommendations.push(`**Error Handling**: ${workflowsWithoutErrorHandling.length} workflow(s) could benefit from implementing error handling patterns`);
          }

          // Check for integration improvements
          const integrationWorkflows = patternMatches['integration'] || [];
          const lowScoreIntegrations = integrationWorkflows.filter(match => match.score < 60);
          
          if (lowScoreIntegrations.length > 0) {
            recommendations.push(`**Integration Patterns**: ${lowScoreIntegrations.length} workflow(s) have partial integration patterns - consider implementing complete API integration patterns`);
          }

          // Check for notification improvements
          const hasComplexWorkflows = workflows.some(w => (w.nodes?.length || 0) > 10);
          const hasNotificationPatterns = patternMatches['notification']?.length > 0;
          
          if (hasComplexWorkflows && !hasNotificationPatterns) {
            recommendations.push(`**Notification Patterns**: Complex workflows detected without notification patterns - consider adding monitoring and alerting`);
          }

          if (recommendations.length === 0) {
            recommendations.push('Workflows demonstrate good pattern usage - continue monitoring for optimization opportunities');
          }

          recommendations.forEach((rec, index) => {
            analysis += `${index + 1}. ${rec}\n`;
          });
          analysis += '\n';

          // Best practices
          analysis += `## 🏆 Pattern Best Practices\n`;
          Object.entries(WORKFLOW_PATTERNS).forEach(([key, pattern]) => {
            analysis += `**${pattern.name}**: ${pattern.implementation}\n`;
          });
        }

        analysis += `\n## 🔧 Related Tools\n`;
        analysis += `- Use \`search-workflow-templates\` to find templates with these patterns\n`;
        analysis += `- Use \`get-best-practices\` for detailed implementation guidance\n`;
        analysis += `- Use \`get-optimization-suggestions\` for specific improvements\n`;

        return analysis;
      } catch (error: any) {
        throw new UserError(`Failed to analyze workflow patterns: ${error.message}`);
      }
    },
  });

  // Get best practices
  server.addTool({
    name: 'get-best-practices',
    description: 'Get comprehensive best practices and implementation guidelines for workflow development, organized by category',
    parameters: BestPracticesSchema,
    annotations: {
      title: 'Get Best Practices',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof BestPracticesSchema>) => {
      try {
        let bestPractices = `# n8n Workflow Best Practices Guide\n\n`;
        bestPractices += `**Generated**: ${new Date().toLocaleString()}\n`;
        bestPractices += `**Category Focus**: ${args.category}\n\n`;

        // Structure best practices
        if (args.category === 'structure' || args.category === 'all') {
          bestPractices += `## 🏗️ Workflow Structure Best Practices\n\n`;
          
          bestPractices += `### 1. Workflow Organization\n`;
          bestPractices += `- **Single Responsibility**: Each workflow should have one clear purpose\n`;
          bestPractices += `- **Logical Flow**: Organize nodes in a clear, left-to-right flow\n`;
          bestPractices += `- **Node Naming**: Use descriptive, business-focused names\n`;
          bestPractices += `- **Documentation**: Add notes to complex nodes and decision points\n`;
          bestPractices += `- **Size Limits**: Keep workflows under 30 nodes when possible\n\n`;

          bestPractices += `### 2. Node Configuration\n`;
          bestPractices += `- **Parameter Validation**: Always validate input parameters\n`;
          bestPractices += `- **Default Values**: Provide sensible defaults for optional parameters\n`;
          bestPractices += `- **Environment Variables**: Use environment variables for configuration\n`;
          bestPractices += `- **Resource Optimization**: Configure appropriate timeouts and limits\n\n`;

          if (args.includeExamples) {
            bestPractices += `### Example: Good Node Naming\n`;
            bestPractices += `\`\`\`\n`;
            bestPractices += `❌ Bad: "HTTP Request", "Set", "IF"\n`;
            bestPractices += `✅ Good: "Fetch Customer Data", "Format Order Details", "Check Payment Status"\n`;
            bestPractices += `\`\`\`\n\n`;
          }
        }

        // Performance best practices
        if (args.category === 'performance' || args.category === 'all') {
          bestPractices += `## ⚡ Performance Best Practices\n\n`;
          
          bestPractices += `### 1. HTTP Request Optimization\n`;
          bestPractices += `- **Connection Pooling**: Enable keep-alive for HTTP requests\n`;
          bestPractices += `- **Request Batching**: Batch multiple requests when possible\n`;
          bestPractices += `- **Timeout Configuration**: Set appropriate request timeouts\n`;
          bestPractices += `- **Rate Limiting**: Implement rate limiting for external APIs\n`;
          bestPractices += `- **Caching**: Cache frequently accessed data\n\n`;

          bestPractices += `### 2. Data Processing\n`;
          bestPractices += `- **Stream Processing**: Use streaming for large datasets\n`;
          bestPractices += `- **Memory Management**: Avoid loading large datasets into memory\n`;
          bestPractices += `- **Parallel Processing**: Use parallel execution where appropriate\n`;
          bestPractices += `- **Data Validation**: Validate data early in the workflow\n\n`;

          bestPractices += `### 3. Code Node Optimization\n`;
          bestPractices += `- **Library Usage**: Minimize external library imports\n`;
          bestPractices += `- **Loop Optimization**: Avoid nested loops in code nodes\n`;
          bestPractices += `- **Error Handling**: Implement proper error handling in custom code\n`;
          bestPractices += `- **Performance Monitoring**: Add timing and logging to code nodes\n\n`;

          if (args.includeExamples) {
            bestPractices += `### Example: HTTP Request Configuration\n`;
            bestPractices += `\`\`\`json\n`;
            bestPractices += `{\n`;
            bestPractices += `  "timeout": 30000,\n`;
            bestPractices += `  "redirect": {\n`;
            bestPractices += `    "followRedirects": true,\n`;
            bestPractices += `    "maxRedirects": 3\n`;
            bestPractices += `  },\n`;
            bestPractices += `  "response": {\n`;
            bestPractices += `    "fullResponse": false\n`;
            bestPractices += `  }\n`;
            bestPractices += `}\n`;
            bestPractices += `\`\`\`\n\n`;
          }
        }

        // Security best practices
        if (args.category === 'security' || args.category === 'all') {
          bestPractices += `## 🔒 Security Best Practices\n\n`;
          
          bestPractices += `### 1. Credential Management\n`;
          bestPractices += `- **No Hardcoded Secrets**: Never hardcode API keys or passwords\n`;
          bestPractices += `- **Credential Scope**: Use least-privilege principle for credentials\n`;
          bestPractices += `- **Credential Rotation**: Regularly rotate API keys and tokens\n`;
          bestPractices += `- **Environment Separation**: Use different credentials for different environments\n\n`;

          bestPractices += `### 2. Data Security\n`;
          bestPractices += `- **Data Encryption**: Encrypt sensitive data in transit and at rest\n`;
          bestPractices += `- **Input Sanitization**: Sanitize all external inputs\n`;
          bestPractices += `- **Output Filtering**: Filter sensitive data from logs and responses\n`;
          bestPractices += `- **Access Control**: Implement proper access controls\n\n`;

          bestPractices += `### 3. Network Security\n`;
          bestPractices += `- **HTTPS Only**: Always use HTTPS for external communications\n`;
          bestPractices += `- **Certificate Validation**: Validate SSL certificates\n`;
          bestPractices += `- **IP Whitelisting**: Restrict access to known IP addresses\n`;
          bestPractices += `- **Webhook Security**: Validate webhook signatures\n\n`;

          if (args.includeExamples) {
            bestPractices += `### Example: Secure API Request\n`;
            bestPractices += `\`\`\`javascript\n`;
            bestPractices += `// In Code Node - Input Validation\n`;
            bestPractices += `const email = $input.first().json.email;\n`;
            bestPractices += `if (!email || !email.match(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)) {\n`;
            bestPractices += `  throw new Error('Invalid email format');\n`;
            bestPractices += `}\n`;
            bestPractices += `\`\`\`\n\n`;
          }
        }

        // Maintainability best practices
        if (args.category === 'maintainability' || args.category === 'all') {
          bestPractices += `## 🔧 Maintainability Best Practices\n\n`;
          
          bestPractices += `### 1. Documentation\n`;
          bestPractices += `- **Workflow Description**: Clear description of workflow purpose\n`;
          bestPractices += `- **Node Documentation**: Document complex logic and decision points\n`;
          bestPractices += `- **Change Log**: Maintain a record of significant changes\n`;
          bestPractices += `- **Dependencies**: Document external service dependencies\n\n`;

          bestPractices += `### 2. Version Control\n`;
          bestPractices += `- **Backup Strategy**: Regular workflow backups\n`;
          bestPractices += `- **Change Tracking**: Track workflow modifications\n`;
          bestPractices += `- **Environment Management**: Separate development and production workflows\n`;
          bestPractices += `- **Rollback Plan**: Maintain ability to rollback changes\n\n`;

          bestPractices += `### 3. Monitoring & Observability\n`;
          bestPractices += `- **Error Monitoring**: Implement comprehensive error tracking\n`;
          bestPractices += `- **Performance Metrics**: Track execution times and success rates\n`;
          bestPractices += `- **Health Checks**: Regular workflow health validation\n`;
          bestPractices += `- **Alerting**: Set up alerts for critical failures\n\n`;

          bestPractices += `### 4. Testing Strategy\n`;
          bestPractices += `- **Test Data**: Use realistic but non-sensitive test data\n`;
          bestPractices += `- **Edge Cases**: Test error conditions and edge cases\n`;
          bestPractices += `- **Integration Testing**: Test with actual external services\n`;
          bestPractices += `- **Regression Testing**: Test after modifications\n\n`;

          if (args.includeExamples) {
            bestPractices += `### Example: Workflow Documentation Template\n`;
            bestPractices += `\`\`\`\n`;
            bestPractices += `Purpose: Process customer orders from e-commerce platform\n`;
            bestPractices += `Trigger: Webhook from Shopify on new order\n`;
            bestPractices += `Dependencies: Shopify API, Email service, Database\n`;
            bestPractices += `Error Handling: Slack notifications for failures\n`;
            bestPractices += `Last Updated: 2024-01-15 by John Doe\n`;
            bestPractices += `\`\`\`\n\n`;
          }
        }

        // Common anti-patterns to avoid
        bestPractices += `## ❌ Common Anti-Patterns to Avoid\n\n`;
        bestPractices += `### 1. Structure Anti-Patterns\n`;
        bestPractices += `- **Monolithic Workflows**: Workflows with 50+ nodes\n`;
        bestPractices += `- **Deep Nesting**: Excessive IF/Switch nesting\n`;
        bestPractices += `- **Unclear Dependencies**: Complex node interconnections\n`;
        bestPractices += `- **Poor Naming**: Generic or technical node names\n\n`;

        bestPractices += `### 2. Performance Anti-Patterns\n`;
        bestPractices += `- **Sequential HTTP Calls**: Making sequential API calls when parallel is possible\n`;
        bestPractices += `- **Memory Leaks**: Not clearing large variables in code nodes\n`;
        bestPractices += `- **Inefficient Loops**: Processing items one-by-one instead of batching\n`;
        bestPractices += `- **No Caching**: Repeatedly fetching the same data\n\n`;

        bestPractices += `### 3. Security Anti-Patterns\n`;
        bestPractices += `- **Hardcoded Credentials**: API keys in workflow configuration\n`;
        bestPractices += `- **Logging Sensitive Data**: Including passwords or tokens in logs\n`;
        bestPractices += `- **Unvalidated Input**: Processing external data without validation\n`;
        bestPractices += `- **Overprivileged Access**: Using admin credentials for routine operations\n\n`;

        // Quick reference checklist
        bestPractices += `## ✅ Quick Reference Checklist\n\n`;
        bestPractices += `### Pre-Deployment Checklist\n`;
        bestPractices += `- [ ] Workflow has clear, descriptive name and documentation\n`;
        bestPractices += `- [ ] All nodes have descriptive, business-focused names\n`;
        bestPractices += `- [ ] Error handling implemented for critical operations\n`;
        bestPractices += `- [ ] No hardcoded credentials or sensitive data\n`;
        bestPractices += `- [ ] Input validation implemented for external data\n`;
        bestPractices += `- [ ] Appropriate timeouts configured for HTTP requests\n`;
        bestPractices += `- [ ] Monitoring and alerting configured\n`;
        bestPractices += `- [ ] Workflow tested with realistic data\n`;
        bestPractices += `- [ ] Performance requirements validated\n`;
        bestPractices += `- [ ] Security review completed\n\n`;

        bestPractices += `## 🔧 Implementation Tools\n`;
        bestPractices += `- Use \`analyze-workflow-complexity\` to assess workflow structure\n`;
        bestPractices += `- Use \`get-optimization-suggestions\` for specific improvements\n`;
        bestPractices += `- Use \`check-workflow-health\` for comprehensive health checks\n`;
        bestPractices += `- Use \`search-workflow-templates\` for proven patterns\n`;

        return bestPractices;
      } catch (error: any) {
        throw new UserError(`Failed to get best practices: ${error.message}`);
      }
    },
  });
}

// Helper functions for pattern analysis
function analyzeIntegrationPattern(workflow: N8nWorkflow): {score: number, details: string[]} {
  const nodes = workflow.nodes || [];
  const nodeTypes = nodes.map(node => node.type.toLowerCase());
  const details: string[] = [];
  let score = 0;

  // Check for HTTP/API nodes
  const apiNodes = nodeTypes.filter(type => 
    type.includes('http') || type.includes('webhook') || type.includes('api')
  ).length;
  
  if (apiNodes > 0) {
    score += 30;
    details.push(`${apiNodes} API integration node(s) detected`);
  }

  // Check for data transformation
  const transformNodes = nodeTypes.filter(type => 
    type.includes('set') || type.includes('code') || type.includes('function')
  ).length;
  
  if (transformNodes > 0) {
    score += 20;
    details.push(`${transformNodes} data transformation node(s) found`);
  }

  // Check for error handling
  const errorNodes = nodes.filter(node => 
    node.parameters && JSON.stringify(node.parameters).toLowerCase().includes('error')
  ).length;
  
  if (errorNodes > 0) {
    score += 25;
    details.push(`Error handling implemented with ${errorNodes} node(s)`);
  }

  // Check for authentication
  const authNodes = nodes.filter(node => 
    node.credentials && Object.keys(node.credentials).length > 0
  ).length;
  
  if (authNodes > 0) {
    score += 25;
    details.push(`Authentication configured for ${authNodes} node(s)`);
  }

  return { score, details };
}

function analyzeDataTransformationPattern(workflow: N8nWorkflow): {score: number, details: string[]} {
  const nodes = workflow.nodes || [];
  const nodeTypes = nodes.map(node => node.type.toLowerCase());
  const details: string[] = [];
  let score = 0;

  // Check for data processing nodes
  const dataNodes = nodeTypes.filter(type => 
    type.includes('set') || type.includes('merge') || type.includes('split')
  ).length;
  
  if (dataNodes > 0) {
    score += 40;
    details.push(`${dataNodes} data processing node(s) identified`);
  }

  // Check for validation
  const validationNodes = nodeTypes.filter(type => 
    type.includes('if') || type.includes('switch') || type.includes('filter')
  ).length;
  
  if (validationNodes > 0) {
    score += 30;
    details.push(`${validationNodes} validation/filtering node(s) found`);
  }

  // Check for custom transformation logic
  const codeNodes = nodeTypes.filter(type => 
    type.includes('code') || type.includes('function')
  ).length;
  
  if (codeNodes > 0) {
    score += 30;
    details.push(`${codeNodes} custom transformation node(s) implemented`);
  }

  return { score, details };
}

function analyzeErrorHandlingPattern(workflow: N8nWorkflow): {score: number, details: string[]} {
  const nodes = workflow.nodes || [];
  const details: string[] = [];
  let score = 0;

  // Check for error trigger nodes
  const errorTriggers = nodes.filter(node => 
    node.type.toLowerCase().includes('error') || 
    (node.parameters && JSON.stringify(node.parameters).toLowerCase().includes('error'))
  ).length;
  
  if (errorTriggers > 0) {
    score += 40;
    details.push(`${errorTriggers} error trigger/handler node(s) configured`);
  }

  // Check for try-catch patterns in code nodes
  const codeNodes = nodes.filter(node => node.type.toLowerCase().includes('code'));
  const tryCatchNodes = codeNodes.filter(node => 
    node.parameters && JSON.stringify(node.parameters).includes('try')
  ).length;
  
  if (tryCatchNodes > 0) {
    score += 30;
    details.push(`${tryCatchNodes} code node(s) with try-catch patterns`);
  }

  // Check for notification nodes (error alerts)
  const notificationNodes = nodes.filter(node => {
    const type = node.type.toLowerCase();
    return type.includes('slack') || type.includes('email') || type.includes('webhook');
  }).length;
  
  if (notificationNodes > 0) {
    score += 30;
    details.push(`${notificationNodes} notification node(s) for error alerting`);
  }

  return { score, details };
}

function analyzeNotificationPattern(workflow: N8nWorkflow): {score: number, details: string[]} {
  const nodes = workflow.nodes || [];
  const nodeTypes = nodes.map(node => node.type.toLowerCase());
  const details: string[] = [];
  let score = 0;

  // Check for notification nodes
  const notificationNodes = nodeTypes.filter(type => 
    type.includes('slack') || type.includes('email') || type.includes('sms') || 
    type.includes('webhook') || type.includes('discord')
  ).length;
  
  if (notificationNodes > 0) {
    score += 50;
    details.push(`${notificationNodes} notification channel(s) configured`);
  }

  // Check for conditional notification logic
  const conditionalNodes = nodeTypes.filter(type => 
    type.includes('if') || type.includes('switch')
  ).length;
  
  if (conditionalNodes > 0 && notificationNodes > 0) {
    score += 25;
    details.push(`Conditional notification logic with ${conditionalNodes} decision node(s)`);
  }

  // Check for message formatting
  const formatNodes = nodeTypes.filter(type => 
    type.includes('set') || type.includes('code')
  ).length;
  
  if (formatNodes > 0 && notificationNodes > 0) {
    score += 25;
    details.push(`Message formatting implemented with ${formatNodes} node(s)`);
  }

  return { score, details };
}

function analyzeAIProcessingPattern(workflow: N8nWorkflow): {score: number, details: string[]} {
  const nodes = workflow.nodes || [];
  const nodeTypes = nodes.map(node => node.type.toLowerCase());
  const details: string[] = [];
  let score = 0;

  // Check for AI nodes
  const aiNodes = nodeTypes.filter(type => 
    type.includes('ai') || type.includes('openai') || type.includes('anthropic') || 
    type.includes('claude') || type.includes('gpt') || type.includes('llama')
  ).length;
  
  if (aiNodes > 0) {
    score += 50;
    details.push(`${aiNodes} AI processing node(s) identified`);
  }

  // Check for data preparation
  const prepNodes = nodeTypes.filter(type => 
    type.includes('set') || type.includes('code') || type.includes('split')
  ).length;
  
  if (prepNodes > 0 && aiNodes > 0) {
    score += 25;
    details.push(`Data preparation implemented with ${prepNodes} node(s)`);
  }

  // Check for AI result processing
  const processNodes = nodes.filter(node => 
    node.type.toLowerCase().includes('merge') || node.type.toLowerCase().includes('if')
  ).length;
  
  if (processNodes > 0 && aiNodes > 0) {
    score += 25;
    details.push(`AI result processing with ${processNodes} node(s)`);
  }

  return { score, details };
}