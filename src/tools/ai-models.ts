import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';

// Zod schemas for AI model management
const ModelSearchSchema = z.object({
  query: z.string().optional(),
  provider: z.enum(['openai', 'anthropic', 'google', 'huggingface', 'local', 'all']).optional().default('all'),
  capability: z.enum(['text-generation', 'chat', 'completion', 'embedding', 'classification', 'all']).optional().default('all'),
  maxResults: z.number().min(1).max(100).optional().default(20),
});

const ModelConfigurationSchema = z.object({
  modelId: z.string().min(1, 'Model ID is required'),
  provider: z.string().min(1, 'Provider is required'),
  configuration: z.record(z.any()),
});

const ModelComparisonSchema = z.object({
  modelIds: z.array(z.string()).min(2, 'At least 2 models required for comparison'),
  criteria: z.array(z.enum(['cost', 'speed', 'quality', 'capabilities'])).optional().default(['cost', 'speed', 'quality']),
});

// Model database (in a real implementation, this would be fetched from APIs or databases)
const AI_MODELS_DATABASE = {
  openai: [
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      provider: 'openai',
      type: 'chat',
      capabilities: ['text-generation', 'chat', 'completion'],
      maxTokens: 128000,
      costPer1kTokens: { input: 0.01, output: 0.03 },
      speed: 'fast',
      quality: 'excellent',
      description: 'Most capable GPT-4 model with 128k context window',
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: 'openai',
      type: 'chat',
      capabilities: ['text-generation', 'chat', 'completion'],
      maxTokens: 16385,
      costPer1kTokens: { input: 0.0015, output: 0.002 },
      speed: 'very-fast',
      quality: 'good',
      description: 'Fast and efficient model for most tasks',
    },
  ],
  anthropic: [
    {
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      type: 'chat',
      capabilities: ['text-generation', 'chat', 'completion', 'analysis'],
      maxTokens: 200000,
      costPer1kTokens: { input: 0.015, output: 0.075 },
      speed: 'medium',
      quality: 'excellent',
      description: 'Most powerful Claude model with exceptional reasoning',
    },
    {
      id: 'claude-3-sonnet',
      name: 'Claude 3 Sonnet',
      provider: 'anthropic',
      type: 'chat',
      capabilities: ['text-generation', 'chat', 'completion'],
      maxTokens: 200000,
      costPer1kTokens: { input: 0.003, output: 0.015 },
      speed: 'fast',
      quality: 'very-good',
      description: 'Balanced model with good performance and cost efficiency',
    },
  ],
  google: [
    {
      id: 'gemini-pro',
      name: 'Gemini Pro',
      provider: 'google',
      type: 'chat',
      capabilities: ['text-generation', 'chat', 'completion', 'multimodal'],
      maxTokens: 32768,
      costPer1kTokens: { input: 0.00025, output: 0.0005 },
      speed: 'fast',
      quality: 'good',
      description: 'Google\'s multimodal AI model',
    },
  ],
  local: [
    {
      id: 'llama-2-7b',
      name: 'Llama 2 7B',
      provider: 'local',
      type: 'chat',
      capabilities: ['text-generation', 'chat', 'completion'],
      maxTokens: 4096,
      costPer1kTokens: { input: 0, output: 0 },
      speed: 'medium',
      quality: 'good',
      description: 'Open-source model that can run locally',
    },
  ],
};

// Tool registration function for AI model management tools
export function createAIModelsTools(getClient: () => N8nClient | null, server: any) {
  // List available AI models
  server.addTool({
    name: 'list-ai-models',
    description: 'List available AI models with filtering by provider, capability, and search terms',
    parameters: ModelSearchSchema,
    annotations: {
      title: 'List AI Models',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof ModelSearchSchema>) => {
      try {
        let allModels: any[] = [];
        
        // Collect models from all providers
        Object.entries(AI_MODELS_DATABASE).forEach(([provider, models]) => {
          if (args.provider === 'all' || args.provider === provider) {
            allModels.push(...models);
          }
        });

        // Filter by capability
        if (args.capability !== 'all') {
          allModels = allModels.filter(model => 
            model.capabilities.includes(args.capability)
          );
        }

        // Filter by search query
        if (args.query) {
          const query = args.query.toLowerCase();
          allModels = allModels.filter(model => 
            model.name.toLowerCase().includes(query) ||
            model.id.toLowerCase().includes(query) ||
            model.description.toLowerCase().includes(query) ||
            model.provider.toLowerCase().includes(query)
          );
        }

        // Limit results
        allModels = allModels.slice(0, args.maxResults);

        if (allModels.length === 0) {
          return `No AI models found matching your criteria:\n` +
                 `- Provider: ${args.provider}\n` +
                 `- Capability: ${args.capability}\n` +
                 `- Query: ${args.query || 'None'}\n\n` +
                 `Try broadening your search criteria.`;
        }

        let result = `Found ${allModels.length} AI model(s):\n\n`;

        allModels.forEach((model, index) => {
          const inputCost = model.costPer1kTokens.input;
          const outputCost = model.costPer1kTokens.output;
          
          result += `**${index + 1}. ${model.name}** (${model.id})\n`;
          result += `   - Provider: ${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)}\n`;
          result += `   - Type: ${model.type}\n`;
          result += `   - Max Tokens: ${model.maxTokens.toLocaleString()}\n`;
          result += `   - Speed: ${model.speed}\n`;
          result += `   - Quality: ${model.quality}\n`;
          result += `   - Cost: $${inputCost}/$${outputCost} per 1k tokens (input/output)\n`;
          result += `   - Capabilities: ${model.capabilities.join(', ')}\n`;
          result += `   - Description: ${model.description}\n\n`;
        });

        result += `**Usage:** Use the model ID (e.g., "${allModels[0].id}") when configuring AI nodes in n8n workflows.`;

        return result;
      } catch (error: any) {
        throw new UserError(`Failed to list AI models: ${error.message}`);
      }
    },
  });

  // Get detailed model information
  server.addTool({
    name: 'get-ai-model-info',
    description: 'Get detailed information about a specific AI model including capabilities, pricing, and configuration options',
    parameters: z.object({
      modelId: z.string().min(1, 'Model ID is required'),
    }),
    annotations: {
      title: 'Get AI Model Info',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: { modelId: string }) => {
      try {
        let foundModel: any = null;
        
        // Search for the model across all providers
        Object.entries(AI_MODELS_DATABASE).forEach(([provider, models]) => {
          const model = models.find(m => m.id === args.modelId);
          if (model) {
            foundModel = model;
          }
        });

        if (!foundModel) {
          return `Model "${args.modelId}" not found.\n\n` +
                 `Use the "list-ai-models" tool to see available models.`;
        }

        const model = foundModel;
        const inputCost = model.costPer1kTokens.input;
        const outputCost = model.costPer1kTokens.output;

        // Calculate cost examples
        const exampleCosts = {
          smallRequest: (1000 * inputCost + 500 * outputCost).toFixed(4),
          mediumRequest: (5000 * inputCost + 2000 * outputCost).toFixed(4),
          largeRequest: (20000 * inputCost + 5000 * outputCost).toFixed(4),
        };

        return `**${model.name}** (${model.id})\n\n` +
               `**Basic Information:**\n` +
               `- Provider: ${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)}\n` +
               `- Model Type: ${model.type}\n` +
               `- Max Context: ${model.maxTokens.toLocaleString()} tokens\n` +
               `- Speed Rating: ${model.speed}\n` +
               `- Quality Rating: ${model.quality}\n\n` +
               `**Capabilities:**\n` +
               model.capabilities.map((cap: string) => `- ${cap.charAt(0).toUpperCase() + cap.slice(1).replace('-', ' ')}`).join('\n') + '\n\n' +
               `**Pricing:**\n` +
               `- Input: $${inputCost} per 1,000 tokens\n` +
               `- Output: $${outputCost} per 1,000 tokens\n\n` +
               `**Cost Examples:**\n` +
               `- Small request (1k input, 500 output): $${exampleCosts.smallRequest}\n` +
               `- Medium request (5k input, 2k output): $${exampleCosts.mediumRequest}\n` +
               `- Large request (20k input, 5k output): $${exampleCosts.largeRequest}\n\n` +
               `**Description:**\n${model.description}\n\n` +
               `**Configuration Example for n8n:**\n\`\`\`json\n` +
               `{\n` +
               `  "model": "${model.id}",\n` +
               `  "temperature": 0.7,\n` +
               `  "maxTokens": ${Math.min(4000, model.maxTokens)},\n` +
               `  "provider": "${model.provider}"\n` +
               `}\n\`\`\`\n\n` +
               `**Use Case Recommendations:**\n` +
               (model.quality === 'excellent' ? '- Complex reasoning and analysis tasks\n' : '') +
               (model.speed === 'very-fast' || model.speed === 'fast' ? '- Real-time applications\n' : '') +
               (inputCost < 0.005 ? '- High-volume processing\n' : '') +
               (model.maxTokens > 50000 ? '- Long document processing\n' : '') +
               (model.capabilities.includes('multimodal') ? '- Image and text processing\n' : '');
      } catch (error: any) {
        throw new UserError(`Failed to get model information: ${error.message}`);
      }
    },
  });

  // Compare AI models
  server.addTool({
    name: 'compare-ai-models',
    description: 'Compare multiple AI models across different criteria like cost, speed, quality, and capabilities',
    parameters: ModelComparisonSchema,
    annotations: {
      title: 'Compare AI Models',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof ModelComparisonSchema>) => {
      try {
        const models: any[] = [];
        
        // Find all requested models
        args.modelIds.forEach(modelId => {
          let foundModel: any = null;
          Object.entries(AI_MODELS_DATABASE).forEach(([provider, providerModels]) => {
            const model = providerModels.find(m => m.id === modelId);
            if (model) {
              foundModel = model;
            }
          });
          
          if (foundModel) {
            models.push(foundModel);
          }
        });

        if (models.length < 2) {
          return `Found only ${models.length} model(s) out of ${args.modelIds.length} requested.\n\n` +
                 `Missing models: ${args.modelIds.filter(id => !models.some(m => m.id === id)).join(', ')}\n\n` +
                 `Use "list-ai-models" to see available models.`;
        }

        let result = `**AI Model Comparison** (${models.length} models)\n\n`;

        // Create comparison table
        result += `| Model | Provider | Type | Max Tokens | Speed | Quality |\n`;
        result += `|-------|----------|------|------------|--------|----------|\n`;
        models.forEach(model => {
          result += `| ${model.name} | ${model.provider} | ${model.type} | ${model.maxTokens.toLocaleString()} | ${model.speed} | ${model.quality} |\n`;
        });
        result += '\n';

        // Cost comparison
        if (args.criteria.includes('cost')) {
          result += `**Cost Comparison (per 1k tokens):**\n`;
          models.forEach(model => {
            const inputCost = model.costPer1kTokens.input;
            const outputCost = model.costPer1kTokens.output;
            result += `- **${model.name}**: $${inputCost} input, $${outputCost} output\n`;
          });
          
          // Find most cost-effective
          const cheapestInput = models.reduce((min, model) => 
            model.costPer1kTokens.input < min.costPer1kTokens.input ? model : min
          );
          const cheapestOutput = models.reduce((min, model) => 
            model.costPer1kTokens.output < min.costPer1kTokens.output ? model : min
          );
          
          result += `\n💰 **Most Cost-Effective:**\n`;
          result += `- Input: ${cheapestInput.name} ($${cheapestInput.costPer1kTokens.input})\n`;
          result += `- Output: ${cheapestOutput.name} ($${cheapestOutput.costPer1kTokens.output})\n\n`;
        }

        // Speed comparison
        if (args.criteria.includes('speed')) {
          const speedRanking = {
            'very-fast': 5,
            'fast': 4,
            'medium': 3,
            'slow': 2,
            'very-slow': 1
          };
          
          const sortedBySpeed = models.sort((a, b) => 
            (speedRanking[b.speed as keyof typeof speedRanking] || 3) - 
            (speedRanking[a.speed as keyof typeof speedRanking] || 3)
          );
          
          result += `**Speed Ranking:**\n`;
          sortedBySpeed.forEach((model, index) => {
            result += `${index + 1}. **${model.name}**: ${model.speed}\n`;
          });
          result += '\n';
        }

        // Quality comparison
        if (args.criteria.includes('quality')) {
          const qualityRanking = {
            'excellent': 5,
            'very-good': 4,
            'good': 3,
            'fair': 2,
            'poor': 1
          };
          
          const sortedByQuality = models.sort((a, b) => 
            (qualityRanking[b.quality as keyof typeof qualityRanking] || 3) - 
            (qualityRanking[a.quality as keyof typeof qualityRanking] || 3)
          );
          
          result += `**Quality Ranking:**\n`;
          sortedByQuality.forEach((model, index) => {
            result += `${index + 1}. **${model.name}**: ${model.quality}\n`;
          });
          result += '\n';
        }

        // Capabilities comparison
        if (args.criteria.includes('capabilities')) {
          result += `**Capabilities Comparison:**\n`;
          const allCapabilities = [...new Set(models.flatMap(m => m.capabilities))];
          
          allCapabilities.forEach(capability => {
            const modelsWithCapability = models.filter(m => m.capabilities.includes(capability));
            result += `- **${capability.charAt(0).toUpperCase() + capability.slice(1).replace('-', ' ')}**: `;
            result += modelsWithCapability.map(m => m.name).join(', ') + '\n';
          });
          result += '\n';
        }

        // Recommendations
        result += `**Recommendations:**\n`;
        const cheapest = models.reduce((min, model) => 
          (model.costPer1kTokens.input + model.costPer1kTokens.output) < 
          (min.costPer1kTokens.input + min.costPer1kTokens.output) ? model : min
        );
        const fastest = models.reduce((max, model) => {
          const speedValue = { 'very-fast': 5, 'fast': 4, 'medium': 3, 'slow': 2, 'very-slow': 1 };
          return (speedValue[model.speed as keyof typeof speedValue] || 3) > 
                 (speedValue[max.speed as keyof typeof speedValue] || 3) ? model : max;
        });
        const highest_quality = models.reduce((max, model) => {
          const qualityValue = { 'excellent': 5, 'very-good': 4, 'good': 3, 'fair': 2, 'poor': 1 };
          return (qualityValue[model.quality as keyof typeof qualityValue] || 3) > 
                 (qualityValue[max.quality as keyof typeof qualityValue] || 3) ? model : max;
        });

        result += `- **For budget-conscious projects**: ${cheapest.name}\n`;
        result += `- **For real-time applications**: ${fastest.name}\n`;
        result += `- **For complex reasoning**: ${highest_quality.name}\n`;

        return result;
      } catch (error: any) {
        throw new UserError(`Failed to compare AI models: ${error.message}`);
      }
    },
  });

  // Get model recommendations
  server.addTool({
    name: 'recommend-ai-model',
    description: 'Get AI model recommendations based on use case, budget, and performance requirements',
    parameters: z.object({
      useCase: z.enum([
        'chatbot', 'content-generation', 'code-generation', 'data-analysis',
        'translation', 'summarization', 'classification', 'general-purpose'
      ]),
      budget: z.enum(['low', 'medium', 'high', 'unlimited']).optional().default('medium'),
      priority: z.enum(['cost', 'speed', 'quality', 'balanced']).optional().default('balanced'),
      maxTokens: z.number().min(1000).max(200000).optional(),
    }),
    annotations: {
      title: 'Recommend AI Model',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: { 
      useCase: string; 
      budget?: string; 
      priority?: string; 
      maxTokens?: number; 
    }) => {
      try {
        let allModels: any[] = [];
        Object.entries(AI_MODELS_DATABASE).forEach(([provider, models]) => {
          allModels.push(...models);
        });

        // Filter by token requirements
        if (args.maxTokens) {
          allModels = allModels.filter(model => model.maxTokens >= args.maxTokens!);
        }

        // Filter by budget
        if (args.budget !== 'unlimited') {
          const budgetLimits = {
            low: 0.005,    // max $0.005 per 1k tokens
            medium: 0.02,  // max $0.02 per 1k tokens
            high: 0.1,     // max $0.1 per 1k tokens
          };
          
          const limit = budgetLimits[args.budget as keyof typeof budgetLimits] || 0.02;
          allModels = allModels.filter(model => 
            model.costPer1kTokens.input <= limit && model.costPer1kTokens.output <= limit * 2
          );
        }

        // Score models based on priority
        const scoredModels = allModels.map(model => {
          let score = 0;
          
          // Use case specific scoring
          switch (args.useCase) {
            case 'chatbot':
              if (model.capabilities.includes('chat')) score += 30;
              if (model.speed === 'fast' || model.speed === 'very-fast') score += 20;
              break;
            case 'content-generation':
              if (model.quality === 'excellent') score += 30;
              if (model.maxTokens > 32000) score += 20;
              break;
            case 'code-generation':
              if (model.capabilities.includes('completion')) score += 30;
              if (model.quality === 'excellent') score += 20;
              break;
            case 'data-analysis':
              if (model.quality === 'excellent') score += 40;
              if (model.maxTokens > 50000) score += 10;
              break;
            default:
              score += 20; // Base score for general use
          }

          // Priority-based scoring
          switch (args.priority) {
            case 'cost':
              const totalCost = model.costPer1kTokens.input + model.costPer1kTokens.output;
              score += Math.max(0, 50 - totalCost * 1000); // Lower cost = higher score
              break;
            case 'speed':
              const speedScores = { 'very-fast': 50, 'fast': 40, 'medium': 30, 'slow': 20, 'very-slow': 10 };
              score += speedScores[model.speed as keyof typeof speedScores] || 25;
              break;
            case 'quality':
              const qualityScores = { 'excellent': 50, 'very-good': 40, 'good': 30, 'fair': 20, 'poor': 10 };
              score += qualityScores[model.quality as keyof typeof qualityScores] || 25;
              break;
            case 'balanced':
              // Balanced scoring
              const balancedSpeedScores = { 'very-fast': 20, 'fast': 18, 'medium': 15, 'slow': 10, 'very-slow': 5 };
              const balancedQualityScores = { 'excellent': 20, 'very-good': 18, 'good': 15, 'fair': 10, 'poor': 5 };
              const balancedCostScore = Math.max(0, 10 - (model.costPer1kTokens.input + model.costPer1kTokens.output) * 100);
              score += (balancedSpeedScores[model.speed as keyof typeof balancedSpeedScores] || 10) +
                      (balancedQualityScores[model.quality as keyof typeof balancedQualityScores] || 10) +
                      balancedCostScore;
              break;
          }

          return { ...model, score };
        });

        // Sort by score and take top 3
        const recommendations = scoredModels
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        if (recommendations.length === 0) {
          return `No AI models found matching your criteria:\n` +
                 `- Use Case: ${args.useCase}\n` +
                 `- Budget: ${args.budget}\n` +
                 `- Priority: ${args.priority}\n` +
                 `- Max Tokens: ${args.maxTokens || 'No limit'}\n\n` +
                 `Try adjusting your requirements or budget.`;
        }

        let result = `**AI Model Recommendations for ${args.useCase}**\n\n`;
        result += `**Your Requirements:**\n`;
        result += `- Use Case: ${args.useCase}\n`;
        result += `- Budget: ${args.budget}\n`;
        result += `- Priority: ${args.priority}\n`;
        result += `- Max Tokens: ${args.maxTokens?.toLocaleString() || 'No specific requirement'}\n\n`;

        recommendations.forEach((model, index) => {
          const ranking = ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
          const inputCost = model.costPer1kTokens.input;
          const outputCost = model.costPer1kTokens.output;
          
          result += `${ranking} **${model.name}** (Score: ${model.score.toFixed(0)})\n`;
          result += `   - Provider: ${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)}\n`;
          result += `   - Speed: ${model.speed}, Quality: ${model.quality}\n`;
          result += `   - Cost: $${inputCost}/$${outputCost} per 1k tokens\n`;
          result += `   - Max Tokens: ${model.maxTokens.toLocaleString()}\n`;
          result += `   - Best For: ${model.description}\n\n`;
        });

        const topModel = recommendations[0];
        result += `**Quick Start with ${topModel.name}:**\n`;
        result += `\`\`\`json\n`;
        result += `{\n`;
        result += `  "model": "${topModel.id}",\n`;
        result += `  "temperature": 0.7,\n`;
        result += `  "maxTokens": ${Math.min(4000, topModel.maxTokens)}\n`;
        result += `}\n`;
        result += `\`\`\``;

        return result;
      } catch (error: any) {
        throw new UserError(`Failed to get model recommendations: ${error.message}`);
      }
    },
  });
}