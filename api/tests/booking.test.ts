import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { addDays, istNow } from "../src/time.js";

process.env.NODE_ENV = "test";
let server: Server;
let base = "";
const run = Date.now().toString().slice(-6);
const mobiles: string[] = [];

async function call(path: string, method = "GET", body?: unknown, cookie?: string) {
  const res = await fetch(base + path, {
    method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
}
async function player(i: number, pin = "573920") {
  const mobile = `8${run}${String(i).padStart(3, "0")}`.slice(0, 10).padEnd(10, "0");
  mobiles.push(mobile);
  const r = await call("/api/auth/signup", "POST", { fullName: `Test Player ${i}`, mobile, pin, pin2: pin });
  expect(r.status).toBe(201);
  return { mobile, cookie: r.cookie };
}

beforeAll(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  expect((await prisma.resource.count()) > 0).toBe(true); // run `npm run seed` first
});
afterAll(async () => {
  await prisma.booking.deleteMany({ where: { user: { mobile: { in: mobiles } } } });
  await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
  server.close();
  await prisma.$disconnect();
});

describe("PIN rules", () => {
  it("rejects weak PINs and mismatches", async () => {
    const mobile = `7${run}000`.padEnd(10, "0").slice(0, 10);
    expect((await call("/api/auth/signup", "POST", { fullName: "Weak One", mobile, pin: "1234", pin2: "1234" })).status).toBe(400);
    expect((await call("/api/auth/signup", "POST", { fullName: "Weak One", mobile, pin: "1111", pin2: "1111" })).status).toBe(400);
    expect((await call("/api/auth/signup", "POST", { fullName: "Weak One", mobile, pin: "573920", pin2: "573921" })).status).toBe(400);
  });
  it("locks the account after 5 wrong PINs", async () => {
    const p = await player(900);
    for (let i = 0; i < 4; i++) expect((await call("/api/auth/login", "POST", { identifier: p.mobile, pin: "000999" })).status).toBe(401);
    expect((await call("/api/auth/login", "POST", { identifier: p.mobile, pin: "000999" })).status).toBe(423);
    // even the right PIN is refused while locked
    expect((await call("/api/auth/login", "POST", { identifier: p.mobile, pin: "573920" })).status).toBe(423);
  });
});

describe("double booking", () => {
  it("gives exactly one winner when 20 players race for one slot", async () => {
    const players = await Promise.all(Array.from({ length: 20 }, (_, i) => player(i)));
    const date = addDays(istNow().date, 2);
    const net = await prisma.resource.findFirstOrThrow({ where: { type: "net", isActive: true }, orderBy: { id: "asc" } });
    // clean any leftovers on this slot from earlier runs
    await prisma.booking.deleteMany({ where: { resourceId: net.id, slotDate: new Date(`${date}T00:00:00Z`), startTime: "18:00" } });

    const results = await Promise.all(
      players.map((p) => call("/api/bookings/hold", "POST", { slots: [{ resourceId: net.id, date, start: "18:00" }] }, p.cookie)),
    );
    const wins = results.filter((r) => r.status === 201);
    const clashes = results.filter((r) => r.status === 409);
    expect(wins).toHaveLength(1);
    expect(clashes).toHaveLength(19);
    expect(clashes[0].json.clashes[0]).toMatchObject({ resourceId: net.id, date, start: "18:00" });

    const rows = await prisma.booking.count({ where: { resourceId: net.id, slotDate: new Date(`${date}T00:00:00Z`), startTime: "18:00" } });
    expect(rows).toBe(1);
  });

  it("holds multi-slot checkouts all-or-nothing, confirms, and frees on cancel", async () => {
    const [a, b] = await Promise.all([player(50), player(51)]);
    const date = addDays(istNow().date, 3);
    const nets = await prisma.resource.findMany({ where: { type: "net", isActive: true }, orderBy: { id: "asc" } });
    await prisma.booking.deleteMany({ where: { slotDate: new Date(`${date}T00:00:00Z`), startTime: { in: ["09:00", "10:00"] } } });
    const s1 = { resourceId: nets[0].id, date, start: "09:00" };
    const s2 = { resourceId: nets[0].id, date, start: "10:00" };

    const holdB = await call("/api/bookings/hold", "POST", { slots: [s2] }, b.cookie);
    expect(holdB.status).toBe(201);
    // A wants s1 + s2; s2 is taken, so s1 must NOT be left held
    const holdA = await call("/api/bookings/hold", "POST", { slots: [s1, s2] }, a.cookie);
    expect(holdA.status).toBe(409);
    expect(await prisma.booking.count({ where: { resourceId: s1.resourceId, slotDate: new Date(`${date}T00:00:00Z`), startTime: "09:00" } })).toBe(0);

    const ok = await call("/api/bookings/hold", "POST", { slots: [s1] }, a.cookie);
    expect(ok.status).toBe(201);
    const noUtr = await call("/api/bookings/confirm", "POST", { holdIds: [ok.json.holds[0].id], paymentMode: "upi" }, a.cookie);
    expect(noUtr.status).toBe(400);
    const conf = await call("/api/bookings/confirm", "POST", { holdIds: [ok.json.holds[0].id], paymentMode: "upi", upiRef: "123456789012" }, a.cookie);
    expect(conf.status).toBe(200);
    expect(conf.json.bookings[0]).toMatchObject({ status: "confirmed", paymentStatus: "verification" });

    // other players see it as booked on the grid
    const grid = await call(`/api/slots?date=${date}&type=net`, "GET", undefined, b.cookie);
    expect(grid.json.cells[s1.resourceId]["09:00"].state).toBe("booked");
    expect(grid.json.cells[s2.resourceId]["10:00"].state).toBe("selected_hold");

    // cancel frees the slot for someone else
    expect((await call(`/api/bookings/${conf.json.bookings[0].id}/cancel`, "POST", {}, a.cookie)).status).toBe(200);
    expect((await call("/api/bookings/hold", "POST", { slots: [s1] }, b.cookie)).status).toBe(201);
  });

  it("lets an expired hold be taken by someone else", async () => {
    const [a, b] = await Promise.all([player(60), player(61)]);
    const date = addDays(istNow().date, 4);
    const net = await prisma.resource.findFirstOrThrow({ where: { type: "net", isActive: true } });
    await prisma.booking.deleteMany({ where: { resourceId: net.id, slotDate: new Date(`${date}T00:00:00Z`), startTime: "07:00" } });
    const h = await call("/api/bookings/hold", "POST", { slots: [{ resourceId: net.id, date, start: "07:00" }] }, a.cookie);
    expect(h.status).toBe(201);
    await prisma.booking.update({ where: { id: h.json.holds[0].id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const grid = await call(`/api/slots?date=${date}&type=net`, "GET", undefined, b.cookie);
    expect(grid.json.cells[net.id]["07:00"].state).toBe("available");
    expect((await call("/api/bookings/hold", "POST", { slots: [{ resourceId: net.id, date, start: "07:00" }] }, b.cookie)).status).toBe(201);
    // and A can no longer confirm the expired hold
    expect((await call("/api/bookings/confirm", "POST", { holdIds: [h.json.holds[0].id], paymentMode: "at_nets" }, a.cookie)).status).toBe(404);
  });
});
