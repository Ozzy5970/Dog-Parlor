/**
 * Sanitizes a phone number for use in WhatsApp wa.me links.
 * - Strips all non-digits.
 * - Converts South African numbers starting with '0' to the '27' format (e.g. 0821234567 -> 27821234567).
 * - Retains numbers already starting with '27'.
 * - Returns an empty string if the cleaned phone number is invalid (less than 7 or more than 15 digits).
 */
export function sanitizePhoneForWhatsApp(phone: string | null | undefined): string {
  if (!phone) return ''
  
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '')
  
  // If it's a standard 10-digit South African number starting with 0, convert to 27
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '27' + cleaned.substring(1)
  }
  
  // A standard international phone number has between 7 and 15 digits
  if (cleaned.length < 7 || cleaned.length > 15) {
    return ''
  }
  
  return cleaned
}

/**
 * Creates a WhatsApp click-to-chat URL (wa.me link).
 * - Sanitizes the phone number.
 * - Returns null if the phone number is invalid or missing.
 * - Encodes the message with encodeURIComponent.
 */
export function createWhatsAppLink(phone: string | null | undefined, message?: string): string | null {
  const sanitized = sanitizePhoneForWhatsApp(phone)
  if (!sanitized) return null
  
  if (message) {
    return `https://wa.me/${sanitized}?text=${encodeURIComponent(message)}`
  }
  
  return `https://wa.me/${sanitized}`
}

/**
 * Generates the pre-filled message template for a pending booking request.
 */
export function getPendingBookingMessage(
  customerName: string,
  businessName: string,
  petName: string,
  dateStr: string,
  timeStr: string
): string {
  return `Hi ${customerName}, this is ${businessName}. We received your booking request for ${petName} on ${dateStr} at ${timeStr}. We'll confirm shortly.`
}

/**
 * Generates the pre-filled message template for a confirmed booking.
 */
export function getConfirmedBookingMessage(
  customerName: string,
  businessName: string,
  petName: string,
  dateStr: string,
  timeStr: string
): string {
  return `Hi ${customerName}, this is ${businessName}. Your booking for ${petName} is confirmed for ${dateStr} at ${timeStr}.`
}

/**
 * Generates the pre-filled message template for a cancelled booking that needs discussion.
 */
export function getCancelledBookingMessage(
  customerName: string,
  businessName: string,
  petName: string,
  dateStr: string,
  timeStr: string
): string {
  return `Hi ${customerName}, this is ${businessName}. We need to discuss your booking for ${petName} on ${dateStr} at ${timeStr}.`
}

/**
 * Generates a general greeting message from the business to the customer.
 */
export function getGeneralCustomerMessage(customerName: string, businessName: string): string {
  return `Hi ${customerName}, this is ${businessName}.`
}

/**
 * Generates a message from the customer to the business after an online booking request is made.
 */
export function getCustomerToParlourMessage(petName: string): string {
  return `Hi, I just submitted an online booking request for ${petName}. Please let me know when it is confirmed.`
}
