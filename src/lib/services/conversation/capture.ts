import { Prisma } from "@prisma/client";

type CapturedValue = string | null;

function textValue(value: unknown): CapturedValue {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 320) : null;
}

function firstValue(data: Record<string, unknown>, keys: string[]): CapturedValue {
  for (const key of keys) {
    const value = textValue(data[key]);
    if (value) return value;
  }
  return null;
}

function capturedIdentity(data: Record<string, unknown>) {
  return {
    name: firstValue(data, ["name", "fullName", "full_name", "customerName", "customer_name"]),
    email: firstValue(data, ["email", "emailAddress", "email_address"])?.toLowerCase() || null,
    phone: firstValue(data, ["phone", "phoneNumber", "phone_number", "mobile", "whatsapp"]),
    company: firstValue(data, ["company", "companyName", "company_name", "organization", "organisation"]),
  };
}

/** Keep a conversation's captured fields, lead, and reusable contact in sync. */
export async function persistCapturedConversationData(
  tx: Prisma.TransactionClient,
  tenantId: string,
  conversationId: string,
  collectedData: Record<string, unknown>,
) {
  const identity = capturedIdentity(collectedData);
  const hasUsefulData = Object.values(identity).some(Boolean) || Object.keys(collectedData).length > 0;
  if (!hasUsefulData) return;

  const score = (identity.name ? 10 : 0) + (identity.email ? 45 : 0) + (identity.phone ? 45 : 0);
  const leadData = {
    name: identity.name,
    email: identity.email,
    phone: identity.phone,
    contactInfo: JSON.stringify(identity),
    collectedFields: JSON.stringify(collectedData),
    score,
  };

  const existingLead = await tx.lead.findFirst({
    where: { tenantId, conversationId, deletedAt: null },
    select: { id: true },
  });
  if (existingLead) {
    await tx.lead.update({ where: { id: existingLead.id }, data: leadData });
  } else {
    await tx.lead.create({ data: { tenantId, conversationId, ...leadData } });
  }

  // Contacts are only created when the visitor gave us a durable way to reach
  // them.  Prefer email, then phone, and merge new details into that record.
  if (!identity.email && !identity.phone) return;
  const existingContact = await tx.contact.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      OR: [
        ...(identity.email ? [{ email: identity.email }] : []),
        ...(identity.phone ? [{ phone: identity.phone }] : []),
      ],
    },
    select: { id: true, name: true, email: true, phone: true, company: true },
  });
  const contactData = {
    name: identity.name || existingContact?.name || null,
    email: identity.email || existingContact?.email || null,
    phone: identity.phone || existingContact?.phone || null,
    company: identity.company || existingContact?.company || null,
    source: "chatbot_capture",
  };
  if (existingContact) {
    await tx.contact.update({ where: { id: existingContact.id }, data: contactData });
  } else {
    await tx.contact.create({ data: { tenantId, ...contactData } });
  }
}
