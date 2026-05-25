-- Migration: Add policy notes and contact text fields to business_settings table
ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS privacy_contact_text TEXT,
ADD COLUMN IF NOT EXISTS booking_policy_extra_notes TEXT,
ADD COLUMN IF NOT EXISTS terms_extra_notes TEXT;
