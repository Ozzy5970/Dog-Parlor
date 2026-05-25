-- Add full public policy text fields to business_settings for complete customizability from the admin panel
ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS privacy_policy_text TEXT,
ADD COLUMN IF NOT EXISTS terms_of_service_text TEXT,
ADD COLUMN IF NOT EXISTS booking_policy_text TEXT;
