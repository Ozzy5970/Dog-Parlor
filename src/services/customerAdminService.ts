import { supabase } from '../lib/supabase'

export interface CustomerHistory {
  id: string
  business_id: string
  full_name: string
  surname: string | null
  phone: string
  email: string | null
  household_id: string | null
  created_at: string
  updated_at: string
  pets: Array<{
    id: string
    name: string
    breed: string | null
    size: string | null
    notes: string | null
    age_years: number | null
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
  } | null
}

export interface Household {
  id: string
  name: string
  business_id: string
}

/**
 * Fetches all households for the business to enable quick selection/linking.
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
 * Creates a new household record.
 */
export async function createHousehold(businessId: string, name: string): Promise<Household> {
  const { data, error } = await supabase
    .from('households')
    .insert({
      business_id: businessId,
      name: name.trim()
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

/**
 * Links a customer to a household. Set householdId to null to unlink.
 */
export async function linkCustomerToHousehold(
  businessId: string,
  customerId: string,
  householdId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ household_id: householdId })
    .eq('id', customerId)
    .eq('business_id', businessId) // Enforce RLS/business isolation safety

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

  // Base select query
  const selectQuery = `
    *,
    pets (
      id,
      name,
      breed,
      size,
      notes,
      age_years
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
      name
    )
  `

  if (!cleanSearch) {
    // If no search query, return recent customers (up to 100)
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
  const { data: directData, error: directErr } = await supabase
    .from('customers')
    .select(selectQuery)
    .eq('business_id', businessId)
    .or(`full_name.ilike.%${cleanSearch}%,surname.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%`)

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
  
  // Filter out customer IDs that were already retrieved via direct query
  const missingCustomerIds = matchedCustomerIds.filter(id => !directCustomerIds.has(id))

  if (missingCustomerIds.length > 0) {
    // Query remaining customers matching pet name
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
 * Fetches other household members linked to the same household_id (excluding the current customer).
 */
export async function fetchHouseholdMembers(
  businessId: string,
  householdId: string,
  excludeCustomerId: string
): Promise<Array<{ id: string; full_name: string; surname: string | null; phone: string }>> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, full_name, surname, phone')
    .eq('business_id', businessId)
    .eq('household_id', householdId)
    .neq('id', excludeCustomerId)

  if (error) throw error
  return data || []
}
