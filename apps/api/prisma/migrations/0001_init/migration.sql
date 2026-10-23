-- CreateEnum
CREATE TYPE "BaseModel" AS ENUM ('SDXL', 'FLUX1_DEV');

-- CreateEnum
CREATE TYPE "LoraType" AS ENUM ('CHARACTER', 'STYLE', 'OBJECT');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'READY', 'TRAINING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'preprocessing', 'training', 'succeeded', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('lora', 'sample', 'config', 'dataset_zip');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseModel" "BaseModel" NOT NULL,
    "loraType" "LoraType" NOT NULL,
    "triggerWord" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TrainingProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetImage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "phash" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "cropBox" JSONB,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" TEXT,
    "safetyFlagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "loss" DOUBLE PRECISION,
    "providerJobId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "consentConfirmedAt" TIMESTAMP(3) NOT NULL,
    "consentStatement" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingArtifact" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "ArtifactType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "TrainingProject_userId_idx" ON "TrainingProject"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetImage_storageKey_key" ON "DatasetImage"("storageKey");

-- CreateIndex
CREATE INDEX "DatasetImage_projectId_idx" ON "DatasetImage"("projectId");

-- CreateIndex
CREATE INDEX "DatasetImage_phash_idx" ON "DatasetImage"("phash");

-- CreateIndex
CREATE INDEX "TrainingJob_projectId_idx" ON "TrainingJob"("projectId");

-- CreateIndex
CREATE INDEX "TrainingJob_status_idx" ON "TrainingJob"("status");

-- CreateIndex
CREATE INDEX "TrainingArtifact_jobId_idx" ON "TrainingArtifact"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_jobId_idx" ON "WebhookEvent"("jobId");

-- AddForeignKey
ALTER TABLE "TrainingProject" ADD CONSTRAINT "TrainingProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetImage" ADD CONSTRAINT "DatasetImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "TrainingProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingJob" ADD CONSTRAINT "TrainingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "TrainingProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingArtifact" ADD CONSTRAINT "TrainingArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TrainingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TrainingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

