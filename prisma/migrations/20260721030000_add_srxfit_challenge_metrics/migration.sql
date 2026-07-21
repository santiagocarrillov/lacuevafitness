-- AlterEnum
ALTER TYPE "ChallengeRuleType" ADD VALUE 'WEIGHT_LOSS';
ALTER TYPE "ChallengeRuleType" ADD VALUE 'WAIST_LOSS';
ALTER TYPE "ChallengeRuleType" ADD VALUE 'TEST_IMPROVEMENT';

-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN "metricTest" "TestKey";
ALTER TABLE "Challenge" ALTER COLUMN "ruleTarget" DROP NOT NULL;
