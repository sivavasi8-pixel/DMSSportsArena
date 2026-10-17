import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const mobile = process.env.SEED_ADMIN_MOBILE ?? "9999999999";
  const pin = process.env.SEED_ADMIN_PIN ?? "482916";
  if (!/^\d{6}$/.test(pin)) throw new Error("SEED_ADMIN_PIN must be 6 digits");

  // Super admin: created once, never via signup. Re-running does not reset an existing PIN.
  await prisma.user.upsert({
    where: { mobile },
    update: {},
    create: { fullName: process.env.SEED_ADMIN_NAME ?? "Owner", mobile, username: "owner", pinHash: await bcrypt.hash(pin, 10), role: "super_admin", mustChangePin: true },
  });

  await prisma.venueSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  if ((await prisma.resource.count()) === 0) {
    await prisma.resource.createMany({
      data: [
        { name: "Net 1", type: "net", surface: "turf", sortOrder: 1 },
        { name: "Net 2", type: "net", surface: "turf", sortOrder: 2 },
        { name: "Bowling Machine 1", type: "bowling_machine", surface: "astro", sortOrder: 3 },
      ],
    });
  }
  if ((await prisma.operatingHour.count()) === 0) {
    await prisma.operatingHour.createMany({
      data: Array.from({ length: 7 }, (_, d) => ({ resourceId: null, dayOfWeek: d, openTime: "06:00", closeTime: "22:00", slotMinutes: 60 })),
    });
  }
  if ((await prisma.pricingRule.count()) === 0) {
    const rule = (resourceType: string, dayType: string, startTime: string, endTime: string, priceInr: number) => ({ resourceType, dayType, startTime, endTime, priceInr });
    await prisma.pricingRule.createMany({
      data: [
        rule("net", "weekday", "06:00", "17:00", 400), rule("net", "weekday", "17:00", "22:00", 600),
        rule("net", "weekend", "06:00", "17:00", 500), rule("net", "weekend", "17:00", "22:00", 700),
        rule("bowling_machine", "weekday", "06:00", "17:00", 600), rule("bowling_machine", "weekday", "17:00", "22:00", 800),
        rule("bowling_machine", "weekend", "06:00", "17:00", 700), rule("bowling_machine", "weekend", "17:00", "22:00", 900),
      ],
    });
  }
  console.log(`Seeded. Super admin login: ${mobile} / PIN ${pin} (you must change it at first login).`);
}
main().finally(() => prisma.$disconnect());
