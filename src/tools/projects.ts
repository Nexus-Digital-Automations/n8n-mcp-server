import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import {
  N8nProject,
  CreateProjectRequest,
  UpdateProjectRequest,
  PaginationOptions
} from '../types/n8n.js';

// Zod schemas for validation
const ProjectIdSchema = z.object({
  projectId: z.string().min(1, "Project ID is required")
});

const ListProjectsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional()
});

const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  type: z.string().optional()
});

const UpdateProjectSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  name: z.string().min(1, "Project name is required")
});

// Tool registration function
export function createProjectTools(getClient: () => N8nClient | null, server: any) {
  // List projects tool
  server.addTool({
    name: "list-projects",
    description: "List all projects from n8n. NOTE: Requires n8n Enterprise license with project management features enabled",
    parameters: ListProjectsSchema,
    annotations: {
      title: "List n8n Projects",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof ListProjectsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const options: PaginationOptions = {};
        if (args.limit) options.limit = args.limit;
        if (args.cursor) options.cursor = args.cursor;

        const response = await client.getProjects(options);
        
        if (response.data.length === 0) {
          return "No projects found in the n8n instance.";
        }

        let result = `Found ${response.data.length} project(s):\n\n`;
        
        response.data.forEach((project: N8nProject, index: number) => {
          result += `${index + 1}. **${project.name}**\n`;
          result += `   - ID: ${project.id}\n`;
          if (project.type) {
            result += `   - Type: ${project.type}\n`;
          }
          if (project.createdAt) {
            result += `   - Created: ${new Date(project.createdAt).toLocaleDateString()}\n`;
          }
          result += '\n';
        });

        if (response.nextCursor) {
          result += `\n📄 Use cursor "${response.nextCursor}" to get the next page.`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          // Check for license-related errors
          if (error.message.includes('license')) {
            throw new UserError(`This operation requires an n8n Enterprise license with project management features enabled. Error: ${error.message}`);
          }
          throw new UserError(`Failed to list projects: ${error.message}`);
        }
        throw new UserError('Failed to list projects with unknown error');
      }
    }
  });

  // Create project tool
  server.addTool({
    name: "create-project",
    description: "Create a new project in n8n. NOTE: Requires n8n Enterprise license with project management features enabled",
    parameters: CreateProjectSchema,
    annotations: {
      title: "Create New Project",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof CreateProjectSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const projectData: CreateProjectRequest = {
          name: args.name,
          type: args.type
        };

        const project = await client.createProject(projectData);
        
        return `✅ Successfully created project "${project.name}" with ID: ${project.id}\n` +
               (project.type ? `Type: ${project.type}` : '');
      } catch (error) {
        if (error instanceof Error) {
          // Check for license-related errors
          if (error.message.includes('license')) {
            throw new UserError(`This operation requires an n8n Enterprise license with project management features enabled. Error: ${error.message}`);
          }
          throw new UserError(`Failed to create project: ${error.message}`);
        }
        throw new UserError('Failed to create project with unknown error');
      }
    }
  });

  // Update project tool
  server.addTool({
    name: "update-project",
    description: "Update a project's name and properties. NOTE: Requires n8n Enterprise license with project management features enabled",
    parameters: UpdateProjectSchema,
    annotations: {
      title: "Update Project",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof UpdateProjectSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const { projectId, ...updateData } = args;
        const projectData: UpdateProjectRequest = {
          name: updateData.name
        };

        const project = await client.updateProject(projectId, projectData);
        
        return `✅ Successfully updated project "${project.name}" (ID: ${project.id})\n` +
               (project.type ? `Type: ${project.type}` : '');
      } catch (error) {
        if (error instanceof Error) {
          // Check for license-related errors
          if (error.message.includes('license')) {
            throw new UserError(`This operation requires an n8n Enterprise license with project management features enabled. Error: ${error.message}`);
          }
          throw new UserError(`Failed to update project: ${error.message}`);
        }
        throw new UserError('Failed to update project with unknown error');
      }
    }
  });

  // Delete project tool
  server.addTool({
    name: "delete-project",
    description: "Delete a project from n8n permanently. NOTE: Requires n8n Enterprise license with project management features enabled",
    parameters: ProjectIdSchema,
    annotations: {
      title: "Delete Project",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof ProjectIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        await client.deleteProject(args.projectId);
        return `✅ Successfully deleted project with ID: ${args.projectId}`;
      } catch (error) {
        if (error instanceof Error) {
          // Check for license-related errors
          if (error.message.includes('license')) {
            throw new UserError(`This operation requires an n8n Enterprise license with project management features enabled. Error: ${error.message}`);
          }
          throw new UserError(`Failed to delete project: ${error.message}`);
        }
        throw new UserError('Failed to delete project with unknown error');
      }
    }
  });
}