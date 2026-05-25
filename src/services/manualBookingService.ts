import { supabase } from '../lib/supabase'
import { normalizeSaPhone } from '../lib/phone'

export interface Customer {
  id: string
  business_id: string
  full_name: string
  phone: string
  email: string | null
  surname: string | null
}

export interface Pet {
  id: string
  business_id: string
  customer_id: string
  name: string
  breed: string | null
  size: string | null
  notes: string | null
  age_years?: number | null
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
  email?: string | null,
  surname?: string | null
): Promise<Customer> {
  const normalizedPhone = normalizeSaPhone(phone)
  if (!normalizedPhone) {
    throw new Error('Please enter a valid phone number, e.g. 082 123 4567.')
  }
  const cleanPhone = phone.trim()
  const cleanName = fullName.trim()
  const cleanEmail = email?.trim() || null

  // 1. Search for customer by normalized_phone
  const { data: existingCustomer, error: findError } = await supabase
    .from('customers')
    .select('*')
    .eq('business_id', businessId)
    .eq('normalized_phone', normalizedPhone)
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
      email: cleanEmail,
      surname: surname?.trim() || null,
      normalized_phone: normalizedPhone
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

export interface AdminSubmitBookingInput {
  fullName: string
  phone: string
  email?: string | null
  petName: string
  petBreed?: string | null
  petSize?: string | null
  petNotes?: string | null
  serviceId: string
  startTimeIso: string
  source: 'phone' | 'walk_in' | 'admin'
  customerNotes?: string | null
  adminNotes?: string | null
  petAgeYears?: number | null
  surname?: string | null
  // Optional customer profile details
  addressLine1?: string | null
  addressLine2?: string | null
  suburb?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
  country?: string | null
  extraNames?: string[]
}

/**
 * Submits a manual booking request atomically via the secure DB RPC,
 * and updates optional customer address/household details if provided.
 */
export async function adminSubmitBooking(
  input: AdminSubmitBookingInput
): Promise<{ success: boolean; booking_id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('admin_submit_booking', {
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_email: input.email || null,
    p_pet_name: input.petName,
    p_pet_breed: input.petBreed || null,
    p_pet_size: input.petSize || null,
    p_pet_notes: input.petNotes || null,
    p_service_id: input.serviceId,
    p_start_time: input.startTimeIso,
    p_source: input.source,
    p_customer_notes: input.customerNotes || null,
    p_admin_notes: input.adminNotes || null,
    p_pet_age_years: input.petAgeYears !== undefined ? input.petAgeYears : null,
    p_surname: input.surname || null,
    p_pet_species: 'dog'
  })

  if (error) {
    throw error
  }

  const result = data as { success: boolean; booking_id?: string; error?: string }

  if (result.success && result.booking_id) {
    const hasProfileDetails = 
      input.addressLine1?.trim() || 
      input.addressLine2?.trim() || 
      input.suburb?.trim() || 
      input.city?.trim() || 
      input.province?.trim() || 
      input.postalCode?.trim() || 
      (input.extraNames && input.extraNames.length > 0)

    if (hasProfileDetails) {
      const { data: bookingObj, error: fetchErr } = await supabase
        .from('bookings')
        .select(`
          business_id,
          customer:customers (
            household_id
          )
        `)
        .eq('id', result.booking_id)
        .single()

      if (fetchErr) throw fetchErr

      const householdId = (bookingObj as any)?.customer?.household_id
      const businessId = (bookingObj as any)?.business_id

      if (householdId && businessId) {
        const cleanExtraNames = (input.extraNames || [])
          .map(n => n.trim())
          .filter(n => n !== '')

        const { error: updateErr } = await supabase
          .from('households')
          .update({
            address_line_1: input.addressLine1?.trim() || null,
            address_line_2: input.addressLine2?.trim() || null,
            suburb: input.suburb?.trim() || null,
            city: input.city?.trim() || null,
            province: input.province?.trim() || null,
            postal_code: input.postalCode?.trim() || null,
            country: input.country?.trim() || 'South Africa',
            household_member_names: cleanExtraNames
          })
          .eq('id', householdId)
          .eq('business_id', businessId)

        if (updateErr) throw updateErr
      }
    }
  }

  return result
}

