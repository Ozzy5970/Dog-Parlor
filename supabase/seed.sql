-- Seed data for the Dog Parlour booking app
-- Business ID: 8f7b76e1-95a9-4670-bbcf-2c8c67c8227b

-- 1. Create the Business
INSERT INTO public.businesses (
  id,
  name,
  slug,
  phone,
  email,
  city,
  province,
  country
)
VALUES (
  '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b',
  'Dog Parlour',
  'dog-parlour',
  'replace_me',
  'replace_me',
  'Cape Town',
  'Western Cape',
  'South Africa'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  city = EXCLUDED.city,
  province = EXCLUDED.province,
  country = EXCLUDED.country
RETURNING id;

-- 2. Create Business Settings
INSERT INTO public.business_settings (
  id,
  business_id,
  timezone,
  slot_interval_minutes,
  booking_approval_mode,
  min_notice_hours,
  max_advance_days
)
VALUES (
  '0e470876-0bf8-468e-a9ef-51a8cc39e6ab',
  '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b',
  'Africa/Johannesburg',
  30,
  'manual_approval',
  2,
  60
)
ON CONFLICT (business_id) DO UPDATE SET
  timezone = EXCLUDED.timezone,
  slot_interval_minutes = EXCLUDED.slot_interval_minutes,
  booking_approval_mode = EXCLUDED.booking_approval_mode,
  min_notice_hours = EXCLUDED.min_notice_hours,
  max_advance_days = EXCLUDED.max_advance_days;

-- 3. Create Opening Hours
-- day_of_week: 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
INSERT INTO public.business_opening_hours (
  id,
  business_id,
  day_of_week,
  open_time,
  close_time,
  is_closed
)
VALUES
  ('e51f479d-3ee0-47b2-bd74-129606828551', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 1, '08:00:00', '17:00:00', FALSE), -- Monday
  ('39a1c86e-b3d4-4cae-9403-d6c6e7a022df', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 2, '08:00:00', '17:00:00', FALSE), -- Tuesday
  ('cdff5748-0d19-482a-a9a7-935be9f76a08', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 3, '08:00:00', '17:00:00', FALSE), -- Wednesday
  ('d65ebfa6-8e5c-4b53-90d2-7fb27011d615', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 4, '08:00:00', '17:00:00', FALSE), -- Thursday
  ('f8615b8d-294b-4b13-82ef-45731fb318bf', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 5, '08:00:00', '17:00:00', FALSE), -- Friday
  ('b99e7474-0f2c-47bc-875f-29ef31e457f9', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 6, '08:00:00', '13:00:00', FALSE), -- Saturday
  ('5a5c6b6c-ec44-48bd-b76b-730129bc6b30', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 0, NULL, NULL, TRUE)              -- Sunday
ON CONFLICT (business_id, day_of_week) DO UPDATE SET
  open_time = EXCLUDED.open_time,
  close_time = EXCLUDED.close_time,
  is_closed = EXCLUDED.is_closed;

-- 4. Create Starter Services (prices in cents)
INSERT INTO public.services (
  id,
  business_id,
  name,
  description,
  dog_size,
  duration_minutes,
  price_cents,
  is_active,
  sort_order
)
VALUES
  ('1b1e847c-783b-4c07-90ff-4f464016f4d2', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 'Small Dog Full Groom', 'Includes wash, dry, cut, and style for small dogs.', 'small', 90, 35000, TRUE, 10),
  ('2b2e847c-783b-4c07-90ff-4f464016f4d2', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 'Medium Dog Full Groom', 'Includes wash, dry, cut, and style for medium dogs.', 'medium', 120, 45000, TRUE, 20),
  ('3b3e847c-783b-4c07-90ff-4f464016f4d2', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 'Large Dog Full Groom', 'Includes wash, dry, cut, and style for large dogs.', 'large', 150, 55000, TRUE, 30),
  ('4b4e847c-783b-4c07-90ff-4f464016f4d2', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 'Wash Only', 'Quick wash and dry for dogs of all sizes.', 'all', 60, 25000, TRUE, 40),
  ('5b5e847c-783b-4c07-90ff-4f464016f4d2', '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 'Nail Clipping', 'Professional nail trimming and filing.', 'all', 20, 8000, TRUE, 50)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  dog_size = EXCLUDED.dog_size,
  duration_minutes = EXCLUDED.duration_minutes,
  price_cents = EXCLUDED.price_cents,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
