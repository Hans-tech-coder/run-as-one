-- An optional organizer-supplied size chart image on an event. Nullable, so
-- every existing event keeps showing the default chart.
ALTER TABLE "Event" ADD COLUMN "sizeChartImageUrl" TEXT;
