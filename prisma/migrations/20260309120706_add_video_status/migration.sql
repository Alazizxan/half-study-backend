-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('NONE', 'PROCESSING', 'READY', 'ERROR');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "videoStatus" "VideoStatus" NOT NULL DEFAULT 'NONE';
