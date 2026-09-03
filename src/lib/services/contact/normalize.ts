/**
 * Contact normalisation.
 *
 * De-duplication only works if the same person typed in two different ways
 * resolves to the same stored value. These run on every write path (widget
 * lead capture, CSV import, manual entry) so a contact is not silently
 * duplicated because someone typed "+1 (555) 010-2030" one time and
 * "5550102030" the next.
 */

/** Lowercased and trimmed; returns null for anything empty. */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  return email || null;
}

/**
 * Keeps digits, and a leading "+" when the number was written in
 * international form. Everything else — spaces, brackets, dots, dashes — is
 * punctuation that varies by person and locale.
 *
 * Deliberately not a full E.164 parser: without knowing the caller's country
 * a bare "5550102030" cannot be given a country code, and guessing one would
 * corrupt the number. This makes the same number written differently compare
 * equal, which is what de-duplication needs.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  const isInternational = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return null;

  // "00" is the international prefix in much of the world; normalise it to "+"
  // so 0044... and +44... are the same contact.
  if (isInternational && trimmed.startsWith("00")) return `+${digits.replace(/^00/, "")}`;
  return isInternational ? `+${digits}` : digits;
}

/** Collapses internal whitespace so " John   Smith " and "John Smith" match. */
export function normalizeName(value: string | null | undefined): string | null {
  if (!value) return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name || null;
}
