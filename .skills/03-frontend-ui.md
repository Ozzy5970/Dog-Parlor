# Frontend UI Guidelines - Dog Parlour Booking

## Frontend Stack
- React
- Vite
- TypeScript
- Tailwind
- React Router
- Supabase JS client

Do not switch to Next.js unless explicitly requested.

## UI Rules
- mobile-first
- simple and clean
- admin dashboard must be practical, not fancy
- forms must show clear validation errors
- booking statuses must be visually obvious
- loading and error states are required
- do not hide important failures in console only

## Routes
### Public
- /
- /book
- /booking-success

### Admin
- /admin/login
- /admin
- /admin/bookings
- /admin/bookings/new
- /admin/bookings/:id/edit
- /admin/services
- /admin/settings
- /admin/blocked-slots

## Supabase Client
- use src/lib/supabase.ts
- read VITE_SUPABASE_URL
- read VITE_SUPABASE_ANON_KEY
- never expose service_role key

## When Implementing
- keep components small
- avoid unrelated refactors
- run npm run build
- report files changed and commands run
