import { supabase } from '../lib/supabase'

export interface Customer {
  id: string
  business_id: string
  full_name: string
  phone: string
  email: string | null
}

export interface Pet {
  id: string
  business_id: string
  customer_id: string
  name: string
  breed: string | null
  size: string | null
  notes: string | null
}

export interface ManualBookingInput {
  customerId: string
  petId: string
  serviceId: string
  startTimeIso: string
  endTimeIso: string
  source: 'phone' | 'walk_in' | 'admin'
  customerNotes?: string | null
  adminNotes?: string | null
}

/**
 * Searches for a customer by business_id and phone.
 * If found, returns the customer. If not found, creates and returns a new customer.
 */
export async function findOrCreateCustomer(
  businessId: string,
  fullName: string,
  phone: string,
  email?: string | null
): Promise<Customer> {
  const cleanPhone = phone.trim()
  const cleanName = fullName.trim()
  const cleanEmail = email?.trim() || null

  // 1. Search for customer
  const { data: existingCustomer, error: findError } = await supabase
    .from('customers')
    .select('*')
    .eq('business_id', businessId)
    .eq('phone', cleanPhone)
    .maybeSingle()

  if (findError) {
    throw findError
  }

  if (existingCustomer) {
    return existingCustomer as Customer
  }

  // 2. If not found, create new customer
  const { data: newCustomer, error: insertError } = await supabase
    .from('customers')
    .insert({
      business_id: businessId,
      full_name: cleanName,
      phone: cleanPhone,
      email: cleanEmail
    })
    .select('*')
    .single()

  if (insertError) {
    throw insertError
  }

  return newCustomer as Customer
}

/**
 * Creates a new pet record associated with the given customer.
 */
export async function createPet(
  businessId: string,
  customerId: string,
  name: string,
  breed?: string | null,
  size?: string | null,
  notes?: string | null
): Promise<Pet> {
  const { data, error } = await supabase
    .from('pets')
    .insert({
      business_id: businessId,
      customer_id: customerId,
      name: name.trim(),
      breed: breed?.trim() || null,
      size: size || null,
      notes: notes?.trim() || null
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data as Pet
}

/**
 * Creates a new manual customer booking. Status defaults to 'confirmed'.
 */
export async function createManualBooking(
  businessId: string,
  input: ManualBookingInput
): Promise<any> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      business_id: businessId,
      customer_id: input.customerId,
      pet_id: input.petId,
      service_id: input.serviceId,
      start_time: input.startTimeIso,
      end_time: input.endTimeIso,
      status: 'confirmed',
      source: input.source,
      customer_notes: input.customerNotes?.trim() || null,
      admin_notes: input.adminNotes?.trim() || null
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}
