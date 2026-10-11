-- Same as the StaffTask tables: no policies, so the table is closed to the
-- Supabase API roles; the app reads it through Prisma on the server.
ALTER TABLE "MainSetLog" ENABLE ROW LEVEL SECURITY;
