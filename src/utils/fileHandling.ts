import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  FileUploadRequest,
  StaticFileInfo,
  FileStorageConfig,
  FileTransferProgress,
  FileOperationResult,
  FileValidationOptions,
  FileValidationResult,
  FileCleanupResult,
  WorkflowFileManifest,
  FileSearchOptions,
} from '../types/fileTypes.js';

export class FileHandlingUtils extends EventEmitter {
  private config: FileStorageConfig;
  private activeTransfers: Map<string, FileTransferProgress> = new Map();

  constructor(config: Partial<FileStorageConfig> = {}) {
    super();
    this.config = {
      baseDirectory: config.baseDirectory || './data/files',
      maxFileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB default
      allowedMimeTypes: config.allowedMimeTypes || [
        'image/*',
        'text/*',
        'application/json',
        'application/pdf',
        'application/zip',
        'application/x-zip-compressed',
        'application/octet-stream',
      ],
      cleanupOlderThan: config.cleanupOlderThan || 30, // 30 days
    };

    this.ensureDirectoryExists();
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.access(this.config.baseDirectory);
    } catch {
      await fs.mkdir(this.config.baseDirectory, { recursive: true });
    }
  }

  /**
   * Generate a unique file ID
   */
  private generateFileId(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate transfer ID for progress tracking
   */
  private generateTransferId(): string {
    return `transfer_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Get file path from file ID
   */
  private getFilePath(fileId: string): string {
    return path.join(this.config.baseDirectory, `${fileId}.data`);
  }

  /**
   * Get metadata file path from file ID
   */
  private getMetadataPath(fileId: string): string {
    return path.join(this.config.baseDirectory, `${fileId}.meta.json`);
  }

  /**
   * Validate file before upload
   */
  async validateFile(
    fileName: string,
    mimeType: string,
    fileSize: number,
    options: FileValidationOptions = {}
  ): Promise<FileValidationResult> {
    const result: FileValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    const maxSize = options.maxFileSize || this.config.maxFileSize;
    const allowedTypes = options.allowedMimeTypes || this.config.allowedMimeTypes;

    // Check file size
    if (fileSize > maxSize) {
      result.isValid = false;
      result.errors.push(
        `File size ${fileSize} bytes exceeds maximum allowed size ${maxSize} bytes`
      );
    }

    // Check MIME type
    const isMimeTypeAllowed = allowedTypes.some(allowed => {
      if (allowed.endsWith('/*')) {
        const prefix = allowed.slice(0, -2);
        return mimeType.startsWith(prefix);
      }
      return allowed === mimeType;
    });

    if (!isMimeTypeAllowed) {
      result.isValid = false;
      result.errors.push(`MIME type ${mimeType} is not allowed`);
    }

    // Check file extension if specified
    if (options.allowedExtensions) {
      const fileExtension = path.extname(fileName).toLowerCase();
      if (!options.allowedExtensions.includes(fileExtension)) {
        result.isValid = false;
        result.errors.push(`File extension ${fileExtension} is not allowed`);
      }
    }

    // Validate file name
    if (!fileName || fileName.trim().length === 0) {
      result.isValid = false;
      result.errors.push('File name is required');
    }

    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      result.isValid = false;
      result.errors.push('File name contains invalid characters');
    }

    return result;
  }

  /**
   * Upload a file from base64 data
   */
  async uploadFile(request: FileUploadRequest): Promise<FileOperationResult> {
    const transferId = this.generateTransferId();

    try {
      // Decode base64 to get actual file size
      const buffer = Buffer.from(request.data, 'base64');
      const actualFileSize = buffer.length;

      // Validate file
      const validation = await this.validateFile(
        request.fileName,
        request.mimeType,
        actualFileSize
      );

      if (!validation.isValid) {
        return {
          success: false,
          message: `File validation failed: ${validation.errors.join(', ')}`,
          transferId,
        };
      }

      const fileId = this.generateFileId();
      const filePath = this.getFilePath(fileId);
      const metadataPath = this.getMetadataPath(fileId);

      // Initialize transfer progress
      const progress: FileTransferProgress = {
        transferId,
        fileName: request.fileName,
        totalBytes: actualFileSize,
        transferredBytes: 0,
        percentComplete: 0,
        status: 'in-progress',
        startedAt: new Date().toISOString(),
      };

      this.activeTransfers.set(transferId, progress);
      this.emit('transferStarted', progress);

      // Write file data
      await fs.writeFile(filePath, buffer);

      // Create metadata
      const metadata: StaticFileInfo = {
        id: fileId,
        fileName: request.fileName,
        mimeType: request.mimeType,
        fileSize: actualFileSize,
        uploadedAt: new Date().toISOString(),
        workflowId: request.workflowId,
        executionId: request.executionId,
        nodeId: request.nodeId,
        filePath,
      };

      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      // Update progress
      progress.transferredBytes = actualFileSize;
      progress.percentComplete = 100;
      progress.status = 'completed';
      progress.completedAt = new Date().toISOString();

      this.emit('transferCompleted', progress);
      this.activeTransfers.delete(transferId);

      return {
        success: true,
        fileId,
        fileName: request.fileName,
        message: `File uploaded successfully`,
        fileSize: actualFileSize,
        transferId,
      };
    } catch (error) {
      const progress = this.activeTransfers.get(transferId);
      if (progress) {
        progress.status = 'failed';
        progress.error = error instanceof Error ? error.message : 'Unknown error';
        progress.completedAt = new Date().toISOString();
        this.emit('transferFailed', progress);
        this.activeTransfers.delete(transferId);
      }

      return {
        success: false,
        message: `File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        transferId,
      };
    }
  }

  /**
   * Download a file as base64 data
   */
  async downloadFile(
    fileId: string
  ): Promise<FileOperationResult & { data?: string; metadata?: StaticFileInfo }> {
    const transferId = this.generateTransferId();

    try {
      const filePath = this.getFilePath(fileId);
      const metadataPath = this.getMetadataPath(fileId);

      // Check if file exists
      try {
        await fs.access(filePath);
        await fs.access(metadataPath);
      } catch {
        return {
          success: false,
          message: `File with ID ${fileId} not found`,
          transferId,
        };
      }

      // Read metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: StaticFileInfo = JSON.parse(metadataContent);

      // Initialize transfer progress
      const progress: FileTransferProgress = {
        transferId,
        fileName: metadata.fileName,
        totalBytes: metadata.fileSize,
        transferredBytes: 0,
        percentComplete: 0,
        status: 'in-progress',
        startedAt: new Date().toISOString(),
      };

      this.activeTransfers.set(transferId, progress);
      this.emit('transferStarted', progress);

      // Read file data
      const buffer = await fs.readFile(filePath);
      const base64Data = buffer.toString('base64');

      // Update progress
      progress.transferredBytes = metadata.fileSize;
      progress.percentComplete = 100;
      progress.status = 'completed';
      progress.completedAt = new Date().toISOString();

      this.emit('transferCompleted', progress);
      this.activeTransfers.delete(transferId);

      return {
        success: true,
        fileId,
        fileName: metadata.fileName,
        message: `File downloaded successfully`,
        fileSize: metadata.fileSize,
        transferId,
        data: base64Data,
        metadata,
      };
    } catch (error) {
      const progress = this.activeTransfers.get(transferId);
      if (progress) {
        progress.status = 'failed';
        progress.error = error instanceof Error ? error.message : 'Unknown error';
        progress.completedAt = new Date().toISOString();
        this.emit('transferFailed', progress);
        this.activeTransfers.delete(transferId);
      }

      return {
        success: false,
        message: `File download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        transferId,
      };
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: string): Promise<FileOperationResult> {
    try {
      const filePath = this.getFilePath(fileId);
      const metadataPath = this.getMetadataPath(fileId);

      // Check if file exists and get metadata
      let metadata: StaticFileInfo | null = null;
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        metadata = JSON.parse(metadataContent);
      } catch {
        return {
          success: false,
          message: `File with ID ${fileId} not found`,
        };
      }

      // Delete files
      await Promise.all([
        fs.unlink(filePath).catch(() => {}), // Ignore errors if file doesn't exist
        fs.unlink(metadataPath).catch(() => {}),
      ]);

      return {
        success: true,
        fileId,
        fileName: metadata?.fileName || 'Unknown',
        message: `File deleted successfully`,
      };
    } catch (error) {
      return {
        success: false,
        message: `File deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * List files based on search criteria
   */
  async listFiles(options: FileSearchOptions = {}): Promise<StaticFileInfo[]> {
    try {
      const files = await fs.readdir(this.config.baseDirectory);
      const metadataFiles = files.filter(file => file.endsWith('.meta.json'));

      const fileInfos: StaticFileInfo[] = [];

      for (const metaFile of metadataFiles) {
        try {
          const metadataPath = path.join(this.config.baseDirectory, metaFile);
          const content = await fs.readFile(metadataPath, 'utf-8');
          const metadata: StaticFileInfo = JSON.parse(content);

          // Apply filters
          if (
            options.fileName &&
            !metadata.fileName.toLowerCase().includes(options.fileName.toLowerCase())
          ) {
            continue;
          }

          if (options.mimeType && metadata.mimeType !== options.mimeType) {
            continue;
          }

          if (options.workflowId && metadata.workflowId !== options.workflowId) {
            continue;
          }

          if (options.executionId && metadata.executionId !== options.executionId) {
            continue;
          }

          if (options.nodeId && metadata.nodeId !== options.nodeId) {
            continue;
          }

          if (
            options.uploadedAfter &&
            new Date(metadata.uploadedAt) < new Date(options.uploadedAfter)
          ) {
            continue;
          }

          if (
            options.uploadedBefore &&
            new Date(metadata.uploadedAt) > new Date(options.uploadedBefore)
          ) {
            continue;
          }

          if (options.minFileSize && metadata.fileSize < options.minFileSize) {
            continue;
          }

          if (options.maxFileSize && metadata.fileSize > options.maxFileSize) {
            continue;
          }

          fileInfos.push(metadata);
        } catch {
          // Skip invalid metadata files
          continue;
        }
      }

      // Sort by upload date (newest first)
      fileInfos.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

      // Apply pagination
      if (options.offset || options.limit) {
        const start = options.offset || 0;
        const end = options.limit ? start + options.limit : undefined;
        return fileInfos.slice(start, end);
      }

      return fileInfos;
    } catch (error) {
      throw new Error(
        `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileId: string): Promise<StaticFileInfo | null> {
    try {
      const metadataPath = this.getMetadataPath(fileId);
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Get workflow file manifest
   */
  async getWorkflowFileManifest(workflowId: string): Promise<WorkflowFileManifest> {
    const files = await this.listFiles({ workflowId });
    const totalSize = files.reduce((sum, file) => sum + file.fileSize, 0);

    return {
      workflowId,
      workflowName: workflowId, // Could be enhanced to get actual workflow name
      files,
      totalSize,
      fileCount: files.length,
      lastUpdated: files.length > 0 ? files[0].uploadedAt : new Date().toISOString(),
    };
  }

  /**
   * Cleanup old files
   */
  async cleanupOldFiles(olderThanDays?: number): Promise<FileCleanupResult> {
    const cleanupDate = new Date();
    cleanupDate.setDate(
      cleanupDate.getDate() - (olderThanDays || this.config.cleanupOlderThan || 30)
    );

    const allFiles = await this.listFiles();
    const filesToDelete = allFiles.filter(file => new Date(file.uploadedAt) < cleanupDate);

    let deletedFiles = 0;
    let freedSpace = 0;
    const errors: string[] = [];

    for (const file of filesToDelete) {
      try {
        const result = await this.deleteFile(file.id);
        if (result.success) {
          deletedFiles++;
          freedSpace += file.fileSize;
        } else {
          errors.push(`Failed to delete ${file.fileName}: ${result.message}`);
        }
      } catch (error) {
        errors.push(
          `Error deleting ${file.fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return {
      deletedFiles,
      freedSpace,
      errors,
    };
  }

  /**
   * Get transfer progress
   */
  getTransferProgress(transferId: string): FileTransferProgress | null {
    return this.activeTransfers.get(transferId) || null;
  }

  /**
   * Get all active transfers
   */
  getActiveTransfers(): FileTransferProgress[] {
    return Array.from(this.activeTransfers.values());
  }

  /**
   * Cancel an active transfer
   */
  cancelTransfer(transferId: string): boolean {
    const transfer = this.activeTransfers.get(transferId);
    if (transfer && transfer.status === 'in-progress') {
      transfer.status = 'cancelled';
      transfer.completedAt = new Date().toISOString();
      this.emit('transferCancelled', transfer);
      this.activeTransfers.delete(transferId);
      return true;
    }
    return false;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    averageFileSize: number;
    oldestFile: string | null;
    newestFile: string | null;
  }> {
    const files = await this.listFiles();

    if (files.length === 0) {
      return {
        totalFiles: 0,
        totalSize: 0,
        averageFileSize: 0,
        oldestFile: null,
        newestFile: null,
      };
    }

    const totalSize = files.reduce((sum, file) => sum + file.fileSize, 0);
    const sortedByDate = [...files].sort(
      (a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
    );

    return {
      totalFiles: files.length,
      totalSize,
      averageFileSize: totalSize / files.length,
      oldestFile: sortedByDate[0].uploadedAt,
      newestFile: sortedByDate[sortedByDate.length - 1].uploadedAt,
    };
  }
}
