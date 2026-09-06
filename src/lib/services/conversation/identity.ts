/**
 * Who a conversation is with.
 *
 * The inbox used to title every row with the raw `visitorId`. That id is
 * generated once per browser and reused for every later chat, so a client who
 * had twenty-seven conversations saw the same opaque string twenty-seven times
 * and could not tell one from another. Worse, the details the visitor had
 * actually typed — their name, email and phone, sitting in `collectedData` —
 * were never looked at.
 *
 * This resolves the best available identity from every place one can hide.
 */

/** Keys a flow is likely to have stored a name, email or phone under. */
const NAME_KEYS = ["full_name", "fullname", "name", "your_name", "first_name", "firstname", "customer_name"];
const EMAIL_KEYS = ["email_address", "email", "your_email", "e_mail", "mail"];
const PHONE_KEYS = ["phone_number", "phone", "mobile", "contact_number", "whatsapp"];

function parse(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "string") return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Finds the first non-empty value under any of the candidate keys.
 *
 * Matching is case- and separator-insensitive because flow authors name their
 * fields however they like — "fullName", "Full Name" and "full_name" are all
 * the same question.
 */
function pick(data: Record<string, unknown>, candidates: string[]): string | null {
  const normalise = (key: string) => key.toLowerCase().replace(/[\s_-]/g, "");
  const wanted = new Set(candidates.map(normalise));

  for (const [key, value] of Object.entries(data)) {
    if (!wanted.has(normalise(key))) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export interface ConversationIdentity {
  /** What to show as the row title. Never empty. */
  title: string;
  /** Contact detail worth showing under the title, if any. */
  subtitle: string | null;
  /** Single letter for an avatar. */
  initial: string;
  /** True when nothing beyond an anonymous id is known. */
  anonymous: boolean;
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface ConversationLike {
  visitorId?: string | null;
  collectedData?: string | null;
  campaignContact?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  /** The lead this conversation produced, when it produced one. */
  leads?: Array<{ name?: string | null; email?: string | null; phone?: string | null }> | null;
}

/**
 * A short, stable, human-readable label for an anonymous visitor.
 *
 * Derived from the id so the same browser keeps the same label across visits —
 * two conversations genuinely from one person should read as one person.
 */
function anonymousLabel(visitorId: string | null | undefined): string {
  const id = (visitorId || "").replace(/[^A-Za-z0-9]/g, "");
  if (!id) return "Anonymous visitor";
  return `Visitor ${id.slice(-4).toUpperCase()}`;
}

export function describeVisitor(conversation: ConversationLike): ConversationIdentity {
  const collected = parse(conversation.collectedData);

  // Ordered by how much the details are worth trusting:
  //
  //  1. A campaign contact — somebody deliberately imported that person.
  //  2. The lead this chat produced — they completed a form, which is the most
  //     considered thing a visitor does. A lead submitted straight to the API
  //     leaves collectedData empty, so without this a named customer still
  //     showed in the inbox as an anonymous visitor.
  //  3. What they typed into the flow as they went.
  const lead = conversation.leads?.[0];
  const name = conversation.campaignContact?.name?.trim() || lead?.name?.trim() || pick(collected, NAME_KEYS);
  const email = conversation.campaignContact?.email?.trim() || lead?.email?.trim() || pick(collected, EMAIL_KEYS);
  const phone = conversation.campaignContact?.phone?.trim() || lead?.phone?.trim() || pick(collected, PHONE_KEYS);

  const title = name || email || phone || anonymousLabel(conversation.visitorId);
  const anonymous = !name && !email && !phone;

  // Never repeat the title underneath itself.
  const subtitle = name ? email || phone : email && phone ? phone : null;

  return {
    title,
    subtitle,
    initial: (title.match(/[A-Za-z0-9]/)?.[0] || "V").toUpperCase(),
    anonymous,
    name,
    email,
    phone,
  };
}
