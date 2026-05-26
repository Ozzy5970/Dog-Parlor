import { supabase } from '../lib/supabase'
import { normalizeSaPhone } from '../lib/phone'

export interface CustomerHistory {
  id: string
  business_id: string
  full_name: string
  surname: string | null
  phone: string
  email: string | null
  household_id: string | null
  normalized_phone: string
  created_at: string
  updated_at: string
  pets: Array<{
    id: string
    name: string
    breed: string | null
    size: string | null
    notes: string | null
    age_years: number | null
    species: string
    is_active: boolean
  }>
  bookings: Array<{
    id: string
    start_time: string
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
    source: 'online' | 'phone' | 'walk_in' | 'admin'
    service: {
      name: string
      price_cents: number
    } | null
  }>
  household: {
    id: string
    name: string
    address_line_1: string | null
    address_line_2: string | null
    suburb: string | null
    city: string | null
    province: string | null
    postal_code: string | null
    country: string
    household_member_names: string[]
  } | null
}

export interface Household {
  id: string
  name: string
  business_id: string
  address_line_1: string | null
  address_line_2: string | null
  suburb: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string
  household_member_names: string[]
}

/**
 * Fetches all households for the business.
 */
export async function fetchHouseholds(businessId: string): Promise<Household[]> {
  const { data, error } = await supabase
    .from('households')
    .select('*')
    .eq('business_id', businessId)
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Updates customer details and household address details in one transaction-like block.
 */
export async function updateCustomerProfile(
  businessId: string,
  customerId: string,
  householdId: string | null,
  customerUpdates: {
    full_name: string
    surname: string | null
    email: string | null
    phone: string
  },
  householdUpdates: {
    address_line_1: string | null
    address_line_2: string | null
    suburb: string | null
    city: string | null
    province: string | null
    postal_code: string | null
    country: string
    household_member_names: string[]
  }
): Promise<void> {
  // 1. Validate Phone Normalization
  const normalizedPhone = normalizeSaPhone(customerUpdates.phone)
  if (!normalizedPhone) {
    throw new Error('Please enter a valid phone number, e.g. 082 123 4567.')
  }

  // Check if normalized phone is already linked to another customer in the same business
  const { data: existing, error: existError } = await supabase
    .from('customers')
    .select('id')
    .eq('business_id', businessId)
    .eq('normalized_phone', normalizedPhone)
    .neq('id', customerId)
    .maybeSingle()

  if (existError) throw existError
  if (existing) {
    throw new Error('That phone number is already linked to another customer profile.')
  }

  // 1. Update customer profile
  const { error: custError } = await supabase
    .from('customers')
    .update({
      full_name: customerUpdates.full_name.trim(),
      surname: customerUpdates.surname?.trim() || null,
      email: customerUpdates.email?.trim() || null,
      phone: customerUpdates.phone.trim()
    })
    .eq('id', customerId)
    .eq('business_id', businessId)

  if (custError) throw custError

  // 2. Update household address/members (if linked)
  if (householdId) {
    const { error: hhError } = await supabase
      .from('households')
      .update({
        address_line_1: householdUpdates.address_line_1?.trim() || null,
        address_line_2: householdUpdates.address_line_2?.trim() || null,
        suburb: householdUpdates.suburb?.trim() || null,
        city: householdUpdates.city?.trim() || null,
        province: householdUpdates.province?.trim() || null,
        postal_code: householdUpdates.postal_code?.trim() || null,
        country: householdUpdates.country.trim() || 'South Africa',
        household_member_names: householdUpdates.household_member_names
      })
      .eq('id', householdId)
      .eq('business_id', businessId)

    if (hhError) throw hhError
  }
}

/**
 * Adds a new pet profile to the customer and household.
 * Performs a duplicate check on active pets in the same household/customer profile first.
 */
export async function addPetToCustomer(
  businessId: string,
  customerId: string,
  householdId: string | null,
  pet: {
    name: string
    species: string
    breed: string | null
    size: string | null
    age_years: number | null
    notes: string | null
  }
): Promise<{ success: boolean; petId?: string; error?: string }> {
  const cleanName = pet.name.trim()

  if (pet.age_years !== null && (pet.age_years < 0 || pet.age_years > 40)) {
    return { success: false, error: 'Pet age must be between 0 and 40.' }
  }

  // 1. Duplicate active pet check (scoping within customer or household context)
  let existingQuery = supabase
    .from('pets')
    .select('id')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .ilike('name', cleanName)

  if (householdId) {
    existingQuery = existingQuery.or(`customer_id.eq.${customerId},household_id.eq.${householdId}`)
  } else {
    existingQuery = existingQuery.eq('customer_id', customerId)
  }

  const { data: existing, error: fetchErr } = await existingQuery
  if (fetchErr) throw fetchErr

  if (existing && existing.length > 0) {
    return { success: false, error: `A pet named "${cleanName}" already exists on this profile.` }
  }

  // 2. Insert pet profile
  const { data: newPet, error: insertErr } = await supabase
    .from('pets')
    .insert({
      business_id: businessId,
      customer_id: customerId,
      household_id: householdId,
      name: cleanName,
      species: pet.species || 'dog',
      breed: pet.breed?.trim() || null,
      size: pet.size || null,
      age_years: pet.age_years,
      notes: pet.notes?.trim() || null,
      is_active: true
    })
    .select('id')
    .single()

  if (insertErr) throw insertErr

  // 3. Populate customer_pets link
  const { error: linkErr } = await supabase
    .from('customer_pets')
    .insert({
      customer_id: customerId,
      pet_id: newPet.id,
      business_id: businessId,
      relationship: 'owner'
    })

  if (linkErr) throw linkErr

  return { success: true, petId: newPet.id }
}

/**
 * Soft archives a pet by setting is_active = false and archived_at = now().
 */
export async function archivePet(businessId: string, petId: string): Promise<void> {
  const { error } = await supabase
    .from('pets')
    .update({
      is_active: false,
      archived_at: new Date().toISOString()
    })
    .eq('id', petId)
    .eq('business_id', businessId)

  if (error) throw error
}

/**
 * Updates details of an active pet profile.
 */
export async function updatePetProfile(
  businessId: string,
  petId: string,
  updates: {
    name: string
    breed: string | null
    size: string | null
    notes: string | null
    age_years: number | null
    species: string
  }
): Promise<void> {
  if (updates.age_years !== null && (updates.age_years < 0 || updates.age_years > 40)) {
    throw new Error('Pet age must be between 0 and 40.')
  }

  const { error } = await supabase
    .from('pets')
    .update({
      name: updates.name.trim(),
      breed: updates.breed?.trim() || null,
      size: updates.size || null,
      notes: updates.notes?.trim() || null,
      age_years: updates.age_years,
      species: updates.species
    })
    .eq('id', petId)
    .eq('business_id', businessId)

  if (error) throw error
}

/**
 * Searches and fetches customer list with pet count and upcoming/past counts.
 */
export async function searchCustomers(
  businessId: string,
  searchQuery: string
): Promise<CustomerHistory[]> {
  const cleanSearch = searchQuery.trim()

  const selectQuery = `
    *,
    pets (
      id,
      name,
      breed,
      size,
      notes,
      age_years,
      species,
      is_active
    ),
    bookings (
      id,
      start_time,
      status,
      source,
      service:services (
        name,
        price_cents
      )
    ),
    household:households (
      id,
      name,
      address_line_1,
      address_line_2,
      suburb,
      city,
      province,
      postal_code,
      country,
      household_member_names
    )
  `

  if (!cleanSearch) {
    const { data, error } = await supabase
      .from('customers')
      .select(selectQuery)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    return (data || []) as unknown as CustomerHistory[]
  }

  // 1. Direct search on Customer fields (name, surname, phone)
  const orConditions = [
    `full_name.ilike.%${cleanSearch}%`,
    `surname.ilike.%${cleanSearch}%`,
    `phone.ilike.%${cleanSearch}%`
  ]

  const normalizedSearchPhone = normalizeSaPhone(cleanSearch)
  if (normalizedSearchPhone) {
    orConditions.push(
      `normalized_phone.eq.${normalizedSearchPhone}`,
      `normalized_phone.ilike.%${normalizedSearchPhone}%`
    )
  }

  const { data: directData, error: directErr } = await supabase
    .from('customers')
    .select(selectQuery)
    .eq('business_id', businessId)
    .or(orConditions.join(','))

  if (directErr) throw directErr

  // 2. Search on Pet Name to find linked customers
  const { data: petData, error: petErr } = await supabase
    .from('pets')
    .select('customer_id')
    .eq('business_id', businessId)
    .ilike('name', `%${cleanSearch}%`)

  if (petErr) throw petErr

  const matchedCustomerIds = Array.from(new Set((petData || []).map(p => p.customer_id)))
  const directCustomerIds = new Set((directData || []).map(c => c.id))
  
  const missingCustomerIds = matchedCustomerIds.filter(id => !directCustomerIds.has(id))

  if (missingCustomerIds.length > 0) {
    const { data: linkedData, error: linkedErr } = await supabase
      .from('customers')
      .select(selectQuery)
      .eq('business_id', businessId)
      .in('id', missingCustomerIds)

    if (linkedErr) throw linkedErr

    return [...(directData || []), ...(linkedData || [])] as unknown as CustomerHistory[]
  }

  return (directData || []) as unknown as CustomerHistory[]
}

/**
 * Links/merges households of two customers.
 */
export async function mergeCustomerHouseholds(
  primaryCustomerId: string,
  secondaryCustomerId: string
): Promise<{ success: boolean; primary_household_id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('merge_customer_households', {
    p_primary_cust_id: primaryCustomerId,
    p_secondary_cust_id: secondaryCustomerId
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const result = data as { success: boolean; primary_household_id?: string; error?: string; message?: string }
  if (result && !result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    primary_household_id: result.primary_household_id
  }
}

/**
 * Merges duplicate pets under the same household/owner.
 */
export async function mergeCustomerPets(
  primaryPetId: string,
  duplicatePetIds: string[]
): Promise<{ success: boolean; archived_count?: number; bookings_updated?: number; error?: string }> {
  const { data, error } = await supabase.rpc('merge_customer_pets', {
    p_primary_pet_id: primaryPetId,
    p_duplicate_pet_ids: duplicatePetIds
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const result = data as { success: boolean; archived_count?: number; bookings_updated?: number; error?: string }
  if (result && !result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    archived_count: result.archived_count,
    bookings_updated: result.bookings_updated
  }
}

