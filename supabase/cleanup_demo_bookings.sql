-- Cleanup Script for Dog Parlour Demo Data
-- Safety Marker: email LIKE 'seed.customer%@example.com'

-- 1. Delete dependent bookings
DELETE FROM public.bookings 
WHERE customer_id IN (
  SELECT id FROM public.customers WHERE email LIKE 'seed.customer%@example.com'
);

-- 2. Delete dependent pets
DELETE FROM public.pets 
WHERE customer_id IN (
  SELECT id FROM public.customers WHERE email LIKE 'seed.customer%@example.com'
);

-- 3. Delete customers
DELETE FROM public.customers 
WHERE email LIKE 'seed.customer%@example.com';
