-- Seed Script for Dog Parlour Demo Data
-- Business ID: 8f7b76e1-95a9-4670-bbcf-2c8c67c8227b
-- Safety Marker: email LIKE 'seed.customer%@example.com'

DO $$
DECLARE
  v_business_id UUID := '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
  
  -- Arrays of realistic South African names and pet data
  names TEXT[] := ARRAY['Johan', 'Sipho', 'Thabo', 'Pieter', 'Willem', 'Jacobus', 'Fatima', 'Priya', 'Naledi', 'Lerato', 'Zanele', 'Bongiwe', 'Sarah', 'Liezel', 'Chantel', 'Ruan', 'Jaco', 'Austin', 'Ozzy', 'David', 'Michael', 'Robert', 'William', 'Mary', 'Elizabeth', 'Jennifer', 'Patricia', 'Linda', 'Barbara', 'Susan', 'Margaret', 'Dorothy', 'Lisa', 'Nancy', 'Karen', 'Betty', 'Helen', 'Sandra', 'Donna', 'Carol'];
  surnames TEXT[] := ARRAY['Botha', 'van der Merwe', 'van Wyk', 'Naidoo', 'Pillay', 'Cele', 'Khumalo', 'Dlamini', 'Smith', 'Miller', 'Jansen', 'Nkosi', 'Mthembu', 'Ndlovu', 'Patel', 'Moodley', 'Pretorius', 'Coetzee', 'Kruger', 'Louw'];
  
  pet_names TEXT[] := ARRAY['Rocky', 'Bella', 'Max', 'Luna', 'Coco', 'Charlie', 'Daisy', 'Bailey', 'Buster', 'Lola', 'Toby', 'Sadie', 'Duke', 'Jack', 'Molly', 'Cooper', 'Sophie', 'Bear', 'Chloe', 'Buddy', 'Maggie', 'Roxy', 'Tyson', 'Zoe', 'Zeus', 'Bentley', 'Oscar', 'Harley', 'Millie', 'Gizmo', 'Nala', 'Lucky', 'Lady', 'Winston', 'Rusty', 'Shadow', 'Sam', 'Patch', 'Prince', 'Bruno', 'Penny', 'Gus', 'Ruby', 'Teddy', 'Dexter'];
  breeds TEXT[] := ARRAY['Labrador', 'Poodle', 'Jack Russell', 'Yorkshire Terrier', 'German Shepherd', 'Golden Retriever', 'Chihuahua', 'Cocker Spaniel', 'Bulldog', 'Beagle', 'Boxer', 'Dachshund', 'Husky', 'Rottweiler', 'Great Dane'];
  sizes TEXT[] := ARRAY['small', 'medium', 'large', 'giant'];

  v_customer_id UUID;
  v_pet_id UUID;
  v_service_id UUID;
  v_duration INT;
  
  v_cust_ids UUID[] := '{}';
  v_pet_ids UUID[] := '{}';
  
  -- Iterators
  i INT;
  d INT;
  slot INT;
  v_history_bookings_count INT := 0;
  
  -- Dynamic booking time variables
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_status TEXT;
  v_payment_method TEXT;
  v_completed_at TIMESTAMPTZ;
  v_paid_at TIMESTAMPTZ;
  
  -- Randomizer variables
  v_rand DOUBLE PRECISION;
  
  -- Today's specific variables
  v_cust_1 UUID; v_pet_1 UUID;
  v_cust_2 UUID; v_pet_2 UUID;
  v_cust_3 UUID; v_pet_3 UUID;
  v_cust_4 UUID; v_pet_4 UUID;
  v_cust_5 UUID; v_pet_5 UUID;
  v_cust_6 UUID; v_pet_6 UUID;
  v_cust_7 UUID; v_pet_7 UUID;
  v_cust_8 UUID; v_pet_8 UUID;
  v_cust_9 UUID; v_pet_9 UUID;
  v_cust_10 UUID; v_pet_10 UUID;
  v_cust_11 UUID; v_pet_11 UUID;

BEGIN
  -- 1. CLEANUP PREVIOUS SEEDED DATA (Idempotency)
  -- Deletes cascadingly bookings -> pets -> customers associated with the seed email pattern
  DELETE FROM public.bookings WHERE customer_id IN (SELECT id FROM public.customers WHERE email LIKE 'seed.customer%@example.com');
  DELETE FROM public.pets WHERE customer_id IN (SELECT id FROM public.customers WHERE email LIKE 'seed.customer%@example.com');
  DELETE FROM public.customers WHERE email LIKE 'seed.customer%@example.com';

  -- Create temporary table to hold generated mappings for verification
  CREATE TEMP TABLE temp_customer_pet (
    customer_id UUID,
    pet_id UUID
  ) ON COMMIT DROP;

  -- 2. SEED 40 CUSTOMERS
  FOR i IN 1..40 LOOP
    INSERT INTO public.customers (
      business_id,
      full_name,
      surname,
      phone,
      email
    ) VALUES (
      v_business_id,
      names[(i % array_length(names, 1)) + 1],
      surnames[(i % array_length(surnames, 1)) + 1],
      -- South African format numbers: +27 72 / 83 / 71 / 82 followed by digits
      '+27' || (ARRAY['72', '83', '71', '82'])[floor(random()*4)+1] || lpad(floor(random()*10000000)::text, 7, '0'),
      'seed.customer' || lpad(i::text, 3, '0') || '@example.com'
    ) RETURNING id INTO v_customer_id;
    
    v_cust_ids := array_append(v_cust_ids, v_customer_id);
  END LOOP;

  -- 3. SEED 45 PETS (Linked to generated customers)
  FOR i IN 1..45 LOOP
    -- Link pet to customer sequentially first, then overflow back to customer 1
    v_customer_id := v_cust_ids[(i % 40) + 1];
    
    INSERT INTO public.pets (
      business_id,
      customer_id,
      name,
      breed,
      size,
      notes,
      age_years
    ) VALUES (
      v_business_id,
      v_customer_id,
      pet_names[(i % array_length(pet_names, 1)) + 1],
      breeds[(i % array_length(breeds, 1)) + 1],
      sizes[floor(random()*3)+1], -- Mostly small, medium, large
      CASE WHEN random() < 0.25 THEN 'Temperamental during nail trimming.' ELSE NULL END,
      round((random() * 10 + 0.5)::numeric, 1)
    ) RETURNING id INTO v_pet_id;
    
    v_pet_ids := array_append(v_pet_ids, v_pet_id);
    
    INSERT INTO temp_customer_pet (customer_id, pet_id) VALUES (v_customer_id, v_pet_id);
  END LOOP;

  -- 4. SEED 79 HISTORY BOOKINGS (Sequential, non-overlapping)
  FOR d IN 1..50 LOOP
    -- Exclude Sundays (operational opening hours check)
    IF EXTRACT(DOW FROM (NOW() - (d || ' days')::interval)) <> 0 THEN
      -- Create 2 slots per day sequentially to avoid overlaps
      FOR slot IN 1..2 LOOP
        IF v_history_bookings_count < 79 THEN
          -- Select random customer-pet pairing from temp mapping to maintain relationship constraint
          SELECT customer_id, pet_id INTO v_customer_id, v_pet_id 
          FROM temp_customer_pet 
          ORDER BY random() LIMIT 1;
          
          -- Select random service from business
          SELECT id, duration_minutes INTO v_service_id, v_duration 
          FROM public.services 
          WHERE business_id = v_business_id AND is_active = true 
          ORDER BY random() LIMIT 1;
          
          -- Define non-overlapping times: Slot 1 starts 08:30, Slot 2 starts 11:30
          IF slot = 1 THEN
            v_start_time := date_trunc('day', NOW() - (d || ' days')::interval) + INTERVAL '8 hours 30 minutes';
          ELSE
            v_start_time := date_trunc('day', NOW() - (d || ' days')::interval) + INTERVAL '11 hours 30 minutes';
          END IF;
          
          v_end_time := v_start_time + (v_duration || ' minutes')::interval;
          
          -- Assign realistic statuses
          v_rand := random();
          IF v_rand < 0.85 THEN
            v_status := 'completed';
            -- Cash/card split (~60% card, ~40% cash)
            IF random() < 0.60 THEN
              v_payment_method := 'card';
            ELSE
              v_payment_method := 'cash';
            END IF;
            v_completed_at := v_end_time;
            v_paid_at := v_end_time;
          ELSIF v_rand < 0.90 THEN
            v_status := 'no_show';
            v_payment_method := NULL; v_completed_at := NULL; v_paid_at := NULL;
          ELSIF v_rand < 0.95 THEN
            v_status := 'cancelled';
            v_payment_method := NULL; v_completed_at := NULL; v_paid_at := NULL;
          ELSE
            v_status := 'declined';
            v_payment_method := NULL; v_completed_at := NULL; v_paid_at := NULL;
          END IF;
          
          INSERT INTO public.bookings (
            business_id, customer_id, pet_id, service_id, 
            start_time, end_time, status, source, 
            payment_method, arrived_at, completed_at, paid_at,
            customer_notes, admin_notes
          ) VALUES (
            v_business_id, v_customer_id, v_pet_id, v_service_id,
            v_start_time, v_end_time, v_status, 
            (ARRAY['online', 'phone', 'walk_in'])[floor(random()*3)+1],
            v_payment_method,
            CASE WHEN v_status = 'completed' THEN v_start_time + INTERVAL '5 minutes' ELSE NULL END,
            v_completed_at, v_paid_at,
            CASE WHEN random() < 0.2 THEN 'Sensitive paws.' ELSE NULL END,
            CASE WHEN random() < 0.15 THEN 'Regular grooming schedule.' ELSE NULL END
          );
          
          v_history_bookings_count := v_history_bookings_count + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 5. TODAY'S DEMO WORKFLOW (Day 0) - Precise relative times to NOW()
  -- Fetch distinct pairings from mapping table
  SELECT customer_id, pet_id INTO v_cust_1, v_pet_1 FROM temp_customer_pet LIMIT 1 OFFSET 0;
  SELECT customer_id, pet_id INTO v_cust_2, v_pet_2 FROM temp_customer_pet LIMIT 1 OFFSET 1;
  SELECT customer_id, pet_id INTO v_cust_3, v_pet_3 FROM temp_customer_pet LIMIT 1 OFFSET 2;
  SELECT customer_id, pet_id INTO v_cust_4, v_pet_4 FROM temp_customer_pet LIMIT 1 OFFSET 3;
  SELECT customer_id, pet_id INTO v_cust_5, v_pet_5 FROM temp_customer_pet LIMIT 1 OFFSET 4;
  SELECT customer_id, pet_id INTO v_cust_6, v_pet_6 FROM temp_customer_pet LIMIT 1 OFFSET 5;
  SELECT customer_id, pet_id INTO v_cust_7, v_pet_7 FROM temp_customer_pet LIMIT 1 OFFSET 6;
  SELECT customer_id, pet_id INTO v_cust_8, v_pet_8 FROM temp_customer_pet LIMIT 1 OFFSET 7;
  SELECT customer_id, pet_id INTO v_cust_9, v_pet_9 FROM temp_customer_pet LIMIT 1 OFFSET 8;
  SELECT customer_id, pet_id INTO v_cust_10, v_pet_10 FROM temp_customer_pet LIMIT 1 OFFSET 9;
  SELECT customer_id, pet_id INTO v_cust_11, v_pet_11 FROM temp_customer_pet LIMIT 1 OFFSET 10;

  -- Booking 1: Completed Card (6 hours ago)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source, payment_method, arrived_at, completed_at, paid_at)
  VALUES (v_business_id, v_cust_1, v_pet_1, v_service_id, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours', 'completed', 'walk_in', 'card', NOW() - INTERVAL '5 hours 55 minutes', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours');

  -- Booking 2: Cancelled in History (6 hours ago, overlaps with above)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source)
  VALUES (v_business_id, v_cust_2, v_pet_2, v_service_id, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours', 'cancelled', 'online');

  -- Booking 3: Completed Cash (5 hours ago)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source, payment_method, arrived_at, completed_at, paid_at)
  VALUES (v_business_id, v_cust_3, v_pet_3, v_service_id, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '4 hours', 'completed', 'phone', 'cash', NOW() - INTERVAL '4 hours 50 minutes', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours');

  -- Booking 4: No Show (4 hours ago, overlaps with arrived 1)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source)
  VALUES (v_business_id, v_cust_4, v_pet_4, v_service_id, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours', 'no_show', 'online');

  -- Booking 5: Arrived 1 (arrived 4 hours ago, checkout pending)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source, arrived_at, customer_notes)
  VALUES (v_business_id, v_cust_5, v_pet_5, v_service_id, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours', 'arrived', 'online', NOW() - INTERVAL '3 hours 45 minutes', 'Dog loves back scratches.');

  -- Booking 6: Arrived 2 (arrived 3 hours ago, checkout pending)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source, arrived_at)
  VALUES (v_business_id, v_cust_6, v_pet_6, v_service_id, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours', 'arrived', 'phone', NOW() - INTERVAL '2 hours 40 minutes');

  -- Booking 7: Confirmed Overdue 1 (due 2 hours ago, ready for arrival)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source)
  VALUES (v_business_id, v_cust_7, v_pet_7, v_service_id, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 'confirmed', 'online');

  -- Booking 8: Confirmed Overdue 2 (due 1 hour ago, ready for arrival)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source)
  VALUES (v_business_id, v_cust_8, v_pet_8, v_service_id, NOW() - INTERVAL '1 hour', NOW(), 'confirmed', 'online');

  -- Booking 9: Pending 1 (starts now, ready to confirm/decline)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source, customer_notes)
  VALUES (v_business_id, v_cust_9, v_pet_9, v_service_id, NOW(), NOW() + INTERVAL '1 hour', 'pending', 'online', 'Please call when ready.');

  -- Booking 10: Pending 2 (starts in 1 hour, ready to confirm/decline)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source)
  VALUES (v_business_id, v_cust_10, v_pet_10, v_service_id, NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours', 'pending', 'online');

  -- Booking 11: Confirmed Later Today (starts in 2 hours)
  SELECT id INTO v_service_id FROM public.services WHERE business_id = v_business_id AND is_active = true ORDER BY random() LIMIT 1;
  INSERT INTO public.bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source)
  VALUES (v_business_id, v_cust_11, v_pet_11, v_service_id, NOW() + INTERVAL '2 hours', NOW() + INTERVAL '3 hours', 'confirmed', 'phone');

END $$;
