-- Migration: Add household_member_names TEXT[] column to households table
ALTER TABLE public.households 
ADD COLUMN IF NOT EXISTS household_member_names TEXT[] NOT NULL DEFAULT '{}';
