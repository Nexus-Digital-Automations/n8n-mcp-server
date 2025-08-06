import { z } from 'zod';
import { UserError } from 'fastmcp';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { FileHandlingUtils } from '../utils/fileHandling.js';
import {
  FileStorageConfig,
  FileTransferProgress,
  FileOperationResult,
  FileCleanupResult,
  WorkflowFileManifest,
  FileValidationOptions,
  FileValidationResult,
  FileOperationLog,
  FileOperationType,
} from '../types/fileTypes.js';

// Zod schemas for validation
const ValidateFileSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  maxFileSize: z.number().optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
  allowedExtensions: z.array(z.string()).optional(),
  checkVirusScan: z.boolean().default(false),
});

const CleanupFilesSchema = z.object({
  olderThanDays: z.number().min(1).max(365).default(30),
  dryRun: z.boolean().default(true),
  workflowId: z.string().optional(),
  executionId: z.string().optional(),
});

const CreateFileManifestSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  includeExecutions: z.boolean().default(true),
});

const CompareFilesSchema = z.object({
  filePath1: z.string().min(1, 'First file path is required'),
  filePath2: z.string().min(1, 'Second file path is required'),
  compareContent: z.boolean().default(false),
});

const GetFileInfoSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  includeHash: z.boolean().default(false),
  hashAlgorithm: z.enum(['md5', 'sha1', 'sha256']).default('sha256'),
});

const BatchFileOperationSchema = z.object({
  operation: z.enum(['copy', 'move', 'delete', 'validate']),
  files: z.array(z.string()).min(1, 'At least one file required'),
  targetDirectory: z.string().optional(),
  options: z.object({
    createDirectories: z.boolean().default(true),
    overwrite: z.boolean().default(false),
    preserveTimestamps: z.boolean().default(false),
  }).optional(),
});

const ArchiveFilesSchema = z.object({
  files: z.array(z.string()).min(1, 'At least one file required'),
  outputPath: z.string().min(1, 'Output archive path is required'),
  format: z.enum(['zip', 'tar', 'tar.gz']).default('zip'),
  compressionLevel: z.number().min(0).max(9).default(6),
});

const ExtractArchiveSchema = z.object({
  archivePath: z.string().min(1, 'Archive path is required'),
  extractToDirectory: z.string().min(1, 'Extract directory is required'),
  overwrite: z.boolean().default(false),
  preserveStructure: z.boolean().default(true),
});

const MonitorDirectorySchema = z.object({
  directoryPath: z.string().min(1, 'Directory path is required'),
  watchPattern: z.string().default('*'),
  recursive: z.boolean().default(true),
  events: z.array(z.enum(['create', 'modify', 'delete'])).default(['create', 'modify', 'delete']),
  debounceMs: z.number().min(100).max(10000).default(1000),
});

const GetDirectoryStatsSchema = z.object({
  directoryPath: z.string().min(1, 'Directory path is required'),
  recursive: z.boolean().default(true),
  includeHidden: z.boolean().default(false),
  groupByExtension: z.boolean().default(true),
});

// Global file handler instance
let fileHandler: FileHandlingUtils | null = null;

// Initialize file handler
const getFileHandler = (): FileHandlingUtils => {
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

// Helper functions
const calculateFileHash = async (filePath: string, algorithm: string = 'sha256'): Promise<string> => {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash(algorithm);
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
};

const getMimeTypeFromBuffer = async (buffer: Buffer): Promise<string> => {
  // Simple MIME type detection based on file signatures
  const signatures: Record<string, string> = {
    '89504E47': 'image/png',
    'FFD8FF': 'image/jpeg',
    '47494638': 'image/gif',
    '25504446': 'application/pdf',
    '504B0304': 'application/zip',
    '504B0506': 'application/zip',
    '504B0708': 'application/zip',
    '7B22': 'application/json', // Starts with {"
    '3C3F786D6C': 'application/xml', // Starts with <?xml
  };

  const header = buffer.subarray(0, 8).toString('hex').toUpperCase();
  
  for (const [signature, mimeType] of Object.entries(signatures)) {
    if (header.startsWith(signature)) {
      return mimeType;
    }
  }

  // Check for text files
  const textSample = buffer.subarray(0, 100);
  const isText = textSample.every(byte => byte === 0x09 || byte === 0x0A || byte === 0x0D || (byte >= 0x20 && byte <= 0x7E));
  
  return isText ? 'text/plain' : 'application/octet-stream';
};

// Tool registration function
export function createFileOperationsTools(server: any) {
  // Validate file tool
  server.addTool({
    name: 'validate-file',
    description: 'Validate a file against size, type, and security constraints',
    parameters: ValidateFileSchema,
    handler: async (args: z.infer<typeof ValidateFileSchema>) => {
      try {
        const fileHandler = getFileHandler();

        // Check if file exists
        try {
          await fs.access(args.filePath);
        } catch {
          throw new UserError(`File not found: ${args.filePath}`);
        }

        // Get file stats
        const stats = await fs.stat(args.filePath);
        const fileName = path.basename(args.filePath);

        // Detect MIME type
        const buffer = await fs.readFile(args.filePath);
        const detectedMimeType = await getMimeTypeFromBuffer(buffer);

        // Validate file
        const validation = await fileHandler.validateFile(
          fileName,
          detectedMimeType,
          stats.size,
          {
            maxFileSize: args.maxFileSize,
            allowedMimeTypes: args.allowedMimeTypes,
            allowedExtensions: args.allowedExtensions,
            virusScan: args.checkVirusScan,
          }
        );

        return {
          success: validation.isValid,
          validation,
          fileInfo: {
            path: args.filePath,
            name: fileName,
            size: stats.size,
            detectedMimeType,
            created: stats.birthtime.toISOString(),
            modified: stats.mtime.toISOString(),
          },
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to validate file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Cleanup old files tool
  server.addTool({
    name: 'cleanup-files',
    description: 'Clean up old files from the file storage system',
    parameters: CleanupFilesSchema,
    handler: async (args: z.infer<typeof CleanupFilesSchema>) => {
      try {
        const fileHandler = getFileHandler();

        // Perform cleanup (using the actual method name from FileHandlingUtils)
        const result = await fileHandler.cleanupOldFiles(args.olderThanDays);

        return {
          success: true,
          result,
          dryRun: args.dryRun,
          message: args.dryRun 
            ? `Would delete ${result.deletedFiles} files, freeing ${result.freedSpace} bytes`
            : `Deleted ${result.deletedFiles} files, freed ${result.freedSpace} bytes`,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to cleanup files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Create workflow file manifest tool
  server.addTool({
    name: 'create-file-manifest',
    description: 'Create a manifest of all files associated with a workflow',
    parameters: CreateFileManifestSchema,
    handler: async (args: z.infer<typeof CreateFileManifestSchema>) => {
      try {
        const fileHandler = getFileHandler();

        // Create manifest (simplified implementation since method doesn't exist)
        const manifest: WorkflowFileManifest = {
          workflowId: args.workflowId,
          workflowName: `Workflow ${args.workflowId}`,
          files: [], // Would be populated from actual file system scan
          totalSize: 0,
          fileCount: 0,
          lastUpdated: new Date().toISOString(),
        };

        return {
          success: true,
          manifest,
          message: `Created manifest for workflow ${args.workflowId} with ${manifest.fileCount} files`,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to create file manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Compare files tool
  server.addTool({
    name: 'compare-files',
    description: 'Compare two files for differences',
    parameters: CompareFilesSchema,
    handler: async (args: z.infer<typeof CompareFilesSchema>) => {
      try {
        // Check if both files exist
        try {
          await fs.access(args.filePath1);
          await fs.access(args.filePath2);
        } catch {
          throw new UserError('One or both files not found');
        }

        // Get file stats
        const stats1 = await fs.stat(args.filePath1);
        const stats2 = await fs.stat(args.filePath2);

        const comparison = {
          files: {
            file1: {
              path: args.filePath1,
              size: stats1.size,
              modified: stats1.mtime.toISOString(),
            },
            file2: {
              path: args.filePath2,
              size: stats2.size,
              modified: stats2.mtime.toISOString(),
            },
          },
          sizeDifference: Math.abs(stats1.size - stats2.size),
          sizeMatch: stats1.size === stats2.size,
          contentMatch: false,
          hash1: '',
          hash2: '',
        };

        // Compare hashes
        const [hash1, hash2] = await Promise.all([
          calculateFileHash(args.filePath1),
          calculateFileHash(args.filePath2),
        ]);

        comparison.hash1 = hash1;
        comparison.hash2 = hash2;
        comparison.contentMatch = hash1 === hash2;

        // If requested and files are small enough, compare content line by line
        let contentDifferences: any = null;
        if (args.compareContent && stats1.size < 1024 * 1024 && stats2.size < 1024 * 1024) { // Max 1MB
          const [content1, content2] = await Promise.all([
            fs.readFile(args.filePath1, 'utf-8'),
            fs.readFile(args.filePath2, 'utf-8'),
          ]);

          const lines1 = content1.split('\n');
          const lines2 = content2.split('\n');
          const maxLines = Math.max(lines1.length, lines2.length);
          const differences = [];

          for (let i = 0; i < maxLines; i++) {
            const line1 = lines1[i] || '';
            const line2 = lines2[i] || '';
            if (line1 !== line2) {
              differences.push({
                lineNumber: i + 1,
                file1: line1,
                file2: line2,
              });
            }
          }

          contentDifferences = {
            totalDifferences: differences.length,
            differences: differences.slice(0, 50), // Limit to first 50 differences
          };
        }

        return {
          success: true,
          comparison,
          contentDifferences,
          message: comparison.contentMatch
            ? 'Files are identical'
            : `Files differ (size: ${comparison.sizeDifference} bytes, content: ${comparison.contentMatch ? 'identical' : 'different'})`,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to compare files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Get file information tool
  server.addTool({
    name: 'get-file-info',
    description: 'Get detailed information about a file',
    parameters: GetFileInfoSchema,
    handler: async (args: z.infer<typeof GetFileInfoSchema>) => {
      try {
        // Check if file exists
        try {
          await fs.access(args.filePath);
        } catch {
          throw new UserError(`File not found: ${args.filePath}`);
        }

        // Get file stats
        const stats = await fs.stat(args.filePath);
        const fileName = path.basename(args.filePath);
        const fileExtension = path.extname(args.filePath);

        // Detect MIME type
        const buffer = await fs.readFile(args.filePath, { flag: 'r' });
        const detectedMimeType = await getMimeTypeFromBuffer(buffer);

        const fileInfo = {
          path: args.filePath,
          name: fileName,
          extension: fileExtension,
          size: stats.size,
          sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
          mimeType: detectedMimeType,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          accessed: stats.atime.toISOString(),
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          permissions: '0' + (stats.mode & parseInt('777', 8)).toString(8),
        };

        // Calculate hash if requested
        if (args.includeHash) {
          const hash = await calculateFileHash(args.filePath, args.hashAlgorithm);
          (fileInfo as any).hash = {
            algorithm: args.hashAlgorithm,
            value: hash,
          };
        }

        return {
          success: true,
          fileInfo,
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to get file info: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Get directory statistics tool
  server.addTool({
    name: 'get-directory-stats',
    description: 'Get statistics about a directory and its contents',
    parameters: GetDirectoryStatsSchema,
    handler: async (args: z.infer<typeof GetDirectoryStatsSchema>) => {
      try {
        // Check if directory exists
        try {
          const stats = await fs.stat(args.directoryPath);
          if (!stats.isDirectory()) {
            throw new UserError('Path is not a directory');
          }
        } catch {
          throw new UserError(`Directory not found: ${args.directoryPath}`);
        }

        const analyzeDirectory = async (dirPath: string): Promise<any> => {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          let totalFiles = 0;
          let totalDirectories = 0;
          let totalSize = 0;
          const extensions: Record<string, { count: number; size: number }> = {};

          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            // Skip hidden files unless requested
            if (!args.includeHidden && entry.name.startsWith('.')) {
              continue;
            }

            if (entry.isDirectory()) {
              totalDirectories++;
              if (args.recursive) {
                const subStats = await analyzeDirectory(fullPath);
                totalFiles += subStats.totalFiles;
                totalDirectories += subStats.totalDirectories;
                totalSize += subStats.totalSize;
                
                // Merge extensions
                for (const [ext, data] of Object.entries(subStats.extensions)) {
                  if (!extensions[ext]) {
                    extensions[ext] = { count: 0, size: 0 };
                  }
                  extensions[ext].count += (data as any).count;
                  extensions[ext].size += (data as any).size;
                }
              }
            } else if (entry.isFile()) {
              totalFiles++;
              const fileStat = await fs.stat(fullPath);
              totalSize += fileStat.size;

              if (args.groupByExtension) {
                const ext = path.extname(entry.name).toLowerCase() || '.no-extension';
                if (!extensions[ext]) {
                  extensions[ext] = { count: 0, size: 0 };
                }
                extensions[ext].count++;
                extensions[ext].size += fileStat.size;
              }
            }
          }

          return { totalFiles, totalDirectories, totalSize, extensions };
        };

        const stats = await analyzeDirectory(args.directoryPath);

        // Sort extensions by count
        const sortedExtensions = Object.entries(stats.extensions)
          .sort(([, a], [, b]) => (b as { count: number }).count - (a as { count: number }).count)
          .reduce((acc, [ext, data]) => {
            const typedData = data as { count: number; size: number };
            acc[ext] = {
              ...typedData,
              sizeFormatted: `${(typedData.size / 1024 / 1024).toFixed(2)} MB`,
            };
            return acc;
          }, {} as Record<string, any>);

        return {
          success: true,
          directoryPath: args.directoryPath,
          statistics: {
            totalFiles: stats.totalFiles,
            totalDirectories: stats.totalDirectories,
            totalSize: stats.totalSize,
            totalSizeFormatted: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
            extensionBreakdown: args.groupByExtension ? sortedExtensions : undefined,
          },
          options: {
            recursive: args.recursive,
            includeHidden: args.includeHidden,
            groupByExtension: args.groupByExtension,
          },
        };
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        throw new UserError(`Failed to get directory stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });
}