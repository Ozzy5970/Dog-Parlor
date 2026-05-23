-- Migration: Add pet age column and safely recreate public/admin submit booking functions

-- 1. Table Alterations
-- Add the age_years column to the pets table if it does not exist
ALTER TABLE public.pets 
ADD COLUMN IF NOT EXISTS age_years numeric(4,1);

-- Safely recreate the check constraint
ALTER TABLE public.pets DROP CONSTRAINT IF EXISTS check_pet_age;
ALTER TABLE public.pets 
ADD CONSTRAINT check_pet_age CHECK (age_years IS NULL OR (age_years >= 0.0 AND age_years <= 40.0));


-- 2. Drop Old Function Signatures to avoid overload conflicts
DROP FUNCTION IF EXISTS public.submit_booking_request(
    uuid,  -- p_business_id
    text,  -- p_full_name
    text,  -- p_phone
    text,  -- p_email
    text,  -- p_pet_name
    text,  -- p_pet_breed
    text,  -- p_pet_size
    text,  -- p_pet_notes
    uuid,  -- p_service_id
    timestamptz, -- p_start_time
    text   -- p_customer_notes
);

DROP FUNCTION IF EXISTS public.admin_submit_booking(
    text,  -- p_full_name
    text,  -- p_phone
    text,  -- p_email
    text,  -- p_pet_name
    text,  -- p_pet_breed
    text,  -- p_pet_size
    text,  -- p_pet_notes
    uuid,  -- p_service_id
    timestamptz, -- p_start_time
    text,  -- p_source
    text,  -- p_customer_notes
    text   -- p_admin_notes
);


-- 3. Recreate public.submit_booking_request with age_years support
CREATE OR REPLACE FUNCTION public.submit_booking_request(
    p_business_id UUID,
    p_full_name TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_pet_name TEXT,
    p_pet_breed TEXT,
    p_pet_size TEXT,
    p_pet_notes TEXT,
    p_service_id UUID,
    p_start_time TIMESTAMPTZ,
    p_customer_notes TEXT,
    p_pet_age_years numeric DEFAULT NULL
) RETURNS json 
SET search_path = public AS $$
DECLARE
    v_customer_id UUID;
    v_pet_id UUID;
    v_booking_id UUID;
    v_duration INT;
    v_end_time TIMESTAMPTZ;
    v_tz TEXT;
    v_min_notice INT;
    v_max_advance INT;
    v_day_of_week INT;
    v_open_time TIME;
    v_close_time TIME;
    v_is_closed BOOLEAN;
    v_local_start_time TIME;
    v_local_end_time TIME;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    -- 1. Validate Business first
    IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid business');
    END IF;

    -- Validate dog age if provided
    IF p_pet_age_years IS NOT NULL AND (p_pet_age_years < 0 OR p_pet_age_years > 40) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid dog age');
    END IF;

    -- 2. Fetch business settings
    SELECT timezone, min_notice_hours, max_advance_days 
    INTO v_tz, v_min_notice, v_max_advance
    FROM business_settings 
    WHERE business_id = p_business_id;

    -- Fallbacks in case settings are missing
    IF v_tz IS NULL THEN
        v_tz := 'Africa/Johannesburg';
        v_min_notice := 2;
        v_max_advance := 60;
    END IF;

    -- 3. Validate Service
    SELECT duration_minutes INTO v_duration 
    FROM services 
    WHERE id = p_service_id 
      AND business_id = p_business_id 
      AND is_active = true;

    IF v_duration IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid service');
    END IF;

    -- Calculate end time securely
    v_end_time := p_start_time + (v_duration || ' minutes')::interval;

    -- 4. Advance Notice Validations
    IF p_start_time < (NOW() + (v_min_notice || ' hours')::interval) THEN
        RETURN json_build_object('success', false, 'error', 'Booking too soon');
    END IF;

    IF p_start_time > (NOW() + (v_max_advance || ' days')::interval) THEN
        RETURN json_build_object('success', false, 'error', 'Booking too far ahead');
    END IF;

    -- 5. Opening Hours Validation
    -- Extract local times based on business timezone
    v_local_start_time := (p_start_time AT TIME ZONE v_tz)::time;
    v_local_end_time := (v_end_time AT TIME ZONE v_tz)::time;
    v_start_date := (p_start_time AT TIME ZONE v_tz)::date;
    v_end_date := (v_end_time AT TIME ZONE v_tz)::date;
    
    -- Reject if booking crosses midnight locally
    IF v_start_date != v_end_date THEN
        RETURN json_build_object('success', false, 'error', 'Outside opening hours');
    END IF;

    -- Extract local day of week (Postgres EXTRACT(DOW) returns 0-6 where 0 is Sunday)
    v_day_of_week := EXTRACT(DOW FROM (p_start_time AT TIME ZONE v_tz))::int;

    SELECT open_time, close_time, is_closed 
    INTO v_open_time, v_close_time, v_is_closed
    FROM business_opening_hours
    WHERE business_id = p_business_id AND day_of_week = v_day_of_week;

    IF NOT FOUND OR v_is_closed = TRUE THEN
        RETURN json_build_object('success', false, 'error', 'Outside opening hours');
    END IF;

    IF v_local_start_time < v_open_time OR v_local_end_time > v_close_time THEN
        RETURN json_build_object('success', false, 'error', 'Outside opening hours');
    END IF;

    -- 6. Enter inner block so failed booking inserts cleanly rollback customer/pet rows
    BEGIN
        -- Find or create customer (with trim normalization)
        SELECT id INTO v_customer_id FROM customers WHERE business_id = p_business_id AND phone = TRIM(p_phone) LIMIT 1;
        IF v_customer_id IS NULL THEN
            INSERT INTO customers (business_id, full_name, phone, email) 
            VALUES (p_business_id, TRIM(p_full_name), TRIM(p_phone), NULLIF(TRIM(COALESCE(p_email, '')), ''))
            RETURNING id INTO v_customer_id;
        END IF;

        -- Create pet (with null-safe normalization & age_years field)
        INSERT INTO pets (business_id, customer_id, name, breed, size, notes, age_years)
        VALUES (
            p_business_id, 
            v_customer_id, 
            TRIM(p_pet_name), 
            NULLIF(TRIM(COALESCE(p_pet_breed, '')), ''), 
            NULLIF(TRIM(COALESCE(p_pet_size, '')), ''), 
            NULLIF(TRIM(COALESCE(p_pet_notes, '')), ''),
            p_pet_age_years
        )
        RETURNING id INTO v_pet_id;

        -- Attempt to create booking (with status pending and source online)
        INSERT INTO bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source, customer_notes)
        VALUES (
            p_business_id, 
            v_customer_id, 
            v_pet_id, 
            p_service_id, 
            p_start_time, 
            v_end_time, 
            'pending', 
            'online', 
            NULLIF(TRIM(COALESCE(p_customer_notes, '')), '')
        )
        RETURNING id INTO v_booking_id;

        -- If successful, return the ID
        RETURN json_build_object('success', true, 'booking_id', v_booking_id);

    EXCEPTION 
        WHEN exclusion_violation THEN
            -- Inner transaction block rolls back, undoing the customer/pet inserts
            RETURN json_build_object('success', false, 'error', 'Slot already taken');
        WHEN raise_exception THEN
            -- Returns the exact RAISE EXCEPTION message from triggers
            IF SQLERRM = 'Slot is blocked' THEN
                RETURN json_build_object('success', false, 'error', 'Slot is blocked');
            ELSIF SQLERRM = 'Service is not active' OR SQLERRM = 'Service does not belong to the business' THEN
                RETURN json_build_object('success', false, 'error', 'Invalid service');
            ELSE
                RETURN json_build_object('success', false, 'error', SQLERRM);
            END IF;
        WHEN OTHERS THEN
            RETURN json_build_object('success', false, 'error', 'An unexpected error occurred: ' || SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Explicitly set submit_booking_request execute permissions
REVOKE EXECUTE ON FUNCTION public.submit_booking_request(
    uuid, text, text, text, text, text, text, text, uuid, timestamptz, text, numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_booking_request(
    uuid, text, text, text, text, text, text, text, uuid, timestamptz, text, numeric
) TO anon, authenticated;


-- 4. Recreate public.admin_submit_booking with age_years support
CREATE OR REPLACE FUNCTION public.admin_submit_booking(
    p_full_name text,
    p_phone text,
    p_email text,
    p_pet_name text,
    p_pet_breed text,
    p_pet_size text,
    p_pet_notes text,
    p_service_id uuid,
    p_start_time timestamptz,
    p_source text,
    p_customer_notes text,
    p_admin_notes text,
    p_pet_age_years numeric DEFAULT NULL
) RETURNS json
SET search_path = public AS $$
DECLARE
    v_business_id uuid;
    v_duration int;
    v_end_time timestamptz;
    v_customer_id uuid;
    v_pet_id uuid;
    v_booking_id uuid;
    v_tz text;
    v_min_notice int;
    v_max_advance int;
    v_local_start_time time;
    v_local_end_time time;
    v_start_date date;
    v_end_date date;
    v_day_of_week int;
    v_open_time time;
    v_close_time time;
    v_is_closed boolean;
BEGIN
    -- 1. Input parameters validation (Raise error before any DB load or write)
    IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
        RETURN json_build_object('success', false, 'error', 'Missing customer name');
    END IF;
    IF p_phone IS NULL OR TRIM(p_phone) = '' THEN
        RETURN json_build_object('success', false, 'error', 'Missing phone');
    END IF;
    IF p_pet_name IS NULL OR TRIM(p_pet_name) = '' THEN
        RETURN json_build_object('success', false, 'error', 'Missing pet name');
    END IF;
    IF p_service_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Missing service');
    END IF;
    IF p_start_time IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Missing start time');
    END IF;
    IF p_source IS NULL OR TRIM(p_source) = '' OR p_source NOT IN ('phone', 'walk_in', 'admin') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid source');
    END IF;
    IF p_pet_age_years IS NOT NULL AND (p_pet_age_years < 0 OR p_pet_age_years > 40) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid dog age');
    END IF;

    -- 2. Determine business_id from profile using auth.uid()
    v_business_id := get_user_business_id();
    IF v_business_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Admin profile not found');
    END IF;

    -- 3. Load business settings
    SELECT timezone, min_notice_hours, max_advance_days
    INTO v_tz, v_min_notice, v_max_advance
    FROM business_settings
    WHERE business_id = v_business_id;

    -- Apply fallback values if settings are not present or fields are empty
    IF v_tz IS NULL THEN v_tz := 'Africa/Johannesburg'; END IF;
    IF v_min_notice IS NULL THEN v_min_notice := 2; END IF;
    IF v_max_advance IS NULL THEN v_max_advance := 60; END IF;

    -- 4. Validate advance notice windows
    IF p_start_time < (NOW() + (v_min_notice || ' hours')::interval) THEN
        RETURN json_build_object('success', false, 'error', 'Booking too soon');
    END IF;

    IF p_start_time > (NOW() + (v_max_advance || ' days')::interval) THEN
        RETURN json_build_object('success', false, 'error', 'Booking too far ahead');
    END IF;

    -- 5. Validate service details
    SELECT duration_minutes INTO v_duration
    FROM services
    WHERE id = p_service_id
      AND business_id = v_business_id
      AND is_active = true;

    IF v_duration IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid service');
    END IF;

    -- Calculate end_time based on service duration
    v_end_time := p_start_time + (v_duration || ' minutes')::interval;

    -- 6. Opening hours validation
    -- Convert UTC times to local business timezone
    v_local_start_time := (p_start_time AT TIME ZONE v_tz)::time;
    v_local_end_time := (v_end_time AT TIME ZONE v_tz)::time;
    v_start_date := (p_start_time AT TIME ZONE v_tz)::date;
    v_end_date := (v_end_time AT TIME ZONE v_tz)::date;

    -- Ensure booking does not cross local midnight boundary
    IF v_start_date != v_end_date THEN
        RETURN json_build_object('success', false, 'error', 'Outside opening hours');
    END IF;

    -- Get local day of week (0 = Sunday, 1 = Monday, etc.)
    v_day_of_week := EXTRACT(DOW FROM (p_start_time AT TIME ZONE v_tz))::int;

    -- Fetch opening schedule for the specific day
    SELECT open_time, close_time, is_closed 
    INTO v_open_time, v_close_time, v_is_closed
    FROM business_opening_hours
    WHERE business_id = v_business_id AND day_of_week = v_day_of_week;

    IF NOT FOUND OR v_is_closed = TRUE THEN
        RETURN json_build_object('success', false, 'error', 'Outside opening hours');
    END IF;

    -- Enforce time boundaries
    IF v_local_start_time < v_open_time OR v_local_end_time > v_close_time THEN
        RETURN json_build_object('success', false, 'error', 'Outside opening hours');
    END IF;

    -- 7. Execute writes inside subtransaction block to guarantee atomicity
    BEGIN
        -- Find or create customer
        SELECT id INTO v_customer_id 
        FROM customers 
        WHERE business_id = v_business_id 
          AND phone = TRIM(p_phone) 
        LIMIT 1;

        IF v_customer_id IS NULL THEN
            INSERT INTO customers (business_id, full_name, phone, email)
            VALUES (v_business_id, TRIM(p_full_name), TRIM(p_phone), NULLIF(TRIM(COALESCE(p_email, '')), ''))
            RETURNING id INTO v_customer_id;
        END IF;

        -- Create pet
        INSERT INTO pets (business_id, customer_id, name, breed, size, notes, age_years)
        VALUES (
            v_business_id, 
            v_customer_id, 
            TRIM(p_pet_name), 
            NULLIF(TRIM(COALESCE(p_pet_breed, '')), ''), 
            NULLIF(TRIM(COALESCE(p_pet_size, '')), ''), 
            NULLIF(TRIM(COALESCE(p_pet_notes, '')), ''),
            p_pet_age_years
        )
        RETURNING id INTO v_pet_id;

        -- Create booking
        INSERT INTO bookings (
            business_id, 
            customer_id, 
            pet_id, 
            service_id, 
            start_time, 
            end_time, 
            status, 
            source, 
            customer_notes, 
            admin_notes
        )
        VALUES (
            v_business_id, 
            v_customer_id, 
            v_pet_id, 
            p_service_id, 
            p_start_time, 
            v_end_time, 
            'confirmed', 
            p_source, 
            NULLIF(TRIM(COALESCE(p_customer_notes, '')), ''), 
            NULLIF(TRIM(COALESCE(p_admin_notes, '')), '')
        )
        RETURNING id INTO v_booking_id;

        -- Return success and the booking ID
        RETURN json_build_object('success', true, 'booking_id', v_booking_id);

    EXCEPTION
        WHEN exclusion_violation THEN
            -- Inner transaction block rolls back, undoing client/pet inserts on collision
            RETURN json_build_object('success', false, 'error', 'Slot already taken');
        WHEN raise_exception THEN
            -- Bubble up exact messages from triggers (e.g. "Slot is blocked")
            IF SQLERRM = 'Slot is blocked' THEN
                RETURN json_build_object('success', false, 'error', 'Slot is blocked');
            ELSIF SQLERRM = 'Service is not active' OR SQLERRM = 'Service does not belong to the business' THEN
                RETURN json_build_object('success', false, 'error', 'Invalid service');
            ELSE
                RETURN json_build_object('success', false, 'error', SQLERRM);
            END IF;
        WHEN OTHERS THEN
            RETURN json_build_object('success', false, 'error', 'Unexpected error');
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Explicitly set admin_submit_booking execute permissions
REVOKE EXECUTE ON FUNCTION public.admin_submit_booking(
    text, text, text, text, text, text, text, uuid, timestamptz, text, text, text, numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_submit_booking(
    text, text, text, text, text, text, text, uuid, timestamptz, text, text, text, numeric
) TO authenticated;
