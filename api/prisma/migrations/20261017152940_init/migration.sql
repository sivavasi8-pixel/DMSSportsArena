-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "username" TEXT,
    "pin_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "email" TEXT,
    "dob" DATE,
    "playing_role" TEXT,
    "skill_level" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_pin" BOOLEAN NOT NULL DEFAULT false,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "surface" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operating_hours" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER,
    "day_of_week" INTEGER NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,
    "slot_minutes" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "operating_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" SERIAL NOT NULL,
    "resource_type" TEXT NOT NULL,
    "day_type" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "price_inr" INTEGER NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" SERIAL NOT NULL,
    "booking_code" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "slot_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "hold_expires_at" TIMESTAMP(3),
    "amount_inr" INTEGER NOT NULL,
    "payment_mode" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "paid_via" TEXT,
    "upi_ref" TEXT,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_blocks" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER,
    "block_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "reason" TEXT,
    "created_by" INTEGER,

    CONSTRAINT "slot_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "venue_name" TEXT NOT NULL DEFAULT 'DMS Sports Arena',
    "address" TEXT NOT NULL DEFAULT '',
    "map_embed_url" TEXT NOT NULL DEFAULT '',
    "map_link" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "contact_phone" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "upi_id" TEXT NOT NULL DEFAULT '',
    "upi_payee_name" TEXT NOT NULL DEFAULT 'DMS Sports Arena',
    "cancellation_hours" INTEGER NOT NULL DEFAULT 4,
    "max_advance_days" INTEGER NOT NULL DEFAULT 14,
    "max_bookings_per_day" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "venue_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_photos" (
    "id" SERIAL NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "mime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "image_data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "actor_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_key" ON "users"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_code_key" ON "bookings"("booking_code");

-- CreateIndex
CREATE INDEX "bookings_slot_date_resource_id_idx" ON "bookings"("slot_date", "resource_id");

-- CreateIndex
CREATE INDEX "bookings_user_id_idx" ON "bookings"("user_id");

-- CreateIndex
CREATE INDEX "slot_blocks_block_date_idx" ON "slot_blocks"("block_date");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "operating_hours" ADD CONSTRAINT "operating_hours_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_blocks" ADD CONSTRAINT "slot_blocks_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Double-booking guard: at most one ACTIVE booking per resource/date/start.
-- Cancelled rows are ignored, so a freed slot can be booked again; held rows
-- count, so the first transaction to hold a slot wins and the second gets a unique violation.
CREATE UNIQUE INDEX "bookings_active_slot_key"
  ON "bookings" ("resource_id", "slot_date", "start_time")
  WHERE "status" IN ('held', 'confirmed', 'completed', 'no_show');
