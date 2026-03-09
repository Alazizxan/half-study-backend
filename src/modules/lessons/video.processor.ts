import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';

export interface VideoJob {
  lessonId: string;
  tempPath: string;
}

const VIDEO_DIR = () => process.env.VIDEO_OUTPUT_DIR ?? '/var/www/secure-videos';

@Processor('video')
export class VideoProcessor {
  private readonly logger = new Logger(VideoProcessor.name);
  constructor(private prisma: PrismaService) {}

  @Process('encode')
  async encode(job: Job<VideoJob>) {
    const { lessonId, tempPath } = job.data;

    const videoKey   = `lesson-${lessonId}`;
    const outputDir  = path.join(VIDEO_DIR(), videoKey);
    const outputM3u8 = path.join(outputDir, 'index.m3u8');

    try {
      fs.mkdirSync(outputDir, { recursive: true });
      await job.progress(5);

      // 720p HLS — bitta sifat, har qanday format kiradi
      const cmd = [
        'ffmpeg -y',
        `-i "${tempPath}"`,
        '-vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"',
        '-c:v libx264 -preset fast -crf 23',
        '-c:a aac -b:a 128k',
        '-hls_time 10',
        '-hls_list_size 0',
        '-hls_segment_type mpegts',
        `-hls_segment_filename "${outputDir}/seg%03d.ts"`,
        '-f hls',
        `"${outputM3u8}"`,
      ].join(' ');

      await new Promise<void>((resolve, reject) => {
        exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, _out, stderr) => {
          if (err) { this.logger.error(stderr); reject(err); }
          else resolve();
        });
      });

      await job.progress(90);

      await this.prisma.lesson.update({
        where: { id: lessonId },
        data:  { videoKey, videoStatus: 'READY' },
      });

      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      await job.progress(100);
      this.logger.log(`✓ Encoded: ${lessonId}`);
    } catch (err) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      await this.prisma.lesson.update({
        where: { id: lessonId },
        data:  { videoStatus: 'ERROR' },
      });
      throw err;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<VideoJob>, err: Error) {
    this.logger.error(`Job ${job.id} failed [${job.data.lessonId}]: ${err.message}`);
  }
}