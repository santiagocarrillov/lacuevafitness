-- Tareas del día para la recepción (arriba del Resumen).
-- Aditiva: 1 tabla nueva.

-- CreateTable
CREATE TABLE "StaffTask" (
    "id" TEXT NOT NULL,
    "sede" "Sede",
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "leadId" TEXT,
    "dueDate" DATE NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "doneByUserId" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffTask_sede_doneAt_dueDate_idx" ON "StaffTask"("sede", "doneAt", "dueDate");

-- CreateIndex
CREATE INDEX "StaffTask_leadId_idx" ON "StaffTask"("leadId");

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_doneByUserId_fkey" FOREIGN KEY ("doneByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
