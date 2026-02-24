import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import {
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3 } from '../../common/config/s3.config';
import * as crypto from 'crypto';



@Injectable()
export class UploadService {
  async generateUploadUrl(
    userId: string,
    filename: string,
    mimeType: string,
  ) {
    const allowed = [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'application/zip',
    ];

    if (!allowed.includes(mimeType))
      throw new BadRequestException('Invalid file type');

    const key = `submissions/${userId}/${crypto.randomUUID()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: mimeType,
    });

    const url = await getSignedUrl(s3, command, {
      expiresIn: 60 * 5, // 5 min
    });

    return { uploadUrl: url, fileKey: key };
  }
}