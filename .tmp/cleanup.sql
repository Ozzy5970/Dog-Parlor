BEGIN;

DELETE FROM public.bookings WHERE business_id = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
DELETE FROM public.customer_pets WHERE business_id = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
DELETE FROM public.pets WHERE business_id = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
DELETE FROM public.customers WHERE business_id = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
DELETE FROM public.households WHERE business_id = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';

COMMIT;
