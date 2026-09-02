-- Money moves from DOUBLE PRECISION pesos to INTEGER centavos.
--
-- Every USING clause multiplies by 100 so existing rows keep their real value:
-- an adminFee of 60.0 (₱60.00) becomes 6000 centavos, not 60.
--
-- PromoCode.discountValue is dual-unit and x100 is correct for both halves:
--   FIXED      pesos   -> centavos      (500  -> 50000)
--   PERCENTAGE percent -> basis points  (10   -> 1000)

-- AlterTable
ALTER TABLE "Category"
  ALTER COLUMN "price" SET DATA TYPE INTEGER USING ROUND("price" * 100);

-- AlterTable
ALTER TABLE "Event"
  ALTER COLUMN "logisticsDeliveryFee" DROP DEFAULT,
  ALTER COLUMN "logisticsDeliveryFee" SET DATA TYPE INTEGER USING ROUND("logisticsDeliveryFee" * 100),
  ALTER COLUMN "logisticsDeliveryFee" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Organizer"
  ALTER COLUMN "adminFee" DROP DEFAULT,
  ALTER COLUMN "adminFee" SET DATA TYPE INTEGER USING ROUND("adminFee" * 100),
  ALTER COLUMN "adminFee" SET DEFAULT 6000;

-- AlterTable
ALTER TABLE "PromoCode"
  ALTER COLUMN "discountValue" SET DATA TYPE INTEGER USING ROUND("discountValue" * 100);

-- AlterTable
ALTER TABLE "Registration"
  ALTER COLUMN "deliveryFee" DROP DEFAULT,
  ALTER COLUMN "deliveryFee" SET DATA TYPE INTEGER USING ROUND("deliveryFee" * 100),
  ALTER COLUMN "deliveryFee" SET DEFAULT 0,
  ALTER COLUMN "subtotal" SET DATA TYPE INTEGER USING ROUND("subtotal" * 100),
  ALTER COLUMN "platformFee" DROP DEFAULT,
  ALTER COLUMN "platformFee" SET DATA TYPE INTEGER USING ROUND("platformFee" * 100),
  ALTER COLUMN "platformFee" SET DEFAULT 0,
  ALTER COLUMN "transactionFee" DROP DEFAULT,
  ALTER COLUMN "transactionFee" SET DATA TYPE INTEGER USING ROUND("transactionFee" * 100),
  ALTER COLUMN "transactionFee" SET DEFAULT 0,
  ALTER COLUMN "totalAmount" SET DATA TYPE INTEGER USING ROUND("totalAmount" * 100);
