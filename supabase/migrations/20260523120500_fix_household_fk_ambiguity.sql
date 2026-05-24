-- Migration: Drop simple household FK constraint to resolve PostgREST relationship ambiguity
ALTER TABLE public.customers
DROP CONSTRAINT IF EXISTS customers_household_id_fkey;
-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
