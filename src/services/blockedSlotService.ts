import { supabase } from '../lib/supabase'

export interface BlockedSlot {
  id: string
  business_id: string
  start_time: string // ISO string format
  end_time: string // ISO string format
  reason: string | null
  created_at?: string
  updated_at?: string
}

export async function fetchBlockedSlots(businessId: string): Promise<BlockedSlot[]> {
  const { data, error } = await supabase
    .from('blocked_slots')
    .select('*')
    .eq('business_id', businessId)
    .order('start_time', { ascending: true })

  if (error) throw error
  return data as BlockedSlot[]
}

export async function createBlockedSlot(
  businessId: string,
  slot: Omit<BlockedSlot, 'id' | 'business_id' | 'created_at' | 'updated_at'>
): Promise<BlockedSlot> {
  const { data, error } = await supabase
    .from('blocked_slots')
    .insert({
      business_id: businessId,
      ...slot,
    })
    .select()
    .single()

  if (error) throw error
  return data as BlockedSlot
}

export async function updateBlockedSlot(
  businessId: string,
  slotId: string,
  updates: Partial<Omit<BlockedSlot, 'id' | 'business_id' | 'created_at' | 'updated_at'>>
): Promise<BlockedSlot> {
  const { data, error } = await supabase
    .from('blocked_slots')
    .update(updates)
    .eq('id', slotId)
    .eq('business_id', businessId)
    .select()
    .single()

  if (error) throw error
  return data as BlockedSlot
}

export async function deleteBlockedSlot(businessId: string, slotId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_slots')
    .delete()
    .eq('id', slotId)
    .eq('business_id', businessId)

  if (error) throw error
}
