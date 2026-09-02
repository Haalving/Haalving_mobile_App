-- AlterTable
ALTER TABLE "circle_messages" ADD COLUMN     "mealId" TEXT;

-- AddForeignKey
ALTER TABLE "circle_messages" ADD CONSTRAINT "circle_messages_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

