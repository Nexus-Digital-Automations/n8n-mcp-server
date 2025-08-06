import { z } from 'zod';
import { UserError } from 'fastmcp';
import * as fs from 'fs/promises';
import * as path from 'path';
import { N8nClient } from '../client/n8nClient.js';
import { BinaryDataClient } from '../client/binaryDataClient.js';
import { FileHandlingUtils } from '../utils/fileHandling.js';
import {
  FileUploadRequest,
  FileDownloadRequest,
  StaticFileInfo,
  FileTransferProgress,
  N8nBinaryDataResponse,
} from '../types/fileTypes.js';

// Zod schemas for validation
const UploadBinaryDataSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
  nodeId: z.string().optional(),
  propertyName: z.string().default('data'),
  overrideMimeType: z.string().optional(),
});

const DownloadBinaryDataSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
  outputPath: z.string().min(1, 'Output path is required'),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
  nodeId: z.string().optional(),
});

const UploadFromBase64Schema = z.object({
  data: z.string().min(1, 'Base64 data is required'),
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
  nodeId: z.string().optional(),
});

const DownloadExecutionBinarySchema = z.object({
  executionId: z.string().min(1, 'Execution ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  outputPath: z.string().min(1, 'Output path is required'),
  outputIndex: z.number().min(0).default(0),
  itemIndex: z.number().min(0).default(0),
  propertyName: z.string().default('data'),
});

const UploadWorkflowBinarySchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  filePath: z.string().min(1, 'File path is required'),
  propertyName: z.string().default('data'),
  overrideMimeType: z.string().optional(),
});

const ListBinaryDataSchema = z.object({
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
  nodeId: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

const DeleteBinaryDataSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
});

const GetBinaryMetadataSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
});

const UploadLargeFileSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
  nodeId: z.string().optional(),
  chunkSize: z.number().min(1024).max(10 * 1024 * 1024).default(1024 * 1024), // 1MB default, max 10MB
  showProgress: z.boolean().default(true),
});

// Global instances
let binaryDataClient: BinaryDataClient | null = null;
let fileHandler: FileHandlingUtils | null = null;

// Initialize binary data client
const getBinaryDataClient = (getClient: () => N8nClient | null): BinaryDataClient => {
  if (!binaryDataClient) {
    const client = getClient();
    if (!client) {
      throw new UserError('N8n client not available');
    }
    // Extract baseUrl and apiKey from client (assuming they're accessible)
    const baseUrl = (client as any).baseUrl || process.env.N8N_BASE_URL || 'http://localhost:5678';
    const apiKey = (client as any).apiKey || process.env.N8N_API_KEY || '';
    
    binaryDataClient = new BinaryDataClient(client, baseUrl, apiKey);
  }
  return binaryDataClient;
};

// Initialize file handler
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

// Helper function to detect MIME type from file extension
const getMimeTypeFromExtension = (fileName: string): string => {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.zip': 'application/zip',
    '.csv': 'text/csv',
    '.xml': 'application/xml',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

// Tool registration function
export function createBinaryDataTools(getClient: () => N8nClient | null, server: any) {
  // Upload binary data from file system
  server.addTool({
    name: 'upload-binary-data',
    description: 'Upload a file from the local file system to n8n as binary data',
    parameters: UploadBinaryDataSchema,
    handler: async (args: z.infer<typeof UploadBinaryDataSchema>) => {
      try {
        const binaryClient = getBinaryDataClient(getClient);
        const fileHandler = getFileHandler();

        // Check if file exists
        try {
          await fs.access(args.filePath);
        } catch {
          throw new UserError(`File not found: ${args.filePath}`);
        }

        // Read file
        const fileData = await fs.readFile(args.filePath);
        const fileName = path.basename(args.filePath);
        const mimeType = args.overrideMimeType || getMimeTypeFromExtension(fileName);

        // Validate file
        const validation = await fileHandler.validateFile(fileName, mimeType, fileData.length);
        if (!validation.isValid) {
          throw new UserError(`File validation failed: ${validation.errors.join(', ')}`);
        }

        // Upload file
        const uploadRequest: FileUploadRequest = {
          fileName,
          mimeType,
          data: fileData.toString('base64'),
          workflowId: args.workflowId,
          executionId: args.executionId,
          nodeId: args.nodeId,
        };

        const result = await binaryClient.uploadBinaryData(uploadRequest);

        return {
          success: true,
          fileInfo: result,
          message: `Successfully uploaded ${fileName} (${fileData.length} bytes)`,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to upload binary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Download binary data to file system
  server.addTool({
    name: 'download-binary-data',
    description: 'Download binary data from n8n to the local file system',
    parameters: DownloadBinaryDataSchema,
    handler: async (args: z.infer<typeof DownloadBinaryDataSchema>) => {
      try {
        const binaryClient = getBinaryDataClient(getClient);

        // Download file
        const downloadRequest: FileDownloadRequest = {
          fileId: args.fileId,
          workflowId: args.workflowId,
          executionId: args.executionId,
          nodeId: args.nodeId,
        };

        const result = await binaryClient.downloadBinaryData(downloadRequest);
        
        // Convert base64 to buffer and save
        const fileData = Buffer.from(result.data, 'base64');
        
        // Ensure output directory exists
        const outputDir = path.dirname(args.outputPath);
        await fs.mkdir(outputDir, { recursive: true });

        await fs.writeFile(args.outputPath, fileData);

        return {
          success: true,
          outputPath: args.outputPath,
          fileName: result.fileName,
          mimeType: result.mimeType,
          fileSize: result.fileSize,
          message: `Successfully downloaded ${result.fileName} to ${args.outputPath}`,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to download binary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Upload binary data from base64 string
  server.addTool({
    name: 'upload-from-base64',
    description: 'Upload binary data from a base64 encoded string',
    parameters: UploadFromBase64Schema,
    handler: async (args: z.infer<typeof UploadFromBase64Schema>) => {
      try {
        const binaryClient = getBinaryDataClient(getClient);
        const fileHandler = getFileHandler();

        // Validate base64 data size
        const dataSize = (args.data.length * 3) / 4; // Approximate decoded size
        const validation = await fileHandler.validateFile(args.fileName, args.mimeType, dataSize);
        if (!validation.isValid) {
          throw new UserError(`File validation failed: ${validation.errors.join(', ')}`);
        }

        const uploadRequest: FileUploadRequest = {
          fileName: args.fileName,
          mimeType: args.mimeType,
          data: args.data,
          workflowId: args.workflowId,
          executionId: args.executionId,
          nodeId: args.nodeId,
        };

        const result = await binaryClient.uploadBinaryData(uploadRequest);

        return {
          success: true,
          fileInfo: result,
          message: `Successfully uploaded ${args.fileName} from base64 data`,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to upload from base64: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Download execution binary data
  server.addTool({
    name: 'download-execution-binary',
    description: 'Download binary data from a specific workflow execution output',
    parameters: DownloadExecutionBinarySchema,
    handler: async (args: z.infer<typeof DownloadExecutionBinarySchema>) => {
      try {
        const binaryClient = getBinaryDataClient(getClient);

        // Download binary data from execution
        const fileData = await binaryClient.getExecutionBinaryData(
          args.executionId,
          args.nodeId,
          args.outputIndex,
          args.itemIndex,
          args.propertyName
        );

        // Ensure output directory exists
        const outputDir = path.dirname(args.outputPath);
        await fs.mkdir(outputDir, { recursive: true });

        await fs.writeFile(args.outputPath, fileData);

        return {
          success: true,
          outputPath: args.outputPath,
          fileSize: fileData.length,
          executionId: args.executionId,
          nodeId: args.nodeId,
          message: `Successfully downloaded execution binary data to ${args.outputPath}`,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to download execution binary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Upload workflow binary data
  server.addTool({
    name: 'upload-workflow-binary',
    description: 'Upload binary data for use in a specific workflow',
    parameters: UploadWorkflowBinarySchema,
    handler: async (args: z.infer<typeof UploadWorkflowBinarySchema>) => {
      try {
        const binaryClient = getBinaryDataClient(getClient);
        const fileHandler = getFileHandler();

        // Check if file exists
        try {
          await fs.access(args.filePath);
        } catch {
          throw new UserError(`File not found: ${args.filePath}`);
        }

        // Read file
        const fileData = await fs.readFile(args.filePath);
        const fileName = path.basename(args.filePath);
        const mimeType = args.overrideMimeType || getMimeTypeFromExtension(fileName);

        // Validate file
        const validation = await fileHandler.validateFile(fileName, mimeType, fileData.length);
        if (!validation.isValid) {
          throw new UserError(`File validation failed: ${validation.errors.join(', ')}`);
        }

        // Upload workflow binary data
        const result = await binaryClient.uploadWorkflowBinaryData(
          args.workflowId,
          args.nodeId,
          fileData,
          fileName,
          mimeType,
          args.propertyName
        );

        return {
          success: true,
          fileInfo: result,
          workflowId: args.workflowId,
          nodeId: args.nodeId,
          message: `Successfully uploaded ${fileName} for workflow ${args.workflowId}`,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to upload workflow binary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // List binary data
  server.addTool({
    name: 'list-binary-data',
    description: 'List binary data files stored in n8n',
    parameters: ListBinaryDataSchema,
    handler: async (args: z.infer<typeof ListBinaryDataSchema>) => {
      try {
        const binaryClient = getBinaryDataClient(getClient);

        const files = await binaryClient.listBinaryData({
          workflowId: args.workflowId,
          executionId: args.executionId,
          nodeId: args.nodeId,
          limit: args.limit,
          offset: args.offset,
        });

        return {
          success: true,
          files,
          count: files.length,
          filters: {
            workflowId: args.workflowId,
            executionId: args.executionId,
            nodeId: args.nodeId,
          },
          pagination: {
            limit: args.limit,
            offset: args.offset,
          },
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to list binary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Delete binary data
  server.addTool({
    name: 'delete-binary-data',
    description: 'Delete binary data from n8n storage',
    parameters: DeleteBinaryDataSchema,
    handler: async (args: z.infer<typeof DeleteBinaryDataSchema>) => {
      try {
        const binaryClient = getBinaryDataClient(getClient);

        const result = await binaryClient.deleteBinaryData(args.fileId);

        return {
          success: result.success,
          fileId: args.fileId,
          message: result.message,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to delete binary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Get binary data metadata
  server.addTool({
    name: 'get-binary-metadata',
    description: 'Get metadata for binary data stored in n8n',
    parameters: GetBinaryMetadataSchema,
    handler: async (args: z.infer<typeof GetBinaryMetadataSchema>) => {
      try {
        const binaryClient = getBinaryDataClient(getClient);

        const metadata = await binaryClient.getBinaryDataMetadata(args.fileId);

        return {
          success: true,
          metadata,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to get binary metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Upload large file with progress tracking
  server.addTool({
    name: 'upload-large-file',
    description: 'Upload a large file with progress tracking and chunked transfer',
    parameters: UploadLargeFileSchema,
    handler: async (args: z.infer<typeof UploadLargeFileSchema>) => {
      try {
        const binaryClient = getBinaryDataClient(getClient);
        const fileHandler = getFileHandler();

        // Check if file exists
        try {
          await fs.access(args.filePath);
        } catch {
          throw new UserError(`File not found: ${args.filePath}`);
        }

        // Read file
        const fileData = await fs.readFile(args.filePath);
        const fileName = path.basename(args.filePath);
        const mimeType = getMimeTypeFromExtension(fileName);

        // Validate file
        const validation = await fileHandler.validateFile(fileName, mimeType, fileData.length);
        if (!validation.isValid) {
          throw new UserError(`File validation failed: ${validation.errors.join(', ')}`);
        }

        let progressUpdates: FileTransferProgress[] = [];

        // Upload with progress tracking
        const result = await binaryClient.uploadLargeFile(fileData, fileName, mimeType, {
          workflowId: args.workflowId,
          executionId: args.executionId,
          nodeId: args.nodeId,
          chunkSize: args.chunkSize,
          onProgress: args.showProgress ? (progress) => {
            progressUpdates.push({ ...progress });
          } : undefined,
        });

        return {
          success: true,
          fileInfo: result,
          fileName,
          fileSize: fileData.length,
          chunkSize: args.chunkSize,
          progressUpdates: args.showProgress ? progressUpdates : undefined,
          message: `Successfully uploaded large file ${fileName} (${fileData.length} bytes)`,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to upload large file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });
}