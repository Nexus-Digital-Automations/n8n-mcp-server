import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { FileHandlingUtils } from '../utils/fileHandling.js';
// Note: Types are imported in the FileHandlingUtils but not directly used in this file
// They are used indirectly through the utility class methods

// Zod schemas for validation
const FileUploadSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  data: z.string().min(1, 'File data (base64) is required'),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
  nodeId: z.string().optional(),
});

const FileDownloadSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
});

const FileDeleteSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
});

const FileListSchema = z.object({
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
  nodeId: z.string().optional(),
  uploadedAfter: z.string().optional(),
  uploadedBefore: z.string().optional(),
  minFileSize: z.number().optional(),
  maxFileSize: z.number().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

const FileMetadataSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
});

const WorkflowManifestSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
});

const FileCleanupSchema = z.object({
  olderThanDays: z.number().min(1).max(365).optional(),
  dryRun: z.boolean().optional().default(false),
});

const TransferProgressSchema = z.object({
  transferId: z.string().min(1, 'Transfer ID is required'),
});

const FileValidationSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  fileSize: z.number().min(1, 'File size is required'),
  maxFileSize: z.number().optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
  allowedExtensions: z.array(z.string()).optional(),
});

// Global file handling instance
let fileHandler: FileHandlingUtils | null = null;

// Function to get the global file handler instance
const getFileHandler = () => {
  if (!fileHandler) {
    fileHandler = new FileHandlingUtils({
      baseDirectory: process.env.N8N_FILES_DIR || './data/files',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'), // 100MB
      allowedMimeTypes: process.env.ALLOWED_MIME_TYPES?.split(',') || [
        'image/*',
        'text/*',
        'application/json',
        'application/pdf',
        'application/zip',
        'application/x-zip-compressed',
        'application/octet-stream',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    });
  }
  return fileHandler;
};

// Tool registration function
export function createDataManagementTools(getClient: () => N8nClient | null, server: any) {
  // Upload file tool
  server.addTool({
    name: 'upload-file',
    description:
      'Upload a file to n8n for workflow or execution use. Supports binary data with progress tracking.',
    parameters: FileUploadSchema,
    annotations: {
      title: 'Upload File',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof FileUploadSchema>) => {
      try {
        const handler = getFileHandler();
        const result = await handler.uploadFile(args);

        if (result.success) {
          return (
            `✅ **File Uploaded Successfully**\n\n` +
            `- **File Name:** ${result.fileName}\n` +
            `- **File ID:** ${result.fileId}\n` +
            `- **File Size:** ${formatFileSize(result.fileSize || 0)}\n` +
            `- **Transfer ID:** ${result.transferId}\n\n` +
            `The file is now available for use in workflows and can be downloaded using the file ID.`
          );
        } else {
          throw new UserError(result.message);
        }
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Download file tool
  server.addTool({
    name: 'download-file',
    description: 'Download a file by its ID. Returns the file data as base64 along with metadata.',
    parameters: FileDownloadSchema,
    annotations: {
      title: 'Download File',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof FileDownloadSchema>) => {
      try {
        const handler = getFileHandler();
        const result = await handler.downloadFile(args.fileId);

        if (result.success && result.data && result.metadata) {
          return (
            `✅ **File Downloaded Successfully**\n\n` +
            `- **File Name:** ${result.metadata.fileName}\n` +
            `- **MIME Type:** ${result.metadata.mimeType}\n` +
            `- **File Size:** ${formatFileSize(result.metadata.fileSize)}\n` +
            `- **Uploaded:** ${new Date(result.metadata.uploadedAt).toLocaleString()}\n` +
            `- **Transfer ID:** ${result.transferId}\n\n` +
            `**Base64 Data:**\n\`\`\`\n${result.data}\n\`\`\`\n\n` +
            `💾 Use this base64 data in workflows or save to a file.`
          );
        } else {
          throw new UserError(result.message);
        }
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Delete file tool
  server.addTool({
    name: 'delete-file',
    description: 'Delete a file from storage permanently. This action cannot be undone.',
    parameters: FileDeleteSchema,
    annotations: {
      title: 'Delete File',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof FileDeleteSchema>) => {
      try {
        const handler = getFileHandler();
        const result = await handler.deleteFile(args.fileId);

        if (result.success) {
          return (
            `✅ **File Deleted Successfully**\n\n` +
            `- **File Name:** ${result.fileName}\n` +
            `- **File ID:** ${args.fileId}\n\n` +
            `The file has been permanently removed from storage.`
          );
        } else {
          throw new UserError(result.message);
        }
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // List files tool
  server.addTool({
    name: 'list-files',
    description:
      'List files in storage with optional filtering by workflow, execution, file type, etc.',
    parameters: FileListSchema,
    annotations: {
      title: 'List Files',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof FileListSchema>) => {
      try {
        const handler = getFileHandler();
        const files = await handler.listFiles(args);

        if (files.length === 0) {
          return 'No files found matching the specified criteria.';
        }

        let result = `📁 **Found ${files.length} file(s)**\n\n`;

        files.forEach((file, index) => {
          result += `${index + 1}. **${file.fileName}**\n`;
          result += `   - **ID:** ${file.id}\n`;
          result += `   - **Type:** ${file.mimeType}\n`;
          result += `   - **Size:** ${formatFileSize(file.fileSize)}\n`;
          result += `   - **Uploaded:** ${new Date(file.uploadedAt).toLocaleString()}\n`;

          if (file.workflowId) {
            result += `   - **Workflow:** ${file.workflowId}\n`;
          }
          if (file.executionId) {
            result += `   - **Execution:** ${file.executionId}\n`;
          }
          if (file.nodeId) {
            result += `   - **Node:** ${file.nodeId}\n`;
          }
          result += '\n';
        });

        // Add pagination info if applicable
        if (args.limit || args.offset) {
          const offset = args.offset || 0;
          const showing = files.length;
          result += `📄 Showing ${showing} files starting from offset ${offset}`;
          if (args.limit && files.length === args.limit) {
            result += `. Use offset ${offset + args.limit} to see more.`;
          }
        }

        return result;
      } catch (error) {
        throw new UserError(
          `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Get file metadata tool
  server.addTool({
    name: 'get-file-metadata',
    description:
      'Get detailed metadata for a specific file including upload date, associations, etc.',
    parameters: FileMetadataSchema,
    annotations: {
      title: 'Get File Metadata',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof FileMetadataSchema>) => {
      try {
        const handler = getFileHandler();
        const metadata = await handler.getFileMetadata(args.fileId);

        if (!metadata) {
          throw new UserError(`File with ID ${args.fileId} not found`);
        }

        let result = `📄 **File Metadata**\n\n`;
        result += `- **File Name:** ${metadata.fileName}\n`;
        result += `- **File ID:** ${metadata.id}\n`;
        result += `- **MIME Type:** ${metadata.mimeType}\n`;
        result += `- **File Size:** ${formatFileSize(metadata.fileSize)}\n`;
        result += `- **Uploaded:** ${new Date(metadata.uploadedAt).toLocaleString()}\n`;

        if (metadata.workflowId) {
          result += `- **Workflow ID:** ${metadata.workflowId}\n`;
        }
        if (metadata.executionId) {
          result += `- **Execution ID:** ${metadata.executionId}\n`;
        }
        if (metadata.nodeId) {
          result += `- **Node ID:** ${metadata.nodeId}\n`;
        }
        if (metadata.filePath) {
          result += `- **Storage Path:** ${metadata.filePath}\n`;
        }

        return result;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(
          `Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Get workflow file manifest tool
  server.addTool({
    name: 'get-workflow-files',
    description: 'Get a manifest of all files associated with a specific workflow.',
    parameters: WorkflowManifestSchema,
    annotations: {
      title: 'Get Workflow File Manifest',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof WorkflowManifestSchema>) => {
      try {
        const handler = getFileHandler();
        const manifest = await handler.getWorkflowFileManifest(args.workflowId);

        if (manifest.fileCount === 0) {
          return `No files found for workflow ${args.workflowId}`;
        }

        let result = `📂 **Workflow File Manifest**\n\n`;
        result += `- **Workflow ID:** ${manifest.workflowId}\n`;
        result += `- **Total Files:** ${manifest.fileCount}\n`;
        result += `- **Total Size:** ${formatFileSize(manifest.totalSize)}\n`;
        result += `- **Last Updated:** ${new Date(manifest.lastUpdated).toLocaleString()}\n\n`;

        result += `**Files:**\n`;
        manifest.files.forEach((file, index) => {
          result += `${index + 1}. **${file.fileName}** (${file.id})\n`;
          result += `   - Size: ${formatFileSize(file.fileSize)}\n`;
          result += `   - Type: ${file.mimeType}\n`;
          result += `   - Uploaded: ${new Date(file.uploadedAt).toLocaleString()}\n`;
          if (file.executionId) {
            result += `   - Execution: ${file.executionId}\n`;
          }
          if (file.nodeId) {
            result += `   - Node: ${file.nodeId}\n`;
          }
          result += '\n';
        });

        return result;
      } catch (error) {
        throw new UserError(
          `Failed to get workflow files: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Cleanup old files tool
  server.addTool({
    name: 'cleanup-old-files',
    description:
      'Clean up old files from storage to free space. Can run in dry-run mode to preview what would be deleted.',
    parameters: FileCleanupSchema,
    annotations: {
      title: 'Cleanup Old Files',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof FileCleanupSchema>) => {
      try {
        const handler = getFileHandler();

        if (args.dryRun) {
          // Dry run - just show what would be deleted
          const allFiles = await handler.listFiles();
          const cleanupDate = new Date();
          cleanupDate.setDate(cleanupDate.getDate() - (args.olderThanDays || 30));

          const filesToDelete = allFiles.filter(file => new Date(file.uploadedAt) < cleanupDate);
          const totalSize = filesToDelete.reduce((sum, file) => sum + file.fileSize, 0);

          if (filesToDelete.length === 0) {
            return `🧪 **Dry Run Results**\n\nNo files older than ${args.olderThanDays || 30} days found for cleanup.`;
          }

          let result = `🧪 **Dry Run Results**\n\n`;
          result += `Files that would be deleted (older than ${args.olderThanDays || 30} days):\n\n`;
          result += `- **Total Files:** ${filesToDelete.length}\n`;
          result += `- **Total Space:** ${formatFileSize(totalSize)}\n\n`;

          result += `**Files to be deleted:**\n`;
          filesToDelete.slice(0, 10).forEach((file, index) => {
            result += `${index + 1}. ${file.fileName} (${formatFileSize(file.fileSize)}) - ${new Date(file.uploadedAt).toLocaleDateString()}\n`;
          });

          if (filesToDelete.length > 10) {
            result += `... and ${filesToDelete.length - 10} more files\n`;
          }

          result += `\n💡 Run without \`dryRun: true\` to actually delete these files.`;
          return result;
        }

        const result = await handler.cleanupOldFiles(args.olderThanDays);

        let response = `🧹 **Cleanup Completed**\n\n`;
        response += `- **Files Deleted:** ${result.deletedFiles}\n`;
        response += `- **Space Freed:** ${formatFileSize(result.freedSpace)}\n`;

        if (result.errors.length > 0) {
          response += `\n⚠️ **Errors encountered:**\n`;
          result.errors.forEach(error => {
            response += `- ${error}\n`;
          });
        }

        return response;
      } catch (error) {
        throw new UserError(
          `Failed to cleanup files: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Get transfer progress tool
  server.addTool({
    name: 'get-transfer-progress',
    description: 'Get the progress of an active file transfer (upload/download).',
    parameters: TransferProgressSchema,
    annotations: {
      title: 'Get Transfer Progress',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof TransferProgressSchema>) => {
      try {
        const handler = getFileHandler();
        const progress = handler.getTransferProgress(args.transferId);

        if (!progress) {
          return `Transfer with ID ${args.transferId} not found. It may have completed or never existed.`;
        }

        let result = `📊 **Transfer Progress**\n\n`;
        result += `- **Transfer ID:** ${progress.transferId}\n`;
        result += `- **File Name:** ${progress.fileName}\n`;
        result += `- **Status:** ${progress.status.toUpperCase()}\n`;
        result += `- **Progress:** ${progress.percentComplete}%\n`;
        result += `- **Transferred:** ${formatFileSize(progress.transferredBytes)} / ${formatFileSize(progress.totalBytes)}\n`;
        result += `- **Started:** ${new Date(progress.startedAt).toLocaleString()}\n`;

        if (progress.completedAt) {
          result += `- **Completed:** ${new Date(progress.completedAt).toLocaleString()}\n`;
        }

        if (progress.error) {
          result += `- **Error:** ${progress.error}\n`;
        }

        if (progress.status === 'in-progress') {
          result += `\n🔄 Transfer is still in progress...`;
        } else if (progress.status === 'completed') {
          result += `\n✅ Transfer completed successfully!`;
        } else if (progress.status === 'failed') {
          result += `\n❌ Transfer failed.`;
        } else if (progress.status === 'cancelled') {
          result += `\n🚫 Transfer was cancelled.`;
        }

        return result;
      } catch (error) {
        throw new UserError(
          `Failed to get transfer progress: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // List active transfers tool
  server.addTool({
    name: 'list-active-transfers',
    description: 'List all currently active file transfers with their progress.',
    parameters: z.object({}),
    annotations: {
      title: 'List Active Transfers',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async () => {
      try {
        const handler = getFileHandler();
        const transfers = handler.getActiveTransfers();

        if (transfers.length === 0) {
          return 'No active transfers found.';
        }

        let result = `🔄 **Active Transfers (${transfers.length})**\n\n`;

        transfers.forEach((transfer, index) => {
          result += `${index + 1}. **${transfer.fileName}**\n`;
          result += `   - Transfer ID: ${transfer.transferId}\n`;
          result += `   - Status: ${transfer.status.toUpperCase()}\n`;
          result += `   - Progress: ${transfer.percentComplete}%\n`;
          result += `   - Size: ${formatFileSize(transfer.transferredBytes)} / ${formatFileSize(transfer.totalBytes)}\n`;
          result += `   - Started: ${new Date(transfer.startedAt).toLocaleString()}\n`;
          if (transfer.error) {
            result += `   - Error: ${transfer.error}\n`;
          }
          result += '\n';
        });

        return result;
      } catch (error) {
        throw new UserError(
          `Failed to list active transfers: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Validate file tool
  server.addTool({
    name: 'validate-file',
    description: 'Validate a file before upload by checking size, type, and other constraints.',
    parameters: FileValidationSchema,
    annotations: {
      title: 'Validate File',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof FileValidationSchema>) => {
      try {
        const handler = getFileHandler();
        const validation = await handler.validateFile(args.fileName, args.mimeType, args.fileSize, {
          maxFileSize: args.maxFileSize,
          allowedMimeTypes: args.allowedMimeTypes,
          allowedExtensions: args.allowedExtensions,
        });

        let result = `🔍 **File Validation Results**\n\n`;
        result += `- **File Name:** ${args.fileName}\n`;
        result += `- **MIME Type:** ${args.mimeType}\n`;
        result += `- **File Size:** ${formatFileSize(args.fileSize)}\n`;
        result += `- **Valid:** ${validation.isValid ? '✅ YES' : '❌ NO'}\n\n`;

        if (validation.errors.length > 0) {
          result += `**❌ Errors:**\n`;
          validation.errors.forEach(error => {
            result += `- ${error}\n`;
          });
          result += '\n';
        }

        if (validation.warnings.length > 0) {
          result += `**⚠️ Warnings:**\n`;
          validation.warnings.forEach(warning => {
            result += `- ${warning}\n`;
          });
          result += '\n';
        }

        if (validation.isValid) {
          result += `✅ File is valid and ready for upload!`;
        } else {
          result += `❌ File validation failed. Please fix the errors above before uploading.`;
        }

        return result;
      } catch (error) {
        throw new UserError(
          `Failed to validate file: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Get storage statistics tool
  server.addTool({
    name: 'get-storage-stats',
    description: 'Get storage statistics including total files, disk usage, and file distribution.',
    parameters: z.object({}),
    annotations: {
      title: 'Get Storage Statistics',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async () => {
      try {
        const handler = getFileHandler();
        const stats = await handler.getStorageStats();

        let result = `📊 **Storage Statistics**\n\n`;
        result += `- **Total Files:** ${stats.totalFiles.toLocaleString()}\n`;
        result += `- **Total Size:** ${formatFileSize(stats.totalSize)}\n`;
        result += `- **Average File Size:** ${formatFileSize(stats.averageFileSize)}\n`;

        if (stats.oldestFile) {
          result += `- **Oldest File:** ${new Date(stats.oldestFile).toLocaleString()}\n`;
        }
        if (stats.newestFile) {
          result += `- **Newest File:** ${new Date(stats.newestFile).toLocaleString()}\n`;
        }

        if (stats.totalFiles === 0) {
          result += `\n📁 No files currently in storage.`;
        }

        return result;
      } catch (error) {
        throw new UserError(
          `Failed to get storage statistics: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });
}

// Helper function to format file sizes
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
