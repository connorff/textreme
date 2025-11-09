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

/**
 * Format a phone number for display
 * Handles US phone numbers and international formats
 */
export function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters except +
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // If it starts with +1 and has 12 characters (+1 + 10 digits), format as US number
  if (cleaned.startsWith('+1') && cleaned.length === 12) {
    // +1 (XXX) XXX-XXXX
    return `+1 (${cleaned.slice(2, 5)}) ${cleaned.slice(5, 8)}-${cleaned.slice(8)}`;
  }
  
  // If it's 10 digits, format as US number
  if (cleaned.length === 10) {
    // (XXX) XXX-XXXX
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  // If it's 11 digits starting with 1, format as US number
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    // +1 (XXX) XXX-XXXX
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  // Otherwise return as-is
  return phoneNumber;
}
