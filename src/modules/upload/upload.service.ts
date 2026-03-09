import { Injectable, BadRequestException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as path from 'path';
import * as crypto from 'crypto';

const ALLOWED_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  document: ['application/pdf', 'text/plain'],
  archive: ['application/zip', 'application/x-zip-compressed'],
  any: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
  ],
};

const MAX_SIZE_MB = {
  submission: 20,
  quiz: 10,
  avatar: 5,
  receipt: 10,
};

type UploadFolder = 'submissions' | 'quiz-answers' | 'avatars' | 'receipts';
type AllowedCategory = keyof typeof ALLOWED_TYPES;

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? 'auto',
      endpoint: process.env.AWS_ENDPOINT,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: process.env.AWS_FORCE_PATH_STYLE === 'true',
    });

    this.bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || '';
  }

  private ensureBucket() {
    if (!this.bucket) {
      throw new BadRequestException('S3 bucket is not configured');
    }
  }

  private getMaxBytesByFolder(folder: UploadFolder) {
    if (folder === 'submissions') return MAX_SIZE_MB.submission * 1024 * 1024;
    if (folder === 'quiz-answers') return MAX_SIZE_MB.quiz * 1024 * 1024;
    if (folder === 'avatars') return MAX_SIZE_MB.avatar * 1024 * 1024;
    return MAX_SIZE_MB.receipt * 1024 * 1024;
  }

  private validateMimeType(contentType: string, allowedCategory: AllowedCategory) {
    const allowed = ALLOWED_TYPES[allowedCategory];
    if (!allowed.includes(contentType)) {
      throw new BadRequestException(
        `File type ${contentType} not allowed. Allowed: ${allowed.join(', ')}`,
      );
    }
  }

  private validateSize(folder: UploadFolder, sizeBytes: number) {
    const maxBytes = this.getMaxBytesByFolder(folder);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException('Invalid file size');
    }
    if (sizeBytes > maxBytes) {
      throw new BadRequestException(
        `File too large. Max size: ${Math.round(maxBytes / 1024 / 1024)}MB`,
      );
    }
  }

  private buildFileKey(folder: UploadFolder, fileName: string, userId?: string) {
    const ext = path.extname(fileName).toLowerCase();
    const safeExt = ext || '';
    const id = crypto.randomUUID();

    if (userId) {
      return `${folder}/${userId}/${id}${safeExt}`;
    }

    return `${folder}/${id}${safeExt}`;
  }

  // ✅ NEW PROFESSIONAL FLOW
  // frontend file haqida oldindan aytadi: folder + filename + type + size
  async getPresignedUploadUrl(params: {
    folder: UploadFolder;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    allowedCategory?: AllowedCategory;
    userId?: string;
  }) {
    this.ensureBucket();

    const {
      folder,
      fileName,
      contentType,
      sizeBytes,
      allowedCategory = 'any',
      userId,
    } = params;

    this.validateMimeType(contentType, allowedCategory);
    this.validateSize(folder, sizeBytes);

    const fileKey = this.buildFileKey(folder, fileName, userId);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: 60 * 5,
    });

    return { uploadUrl, fileKey };
  }

  // ✅ OLD FLOW COMPATIBILITY
  // eski frontend uchun: /signed-url
  async generateUploadUrl(
    userId: string,
    filename: string,
    mimeType: string,
  ) {
    this.ensureBucket();

    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'text/plain',
    ];

    if (!allowed.includes(mimeType)) {
      throw new BadRequestException('Invalid file type');
    }

    const fileKey = this.buildFileKey('submissions', filename, userId);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: 60 * 5,
    });

    return { uploadUrl, fileKey };
  }

  // ✅ DOWNLOAD URL
  async getSignedDownloadUrl(fileKey: string, expiresIn = 3600): Promise<string> {
    this.ensureBucket();

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });

    return getSignedUrl(this.s3, command, { expiresIn });
  }

  // ✅ DELETE FILE
  async deleteFile(fileKey: string): Promise<void> {
    this.ensureBucket();

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      }),
    );
  }

  // ✅ object ichida fileKey bo‘lsa fileUrl qo‘shib beradi
  async enrichWithUrl<T extends { fileKey?: string | null }>(
    obj: T,
  ): Promise<T & { fileUrl?: string }> {
    if (!obj.fileKey) return obj;
    const fileUrl = await this.getSignedDownloadUrl(obj.fileKey);
    return { ...obj, fileUrl };
  }
}