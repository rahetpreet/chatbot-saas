/**
 * The most important security test in this codebase: a user of one workspace
 * must never be able to read or modify another workspace's data.
 *
 * These tests hit a real database. Set TEST_DATABASE_URL to a scratch database
 * (a Neon branch works well) to run them; without it they are skipped rather
 * than silently passing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { ContactRepository } from "../src/lib/repositories/contactRepository";
import { LeadRepository } from "../src/lib/repositories/leadRepository";
import { CampaignRepository } from "../src/lib/repositories/campaignRepository";
import { FlowRepository } from "../src/lib/repositories/flowRepository";

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : "set TEST_DATABASE_URL to run tenant isolation tests";

const run = randomUUID().slice(0, 8);
let prisma: PrismaClient;
let data: {
  a: { tenantId: string; contactId: string; flowId: string; campaignId: string; conversationId: string; leadId: string };
  b: { tenantId: string; contactId: string; flowId: string; campaignId: string; conversationId: string; leadId: string };
};

test.before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = TEST_DB;
  prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });

  const make = async (label: string) => {
    const tenant = await prisma.tenant.create({
      data: { name: `iso-${label}-${run}`, slug: `iso-${label}-${run}`, status: "ACTIVE" },
    });
    const contact = await ContactRepository.create(tenant.id, {
      name: `${label} contact`,
      email: `${label}-${run}@example.test`,
    });
    const flow = await prisma.flow.create({
      data: { tenantId: tenant.id, name: `${label} flow`, nodes: "[]", edges: "[]" },
    });
    const campaign = await prisma.campaign.create({
      data: { tenantId: tenant.id, name: `${label} campaign`, slug: `${label}-${run}` },
    });
    const conversation = await prisma.conversation.create({
      data: { tenantId: tenant.id, flowId: flow.id, visitorId: `vis-${label}-${run}` },
    });
    const lead = await LeadRepository.create({
      tenantId: tenant.id,
      conversationId: conversation.id,
      name: `${label} lead`,
      email: `${label}-lead-${run}@example.test`,
    });
    return {
      tenantId: tenant.id,
      contactId: contact.id,
      flowId: flow.id,
      campaignId: campaign.id,
      conversationId: conversation.id,
      leadId: lead.id,
    };
  };

  data = { a: await make("a"), b: await make("b") };
});

test.after(async () => {
  if (skip || !prisma) return;
  // Cascades remove contacts, flows, campaigns, conversations and leads.
  await prisma.tenant.deleteMany({ where: { slug: { in: [`iso-a-${run}`, `iso-b-${run}`] } } });
  await prisma.$disconnect();
});

test("contacts: tenant A cannot read tenant B's records", { skip }, async () => {
  const listed = await ContactRepository.findByTenant(data.a.tenantId);
  assert.ok(listed.every((c: any) => c.tenantId === data.a.tenantId));
  assert.equal(listed.some((c: any) => c.id === data.b.contactId), false);
  assert.equal(await ContactRepository.findById(data.a.tenantId, data.b.contactId), null);
});

test("contacts: tenant A cannot update tenant B's records", { skip }, async () => {
  // Isolation is enforced by scoping the write, so a cross-tenant update
  // matches zero rows rather than raising.
  const result = await ContactRepository.update(data.a.tenantId, data.b.contactId, { name: "hijacked" });
  assert.equal(result.count, 0, "a cross-tenant update must affect no rows");

  const untouched = await ContactRepository.findById(data.b.tenantId, data.b.contactId);
  assert.equal(untouched?.name, "b contact", "tenant B's record must be unchanged");
});

test("contacts: tenant A cannot delete tenant B's records", { skip }, async () => {
  const result = await ContactRepository.delete(data.a.tenantId, data.b.contactId);
  assert.equal(result.count, 0, "a cross-tenant delete must affect no rows");

  const survivor = await ContactRepository.findById(data.b.tenantId, data.b.contactId);
  assert.ok(survivor, "tenant B's record must still exist");
});

test("leads: tenant A cannot read tenant B's records", { skip }, async () => {
  const listed = await LeadRepository.findByTenant(data.a.tenantId);
  assert.ok(listed.every((l: any) => l.tenantId === data.a.tenantId));
  assert.equal(await LeadRepository.findById(data.a.tenantId, data.b.leadId), null);
});

test("campaigns: tenant A cannot read tenant B's records", { skip }, async () => {
  const listed = await CampaignRepository.findByTenant(data.a.tenantId);
  assert.ok(listed.every((c: any) => c.tenantId === data.a.tenantId));
  assert.equal(listed.some((c: any) => c.id === data.b.campaignId), false);
});

test("chatbots: tenant A cannot read tenant B's flows", { skip }, async () => {
  const listed = await FlowRepository.findByTenant(data.a.tenantId);
  assert.ok(listed.every((f: any) => f.tenantId === data.a.tenantId));
  assert.equal(await FlowRepository.findById(data.a.tenantId, data.b.flowId), null);
});

test("conversations: a tenant-scoped query cannot reach another tenant", { skip }, async () => {
  const found = await prisma.conversation.findFirst({
    where: { id: data.b.conversationId, tenantId: data.a.tenantId },
  });
  assert.equal(found, null);
});

test("passwords are only ever persisted as hashes", { skip }, async () => {
  const users = await prisma.user.findMany({ take: 20 });
  for (const user of users) {
    assert.ok(user.passwordHash.startsWith("$2"), "expected a bcrypt hash");
  }
});
