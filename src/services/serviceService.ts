import { supabase } from '../lib/supabase'

export interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  dog_size: string | null
  duration_minutes: number
  price_cents: number
  is_active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export async function fetchServices(businessId: string): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data as Service[]
}

export async function createService(
  businessId: string,
  service: Omit<Service, 'id' | 'business_id' | 'created_at' | 'updated_at'>
): Promise<Service> {
  const { data, error } = await supabase
    .from('services')
    .insert({
      business_id: businessId,
      ...service,
    })
    .select()
    .single()

  if (error) throw error
  return data as Service
}

export async function updateService(
  businessId: string,
  serviceId: string,
  updates: Partial<Omit<Service, 'id' | 'business_id' | 'created_at' | 'updated_at'>>
): Promise<Service> {
  const { data, error } = await supabase
    .from('services')
    .update(updates)
    .eq('id', serviceId)
    .eq('business_id', businessId)
    .select()
    .single()

  if (error) throw error
  return data as Service
}
