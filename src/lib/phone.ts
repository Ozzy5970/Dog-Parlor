/**
 * Normalizes a South African or international phone number to E.164 format.
 * Matches the PostgreSQL database function `public.normalize_sa_phone` exactly.
 * Returns null if the phone number is invalid.
 */
export function normalizeSaPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  
  // Strip all characters except digits and the plus symbol
  const clean = phone.replace(/[^0-9+]/g, '')
  
  // Case 1: Already starts with '+' and has valid E.164 length (8 to 15 digits)
  if (/^\+[1-9][0-9]{7,14}$/.test(clean)) {
    return clean
  }
  
  // Remove any inner pluses to evaluate raw digits
  const digits = clean.replace(/\+/g, '')
  
  // Case 2: Standard SA local format (e.g., 0821112222) - 10 digits
  if (/^0[1-9][0-9]{8}$/.test(digits)) {
    return '+27' + digits.substring(1)
  }
  
  // Case 3: SA international format (e.g., 27821112222) - 11 digits
  if (/^27[1-9][0-9]{8}$/.test(digits)) {
    return '+' + digits
  }
  
  // Case 4: 9-digit SA format missing leading 0 (e.g., 821112222)
  if (/^[1-9][0-9]{8}$/.test(digits)) {
    return '+27' + digits
  }
  
  // Otherwise, invalid format
  return null
}
