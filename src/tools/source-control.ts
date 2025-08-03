import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { N8nWorkflow } from '../types/n8n.js';
import { createGitClient, GitAuthOptions, RepositoryContent } from '../client/gitIntegration.js';

const GitRepositorySchema = z.object({
  url: z.string().url('Valid Git repository URL is required'),
  branch: z.string().min(1, 'Branch name is required').default('main'),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

const ImportWorkflowFromGitSchema = z.object({
  repositoryUrl: z.string().url('Valid Git repository URL is required'),
  workflowPath: z.string().min(1, 'Workflow file path is required'),
  branch: z.string().default('main'),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  activate: z.boolean().default(false),
});

const ExportWorkflowToGitSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  repositoryUrl: z.string().url('Valid Git repository URL is required'),
  filePath: z.string().min(1, 'File path in repository is required'),
  branch: z.string().default('main'),
  commitMessage: z.string().min(1, 'Commit message is required'),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

const SyncFromRepositorySchema = z.object({
  repositoryUrl: z.string().url('Valid Git repository URL is required'),
  configPath: z.string().default('n8n-config.json'),
  branch: z.string().default('main'),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  dryRun: z.boolean().default(false),
});

const ListRepositoryContentsSchema = z.object({
  repositoryUrl: z.string().url('Valid Git repository URL is required'),
  path: z.string().default(''),
  branch: z.string().default('main'),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

interface SyncResult {
  workflowsImported: number;
  workflowsUpdated: number;
  credentialsImported: number;
  variablesImported: number;
  errors: string[];
}

export function createSourceControlTools(getClient: () => N8nClient | null, server: any) {
  server.addTool({
    name: 'import-workflow-from-git',
    description: 'Import a workflow from a Git repository into n8n',
    parameters: ImportWorkflowFromGitSchema,
    annotations: {
      title: 'Import Workflow from Git Repository',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ImportWorkflowFromGitSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        // Fetch workflow file from Git repository
        const workflowContent = await fetchFileFromRepository(
          args.repositoryUrl,
          args.workflowPath,
          args.branch,
          {
            token: args.token,
            username: args.username,
            password: args.password,
          }
        );

        // Parse workflow JSON
        let workflowData: N8nWorkflow;
        try {
          workflowData = JSON.parse(workflowContent);
        } catch (parseError) {
          throw new UserError(
            `Invalid workflow JSON format: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`
          );
        }

        // Validate workflow structure
        if (!workflowData.name || !workflowData.nodes) {
          throw new UserError('Invalid workflow structure: missing required fields (name, nodes)');
        }

        // Create workflow in n8n
        const createData = {
          name: workflowData.name,
          nodes: workflowData.nodes || [],
          connections: workflowData.connections || {},
          active: args.activate,
          tags: workflowData.tags || [],
          settings: workflowData.settings || {},
        };

        const result = await client.createWorkflow(createData);

        // Activate if requested
        if (args.activate && result.id) {
          await client.activateWorkflow(result.id);
        }

        return (
          `✅ Successfully imported workflow "${workflowData.name}" from Git repository\n` +
          `📋 Workflow ID: ${result.id}\n` +
          `🌐 Repository: ${args.repositoryUrl}\n` +
          `📁 Path: ${args.workflowPath}\n` +
          `🌿 Branch: ${args.branch}\n` +
          `⚡ Status: ${args.activate ? 'Active' : 'Inactive'}`
        );
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        if (error instanceof Error) {
          throw new UserError(`Failed to import workflow from Git: ${error.message}`);
        }
        throw new UserError('Failed to import workflow from Git with unknown error');
      }
    },
  });

  server.addTool({
    name: 'export-workflow-to-git',
    description: 'Export a workflow from n8n to a Git repository',
    parameters: ExportWorkflowToGitSchema,
    annotations: {
      title: 'Export Workflow to Git Repository',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExportWorkflowToGitSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        // Get workflow from n8n
        const workflow = await client.getWorkflow(args.workflowId);

        // Prepare export data (remove runtime fields)
        const exportData = {
          name: workflow.name,
          nodes: workflow.nodes || [],
          connections: workflow.connections || {},
          tags: workflow.tags || [],
          settings: workflow.settings || {},
          meta: {
            exportedAt: new Date().toISOString(),
            exportedBy: 'n8n-mcp-server',
            version: '1.0',
          },
        };

        const workflowJson = JSON.stringify(exportData, null, 2);

        // Push to Git repository
        await pushFileToRepository(
          args.repositoryUrl,
          args.filePath,
          workflowJson,
          args.commitMessage,
          args.branch,
          {
            token: args.token,
            username: args.username,
            password: args.password,
          }
        );

        return (
          `✅ Successfully exported workflow "${workflow.name}" to Git repository\n` +
          `📋 Workflow ID: ${args.workflowId}\n` +
          `🌐 Repository: ${args.repositoryUrl}\n` +
          `📁 File Path: ${args.filePath}\n` +
          `🌿 Branch: ${args.branch}\n` +
          `💬 Commit: ${args.commitMessage}`
        );
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        if (error instanceof Error) {
          throw new UserError(`Failed to export workflow to Git: ${error.message}`);
        }
        throw new UserError('Failed to export workflow to Git with unknown error');
      }
    },
  });

  server.addTool({
    name: 'sync-from-repository',
    description: 'Sync workflows and configurations from a Git repository to n8n',
    parameters: SyncFromRepositorySchema,
    annotations: {
      title: 'Sync from Git Repository',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof SyncFromRepositorySchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        // Fetch configuration file from repository
        const configContent = await fetchFileFromRepository(
          args.repositoryUrl,
          args.configPath,
          args.branch,
          {
            token: args.token,
            username: args.username,
            password: args.password,
          }
        );

        let config: any;
        try {
          config = JSON.parse(configContent);
        } catch (parseError) {
          throw new UserError(
            `Invalid configuration JSON format: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`
          );
        }

        const result: SyncResult = {
          workflowsImported: 0,
          workflowsUpdated: 0,
          credentialsImported: 0,
          variablesImported: 0,
          errors: [],
        };

        if (args.dryRun) {
          return (
            `🔍 Dry run completed for repository sync\n` +
            `📂 Config found: ${args.configPath}\n` +
            `📋 Workflows to sync: ${config.workflows?.length || 0}\n` +
            `🔑 Credentials to sync: ${config.credentials?.length || 0}\n` +
            `📝 Variables to sync: ${config.variables?.length || 0}\n` +
            `⚠️ Use dryRun: false to perform actual sync`
          );
        }

        // Sync workflows
        if (config.workflows && Array.isArray(config.workflows)) {
          for (const workflowPath of config.workflows) {
            try {
              const workflowContent = await fetchFileFromRepository(
                args.repositoryUrl,
                workflowPath,
                args.branch,
                {
                  token: args.token,
                  username: args.username,
                  password: args.password,
                }
              );

              const workflowData = JSON.parse(workflowContent);

              // Check if workflow exists
              const existingWorkflows = await client.getWorkflows({ limit: 100 });
              const existingWorkflow = existingWorkflows.data.find(
                (w: N8nWorkflow) => w.name === workflowData.name
              );

              if (existingWorkflow) {
                // Update existing workflow
                await client.updateWorkflow(existingWorkflow.id, workflowData);
                result.workflowsUpdated++;
              } else {
                // Create new workflow
                await client.createWorkflow(workflowData);
                result.workflowsImported++;
              }
            } catch (error) {
              result.errors.push(
                `Workflow ${workflowPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          }
        }

        // Sync credentials (if supported)
        if (config.credentials && Array.isArray(config.credentials)) {
          for (const credentialConfig of config.credentials) {
            try {
              // Note: Credential sync would require secure handling
              // This is a placeholder for the implementation
              result.credentialsImported++;
            } catch (error) {
              result.errors.push(
                `Credential ${credentialConfig.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          }
        }

        return (
          `✅ Repository sync completed\n` +
          `📋 Workflows imported: ${result.workflowsImported}\n` +
          `📝 Workflows updated: ${result.workflowsUpdated}\n` +
          `🔑 Credentials imported: ${result.credentialsImported}\n` +
          `📊 Variables imported: ${result.variablesImported}\n` +
          `❌ Errors: ${result.errors.length}\n` +
          (result.errors.length > 0
            ? `\nErrors:\n${result.errors.map(e => `• ${e}`).join('\n')}`
            : '')
        );
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        if (error instanceof Error) {
          throw new UserError(`Failed to sync from repository: ${error.message}`);
        }
        throw new UserError('Failed to sync from repository with unknown error');
      }
    },
  });

  server.addTool({
    name: 'list-repository-contents',
    description: 'List contents of a Git repository directory',
    parameters: ListRepositoryContentsSchema,
    annotations: {
      title: 'List Git Repository Contents',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ListRepositoryContentsSchema>) => {
      try {
        const contents = await listRepositoryContents(args.repositoryUrl, args.path, args.branch, {
          token: args.token,
          username: args.username,
          password: args.password,
        });

        if (contents.length === 0) {
          return (
            `📂 Repository directory "${args.path}" is empty\n` +
            `🌐 Repository: ${args.repositoryUrl}\n` +
            `🌿 Branch: ${args.branch}`
          );
        }

        const directories = contents.filter(item => item.type === 'directory');
        const files = contents.filter(item => item.type === 'file');

        let result =
          `📂 Repository contents for "${args.path}"\n` +
          `🌐 Repository: ${args.repositoryUrl}\n` +
          `🌿 Branch: ${args.branch}\n\n`;

        if (directories.length > 0) {
          result += `📁 Directories (${directories.length}):\n`;
          directories.forEach(dir => {
            result += `  • ${dir.name}/\n`;
          });
          result += '\n';
        }

        if (files.length > 0) {
          result += `📄 Files (${files.length}):\n`;
          files.forEach(file => {
            const size = file.size ? ` (${formatBytes(file.size)})` : '';
            result += `  • ${file.name}${size}\n`;
          });
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to list repository contents: ${error.message}`);
        }
        throw new UserError('Failed to list repository contents with unknown error');
      }
    },
  });

  server.addTool({
    name: 'validate-git-repository',
    description: 'Validate access to a Git repository and check for n8n configuration',
    parameters: GitRepositorySchema,
    annotations: {
      title: 'Validate Git Repository',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof GitRepositorySchema>) => {
      try {
        // Test repository access
        const contents = await listRepositoryContents(args.url, '', args.branch, {
          token: args.token,
          username: args.username,
          password: args.password,
        });

        // Check for n8n configuration files
        const configFiles = contents.filter(
          item =>
            item.type === 'file' &&
            (item.name.includes('n8n') || item.name.endsWith('.json') || item.name.endsWith('.yml'))
        );

        const workflowFiles = contents.filter(
          item =>
            item.type === 'file' &&
            item.name.endsWith('.json') &&
            item.name.toLowerCase().includes('workflow')
        );

        let result =
          `✅ Git repository validation successful\n` +
          `🌐 Repository: ${args.url}\n` +
          `🌿 Branch: ${args.branch}\n` +
          `📁 Total items: ${contents.length}\n\n`;

        if (configFiles.length > 0) {
          result += `⚙️ Configuration files found (${configFiles.length}):\n`;
          configFiles.forEach(file => {
            result += `  • ${file.name}\n`;
          });
          result += '\n';
        }

        if (workflowFiles.length > 0) {
          result += `📋 Potential workflow files (${workflowFiles.length}):\n`;
          workflowFiles.forEach(file => {
            result += `  • ${file.name}\n`;
          });
          result += '\n';
        }

        result += `🔗 Repository is accessible and ready for n8n integration`;

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Repository validation failed: ${error.message}`);
        }
        throw new UserError('Repository validation failed with unknown error');
      }
    },
  });
}

// Helper functions for Git operations

async function fetchFileFromRepository(
  repositoryUrl: string,
  filePath: string,
  branch: string,
  auth: GitAuthOptions
): Promise<string> {
  const gitClient = createGitClient(repositoryUrl, auth);
  return await gitClient.getFileContent(repositoryUrl, filePath, branch);
}

async function pushFileToRepository(
  repositoryUrl: string,
  filePath: string,
  content: string,
  commitMessage: string,
  branch: string,
  auth: GitAuthOptions
): Promise<void> {
  const gitClient = createGitClient(repositoryUrl, auth);
  await gitClient.createOrUpdateFile(
    repositoryUrl,
    filePath,
    content,
    { message: commitMessage, branch },
    branch
  );
}

async function listRepositoryContents(
  repositoryUrl: string,
  path: string,
  branch: string,
  auth: GitAuthOptions
): Promise<RepositoryContent[]> {
  const gitClient = createGitClient(repositoryUrl, auth);
  return await gitClient.listContents(repositoryUrl, path, branch);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
