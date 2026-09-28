-- Tareas v2: responsable, estado, subtareas, socio, enlaces y actividad.
-- Aditiva: columnas nullable/con default, DROP NOT NULL, 2 tablas nuevas.
-- Las 16 tareas de PR #97 quedan en la bolsa de su sede (sin responsable).

-- CreateEnum
CREATE TYPE "StaffTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "StaffTaskType" AS ENUM ('TASK', 'CALL', 'WHATSAPP', 'COLLECTION', 'PAPERWORK');

-- CreateEnum
CREATE TYPE "StaffTaskEntryKind" AS ENUM ('COMMENT', 'EVENT');

-- DropIndex (reemplazado por los índices de estado de abajo)
DROP INDEX "StaffTask_sede_doneAt_dueDate_idx";

-- AlterTable
ALTER TABLE "StaffTask" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "dueMinutes" INTEGER,
ADD COLUMN     "memberId" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "status" "StaffTaskStatus" NOT NULL DEFAULT 'TODO',
ADD COLUMN     "type" "StaffTaskType" NOT NULL DEFAULT 'TASK',
ALTER COLUMN "dueDate" DROP NOT NULL;

-- CreateTable
CREATE TABLE "StaffTaskLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffTaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffTaskEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "StaffTaskEntryKind" NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffTaskEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffTaskLink_taskId_idx" ON "StaffTaskLink"("taskId");

-- CreateIndex
CREATE INDEX "StaffTaskEntry_taskId_createdAt_idx" ON "StaffTaskEntry"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffTask_assigneeId_status_idx" ON "StaffTask"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "StaffTask_sede_status_dueDate_idx" ON "StaffTask"("sede", "status", "dueDate");

-- CreateIndex
CREATE INDEX "StaffTask_createdById_idx" ON "StaffTask"("createdById");

-- CreateIndex
CREATE INDEX "StaffTask_parentId_idx" ON "StaffTask"("parentId");

-- CreateIndex
CREATE INDEX "StaffTask_memberId_idx" ON "StaffTask"("memberId");

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StaffTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTaskLink" ADD CONSTRAINT "StaffTaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "StaffTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTaskLink" ADD CONSTRAINT "StaffTaskLink_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTaskEntry" ADD CONSTRAINT "StaffTaskEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "StaffTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTaskEntry" ADD CONSTRAINT "StaffTaskEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Las cerradas antes de esta migración pasan a DONE.
UPDATE "StaffTask" SET "status" = 'DONE' WHERE "doneAt" IS NOT NULL;

-- Una tarea apunta a una sola persona: lead o socio, no los dos.
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_one_person"
  CHECK ("leadId" IS NULL OR "memberId" IS NULL);

-- Subtareas de un solo nivel: una tarea no es su propia madre.
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_not_own_parent"
  CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- La hora del día cabe en un día.
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_dueMinutes_range"
  CHECK ("dueMinutes" IS NULL OR ("dueMinutes" >= 0 AND "dueMinutes" < 1440));

-- RLS como el resto de tablas del staff: activado, sin políticas (solo Prisma).
ALTER TABLE "StaffTaskLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffTaskEntry" ENABLE ROW LEVEL SECURITY;
