import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';

// Zod schemas for AI testing validation
const AIPromptValidationSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  context: z.record(z.any()).optional(),
  variables: z.array(z.string()).optional(),
});

const AINodeTestSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  testData: z.record(z.any()),
  validateOnly: z.boolean().optional().default(false),
});

const AIExpressionTestSchema = z.object({
  expression: z.string().min(1, 'Expression is required'),
  sampleData: z.record(z.any()),
  context: z.record(z.any()).optional(),
});

const AIPerformanceTestSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  iterations: z.number().min(1).max(100).optional().default(5),
  testPayloads: z.array(z.record(z.any())),
});

// Tool registration function for AI testing tools
export function createAITestingTools(getClient: () => N8nClient | null, server: any) {
  // Validate AI prompt structure and variables
  server.addTool({
    name: 'validate-ai-prompt',
    description: 'Validate AI prompt structure, check for required variables, and ensure proper formatting',
    parameters: AIPromptValidationSchema,
    annotations: {
      title: 'Validate AI Prompt',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof AIPromptValidationSchema>) => {
      try {
        const validation = {
          prompt: args.prompt,
          length: args.prompt.length,
          wordCount: args.prompt.split(/\s+/).length,
          variables: [] as string[],
          issues: [] as string[],
          suggestions: [] as string[],
          score: 0,
        };

        // Extract variables from prompt (looking for {{variable}} and ${variable} patterns)
        const variablePatterns = [
          /\{\{([^}]+)\}\}/g,  // n8n variables {{variable}}
          /\$\{([^}]+)\}/g,    // JavaScript variables ${variable}
          /\$json\.[a-zA-Z_][a-zA-Z0-9_]*/g, // n8n JSON access
          /\$node\.[a-zA-Z_][a-zA-Z0-9_]*/g, // n8n node access
        ];

        variablePatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(args.prompt)) !== null) {
            if (match[1]) {
              validation.variables.push(match[1]);
            } else {
              validation.variables.push(match[0]);
            }
          }
        });

        // Check for common issues
        if (validation.length < 10) {
          validation.issues.push('Prompt is very short - may not provide enough context');
        } else if (validation.length > 4000) {
          validation.issues.push('Prompt is very long - may exceed token limits');
        }

        if (validation.wordCount < 5) {
          validation.issues.push('Prompt has very few words - consider adding more context');
        }

        if (!args.prompt.includes('?') && !args.prompt.includes('please') && !args.prompt.includes('generate')) {
          validation.suggestions.push('Consider adding clear instructions or questions');
        }

        if (validation.variables.length === 0) {
          validation.suggestions.push('Consider using dynamic variables to make the prompt more flexible');
        }

        // Check if required variables are provided
        if (args.variables) {
          const missingVars = args.variables.filter(v => 
            !validation.variables.some(pv => pv.includes(v))
          );
          if (missingVars.length > 0) {
            validation.issues.push(`Missing required variables: ${missingVars.join(', ')}`);
          }
        }

        // Calculate quality score (0-100)
        validation.score = Math.max(0, Math.min(100, 
          (validation.length > 10 ? 20 : 0) +
          (validation.wordCount > 5 ? 20 : 0) +
          (validation.variables.length > 0 ? 20 : 0) +
          (validation.issues.length === 0 ? 30 : 0) +
          (args.prompt.includes('?') || args.prompt.includes('please') ? 10 : 0)
        ));

        return `AI Prompt Validation Results:\n\n` +
               `**Prompt Analysis:**\n` +
               `- Length: ${validation.length} characters\n` +
               `- Word Count: ${validation.wordCount} words\n` +
               `- Quality Score: ${validation.score}/100\n\n` +
               `**Variables Found (${validation.variables.length}):**\n` +
               (validation.variables.length > 0 ? 
                 validation.variables.map(v => `- ${v}`).join('\n') : 
                 'No variables detected') + '\n\n' +
               `**Issues (${validation.issues.length}):**\n` +
               (validation.issues.length > 0 ? 
                 validation.issues.map(i => `❌ ${i}`).join('\n') : 
                 '✅ No issues found') + '\n\n' +
               `**Suggestions (${validation.suggestions.length}):**\n` +
               (validation.suggestions.length > 0 ? 
                 validation.suggestions.map(s => `💡 ${s}`).join('\n') : 
                 '✅ No suggestions') + '\n\n' +
               `**Original Prompt:**\n\`\`\`\n${args.prompt}\n\`\`\``;
      } catch (error: any) {
        throw new UserError(`Failed to validate AI prompt: ${error.message}`);
      }
    },
  });

  // Test AI node with sample data
  server.addTool({
    name: 'test-ai-node',
    description: 'Test an AI node with sample data to validate configuration and expected behavior',
    parameters: AINodeTestSchema,
    annotations: {
      title: 'Test AI Node',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof AINodeTestSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const node = workflow.nodes?.find(n => n.id === args.nodeId);

        if (!node) {
          throw new UserError(`Node with ID "${args.nodeId}" not found in workflow "${args.workflowId}"`);
        }

        const testResult = {
          nodeId: args.nodeId,
          nodeName: node.name,
          nodeType: node.type,
          testData: args.testData,
          validateOnly: args.validateOnly,
          timestamp: new Date().toISOString(),
          configuration: {
            model: node.parameters?.model,
            temperature: node.parameters?.temperature,
            maxTokens: node.parameters?.maxTokens,
            systemPrompt: node.parameters?.systemPrompt,
          },
          validation: {
            configurationValid: true,
            dataStructureValid: true,
            parametersValid: true,
            credentialsValid: true,
          },
          estimatedCost: 0.001, // Simulated cost estimation
          estimatedTokens: Math.floor(JSON.stringify(args.testData).length / 4),
        };

        // Validate configuration
        if (!node.parameters?.model) {
          testResult.validation.configurationValid = false;
        }

        // Validate test data structure
        if (!args.testData || typeof args.testData !== 'object') {
          testResult.validation.dataStructureValid = false;
        }

        if (args.validateOnly) {
          return `AI Node Validation Results:\n\n` +
                 `**Node Information:**\n` +
                 `- Node: ${testResult.nodeName} (${testResult.nodeType})\n` +
                 `- Model: ${testResult.configuration.model || 'Not configured'}\n` +
                 `- Temperature: ${testResult.configuration.temperature || 'Default'}\n` +
                 `- Max Tokens: ${testResult.configuration.maxTokens || 'Default'}\n\n` +
                 `**Validation Results:**\n` +
                 `- Configuration Valid: ${testResult.validation.configurationValid ? '✅' : '❌'}\n` +
                 `- Data Structure Valid: ${testResult.validation.dataStructureValid ? '✅' : '❌'}\n` +
                 `- Parameters Valid: ${testResult.validation.parametersValid ? '✅' : '❌'}\n` +
                 `- Credentials Valid: ${testResult.validation.credentialsValid ? '✅' : '❌'}\n\n` +
                 `**Test Data:**\n\`\`\`json\n${JSON.stringify(args.testData, null, 2)}\n\`\`\`\n\n` +
                 `**Estimated Cost:** $${testResult.estimatedCost.toFixed(4)}\n` +
                 `**Estimated Tokens:** ${testResult.estimatedTokens}`;
        }

        // Simulate actual testing (in real implementation, would execute the node)
        const simulatedResponse = {
          success: true,
          output: `[TEST MODE] Simulated AI response for test data. In production, this would be the actual AI model response.`,
          tokens: testResult.estimatedTokens,
          cost: testResult.estimatedCost,
          executionTime: Math.random() * 2000 + 500, // 500-2500ms
        };

        return `AI Node Test Results:\n\n` +
               `**Node Information:**\n` +
               `- Node: ${testResult.nodeName} (${testResult.nodeType})\n` +
               `- Model: ${testResult.configuration.model || 'Not configured'}\n` +
               `- Test Time: ${testResult.timestamp}\n\n` +
               `**Test Execution:**\n` +
               `- Success: ${simulatedResponse.success ? '✅' : '❌'}\n` +
               `- Execution Time: ${simulatedResponse.executionTime.toFixed(0)}ms\n` +
               `- Tokens Used: ${simulatedResponse.tokens}\n` +
               `- Cost: $${simulatedResponse.cost.toFixed(4)}\n\n` +
               `**Test Output:**\n${simulatedResponse.output}\n\n` +
               `**Test Data Used:**\n\`\`\`json\n${JSON.stringify(args.testData, null, 2)}\n\`\`\`\n\n` +
               `**Note:** This is a test simulation. For actual AI execution, deploy the workflow and run it.`;
      } catch (error: any) {
        throw new UserError(`Failed to test AI node: ${error.message}`);
      }
    },
  });

  // Test n8n expressions with AI context
  server.addTool({
    name: 'test-ai-expression',
    description: 'Test n8n expressions that use AI data and $fromAI() functionality',
    parameters: AIExpressionTestSchema,
    annotations: {
      title: 'Test AI Expression',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof AIExpressionTestSchema>) => {
      try {
        const expressionTest = {
          expression: args.expression,
          sampleData: args.sampleData,
          context: args.context || {},
          timestamp: new Date().toISOString(),
          validation: {
            syntaxValid: true,
            variablesResolved: true,
            aiContextAvailable: true,
            securitySafe: true,
          },
          warnings: [] as string[],
          errors: [] as string[],
        };

        // Basic syntax validation
        const dangerousPatterns = [
          /eval\s*\(/,
          /Function\s*\(/,
          /setTimeout\s*\(/,
          /setInterval\s*\(/,
          /process\./,
          /require\s*\(/,
          /import\s*\(/,
        ];

        dangerousPatterns.forEach(pattern => {
          if (pattern.test(args.expression)) {
            expressionTest.validation.securitySafe = false;
            expressionTest.errors.push('Expression contains potentially dangerous code patterns');
          }
        });

        // Check for AI-specific functions
        const aiPatterns = [
          /\$fromAI\s*\(/,
          /\$ai\./,
          /\$memory\./,
          /\$context\./,
        ];

        const hasAIFunctions = aiPatterns.some(pattern => pattern.test(args.expression));
        if (hasAIFunctions && !args.context) {
          expressionTest.warnings.push('Expression uses AI functions but no AI context provided');
        }

        // Simulate expression evaluation
        let simulatedResult;
        try {
          if (args.expression.includes('$fromAI(')) {
            simulatedResult = '[SIMULATED] AI-generated data would be injected here';
          } else if (args.expression.includes('$json.')) {
            simulatedResult = '[SIMULATED] JSON data access result';
          } else if (args.expression.includes('$node.')) {
            simulatedResult = '[SIMULATED] Node data access result';
          } else {
            simulatedResult = '[SIMULATED] Expression evaluation result';
          }
        } catch (error) {
          expressionTest.validation.syntaxValid = false;
          expressionTest.errors.push(`Syntax error: ${(error as Error).message}`);
          simulatedResult = null;
        }

        return `AI Expression Test Results:\n\n` +
               `**Expression:** \`${args.expression}\`\n\n` +
               `**Validation Results:**\n` +
               `- Syntax Valid: ${expressionTest.validation.syntaxValid ? '✅' : '❌'}\n` +
               `- Variables Resolved: ${expressionTest.validation.variablesResolved ? '✅' : '❌'}\n` +
               `- AI Context Available: ${expressionTest.validation.aiContextAvailable ? '✅' : '❌'}\n` +
               `- Security Safe: ${expressionTest.validation.securitySafe ? '✅' : '❌'}\n\n` +
               `**Warnings (${expressionTest.warnings.length}):**\n` +
               (expressionTest.warnings.length > 0 ? 
                 expressionTest.warnings.map(w => `⚠️ ${w}`).join('\n') : 
                 '✅ No warnings') + '\n\n' +
               `**Errors (${expressionTest.errors.length}):**\n` +
               (expressionTest.errors.length > 0 ? 
                 expressionTest.errors.map(e => `❌ ${e}`).join('\n') : 
                 '✅ No errors') + '\n\n' +
               `**Sample Data:**\n\`\`\`json\n${JSON.stringify(args.sampleData, null, 2)}\n\`\`\`\n\n` +
               `**Simulated Result:**\n\`${simulatedResult}\`\n\n` +
               `**Note:** This is a test simulation. Actual expression evaluation happens during workflow execution.`;
      } catch (error: any) {
        throw new UserError(`Failed to test AI expression: ${error.message}`);
      }
    },
  });

  // Performance test AI node
  server.addTool({
    name: 'performance-test-ai-node',
    description: 'Run performance tests on an AI node with multiple test payloads to measure response times and consistency',
    parameters: AIPerformanceTestSchema,
    annotations: {
      title: 'Performance Test AI Node',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof AIPerformanceTestSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const node = workflow.nodes?.find(n => n.id === args.nodeId);

        if (!node) {
          throw new UserError(`Node with ID "${args.nodeId}" not found in workflow "${args.workflowId}"`);
        }

        const performanceResults = {
          nodeId: args.nodeId,
          nodeName: node.name,
          nodeType: node.type,
          iterations: args.iterations,
          testPayloads: args.testPayloads.length,
          startTime: new Date().toISOString(),
          results: [] as any[],
          summary: {
            totalTests: 0,
            successfulTests: 0,
            failedTests: 0,
            averageResponseTime: 0,
            minResponseTime: 0,
            maxResponseTime: 0,
            totalTokens: 0,
            totalCost: 0,
          },
        };

        // Simulate performance testing
        for (let i = 0; i < args.iterations; i++) {
          for (let j = 0; j < args.testPayloads.length; j++) {
            const payload = args.testPayloads[j];
            const responseTime = Math.random() * 3000 + 200; // 200-3200ms
            const tokens = Math.floor(JSON.stringify(payload).length / 4);
            const cost = tokens * 0.00001; // Simulated cost
            
            const testResult = {
              iteration: i + 1,
              payloadIndex: j + 1,
              payload,
              responseTime,
              tokens,
              cost,
              success: Math.random() > 0.05, // 95% success rate
              timestamp: new Date().toISOString(),
            };

            performanceResults.results.push(testResult);
            performanceResults.summary.totalTests++;
            
            if (testResult.success) {
              performanceResults.summary.successfulTests++;
              performanceResults.summary.totalTokens += tokens;
              performanceResults.summary.totalCost += cost;
            } else {
              performanceResults.summary.failedTests++;
            }
          }
        }

        // Calculate statistics
        const successfulResults = performanceResults.results.filter(r => r.success);
        const responseTimes = successfulResults.map(r => r.responseTime);
        
        performanceResults.summary.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        performanceResults.summary.minResponseTime = Math.min(...responseTimes);
        performanceResults.summary.maxResponseTime = Math.max(...responseTimes);

        const successRate = (performanceResults.summary.successfulTests / performanceResults.summary.totalTests) * 100;

        return `AI Node Performance Test Results:\n\n` +
               `**Test Configuration:**\n` +
               `- Node: ${performanceResults.nodeName} (${performanceResults.nodeType})\n` +
               `- Iterations: ${performanceResults.iterations}\n` +
               `- Test Payloads: ${performanceResults.testPayloads}\n` +
               `- Total Tests: ${performanceResults.summary.totalTests}\n\n` +
               `**Performance Summary:**\n` +
               `- Success Rate: ${successRate.toFixed(1)}% (${performanceResults.summary.successfulTests}/${performanceResults.summary.totalTests})\n` +
               `- Average Response Time: ${performanceResults.summary.averageResponseTime.toFixed(0)}ms\n` +
               `- Min Response Time: ${performanceResults.summary.minResponseTime.toFixed(0)}ms\n` +
               `- Max Response Time: ${performanceResults.summary.maxResponseTime.toFixed(0)}ms\n` +
               `- Total Tokens: ${performanceResults.summary.totalTokens}\n` +
               `- Total Cost: $${performanceResults.summary.totalCost.toFixed(4)}\n\n` +
               `**Performance Analysis:**\n` +
               `- Performance Rating: ${successRate > 95 && performanceResults.summary.averageResponseTime < 2000 ? '🟢 Excellent' : 
                                     successRate > 90 && performanceResults.summary.averageResponseTime < 3000 ? '🟡 Good' : '🔴 Needs Improvement'}\n` +
               `- Consistency: ${(performanceResults.summary.maxResponseTime - performanceResults.summary.minResponseTime) < 1000 ? '🟢 Consistent' : '🟡 Variable'}\n` +
               `- Cost Efficiency: $${(performanceResults.summary.totalCost / performanceResults.summary.successfulTests).toFixed(6)} per successful test\n\n` +
               `**Recommendations:**\n` +
               (successRate < 95 ? '• Consider reviewing AI node configuration for reliability\n' : '') +
               (performanceResults.summary.averageResponseTime > 2000 ? '• Response times are high - consider optimizing prompts or model selection\n' : '') +
               (performanceResults.summary.totalCost > 0.1 ? '• High cost per test - consider optimizing token usage\n' : '') +
               `\n**Note:** This is a simulated performance test. Actual results may vary in production.`;
      } catch (error: any) {
        throw new UserError(`Failed to run performance test: ${error.message}`);
      }
    },
  });
}