-- Tareas v3: recurrentes, automáticas (autoKey) y seguidores.
-- Aditiva: 2 columnas nullable, 1 enum, 1 tabla nueva.

-- CreateEnum
CREATE TYPE "StaffTaskRepeat" AS ENUM ('DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "StaffTask" ADD COLUMN     "autoKey" TEXT,
ADD COLUMN     "repeat" "StaffTaskRepeat";

-- CreateTable
CREATE TABLE "StaffTaskWatcher" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffTaskWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffTaskWatcher_userId_idx" ON "StaffTaskWatcher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffTaskWatcher_taskId_userId_key" ON "StaffTaskWatcher"("taskId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffTask_autoKey_key" ON "StaffTask"("autoKey");

-- AddForeignKey
ALTER TABLE "StaffTaskWatcher" ADD CONSTRAINT "StaffTaskWatcher_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "StaffTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTaskWatcher" ADD CONSTRAINT "StaffTaskWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS como el resto de tablas del staff: activado, sin políticas (solo Prisma).
ALTER TABLE "StaffTaskWatcher" ENABLE ROW LEVEL SECURITY;
