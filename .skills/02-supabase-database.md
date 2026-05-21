# Supabase Database Guidelines - Dog Parlour Booking

Use Supabase Postgres, Auth, RLS, and SQL migrations carefully.

## Rules
- Never use service_role keys in frontend code.
- Use anon/publishable key only in Vite frontend.
- Keep all business-specific tables scoped by business_id.
- Use RLS on all private tables.
- Public users must not read customers, pets, or bookings.
- Public booking creation must happen through a secure RPC.
- Admin access must be scoped through profiles.business_id.
- Use WITH CHECK on insert/update RLS policies.
- SECURITY DEFINER functions must set search_path = public.
- Use timestamptz for booking start_time/end_time.
- Store prices as price_cents.
- Do not trust frontend-calculated end_time.
- Calculate booking end_time from service.duration_minutes.

## Double-Booking
- pending and confirmed block time.
- completed, cancelled, and no_show do not block time.
- conflict rule: new_start < existing_end AND new_end > existing_start.
- use tstzrange(start_time, end_time, '[)').
- adjacent bookings like 09:00-10:30 and 10:30-11:00 must be allowed.

## Before Changing Database
- explain migration purpose
- show SQL
- explain rollback risk
- include test SQL
