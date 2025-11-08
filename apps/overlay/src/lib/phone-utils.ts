/**
 * Check if a string is a phone number (contains only digits, +, spaces, dashes, parentheses)
 */
export function isPhoneNumber(str: string): boolean {
  if (!str) return false;
  // Remove common phone number formatting characters
  const cleaned = str.replace(/[\s\-\(\)\+]/g, "");
  // Check if it's mostly digits and has reasonable length (7-15 digits)
  const digitCount = cleaned.replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 15 && /^[\d\+\s\-\(\)]+$/.test(str);
}

/**
 * Check if a string looks like a phone number identifier (no @ symbol, mostly digits)
 */
export function isPhoneIdentifier(identifier: string | null): boolean {
  if (!identifier) return false;
  // Email addresses are not phone numbers
  if (identifier.includes("@")) return false;
  // Check if it's mostly digits
  const digitCount = identifier.replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 15;
}
