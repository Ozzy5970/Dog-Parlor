-- Recreate submit_booking_request and admin_submit_booking with idempotent pet matching logic

DROP FUNCTION IF EXISTS public.submit_booking_request(
    UUID,     -- p_business_id
    TEXT,     -- p_full_name
    TEXT,     -- p_phone
    TEXT,     -- p_email
    TEXT,     -- p_pet_name
    TEXT,     -- p_pet_breed
    TEXT,     -- p_pet_size
    TEXT,     -- p_pet_notes
    UUID,     -- p_service_id
    TIMESTAMPTZ, -- p_start_time
    TEXT,     -- p_customer_notes
    numeric,  -- p_pet_age_years
    TEXT      -- p_surname
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
    text,  -- p_admin_notes
    numeric, -- p_pet_age_years
    text   -- p_surname
);

-- 1. Create submit_booking_request
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
    p_pet_age_years numeric DEFAULT NULL,
    p_surname TEXT DEFAULT NULL
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

    -- Fallbacks
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

    -- Calculate end time
    v_end_time := p_start_time + (v_duration || ' minutes')::interval;

    -- 4. Advance Notice Validations
    IF p_start_time < (NOW() + (v_min_notice || ' hours')::interval) THEN
        RETURN json_build_object('success', false, 'error', 'Booking too soon');
    END IF;

    IF p_start_time > (NOW() + (v_max_advance || ' days')::interval) THEN
        RETURN json_build_object('success', false, 'error', 'Booking too far ahead');
    END IF;

    -- 5. Opening Hours Validation
    v_local_start_time := (p_start_time AT TIME ZONE v_tz)::time;
    v_local_end_time := (v_end_time AT TIME ZONE v_tz)::time;
    v_start_date := (p_start_time AT TIME ZONE v_tz)::date;
    v_end_date := (v_end_time AT TIME ZONE v_tz)::date;
    
    IF v_start_date != v_end_date THEN
        RETURN json_build_object('success', false, 'error', 'Outside opening hours');
    END IF;

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

    -- 6. Atomic sub-transaction block
    BEGIN
        -- Find or create customer
        SELECT id INTO v_customer_id FROM customers WHERE business_id = p_business_id AND phone = TRIM(p_phone) LIMIT 1;
        IF v_customer_id IS NULL THEN
            INSERT INTO customers (business_id, full_name, phone, email, surname) 
            VALUES (
                p_business_id, 
                TRIM(p_full_name), 
                TRIM(p_phone), 
                NULLIF(TRIM(COALESCE(p_email, '')), ''),
                NULLIF(TRIM(COALESCE(p_surname, '')), '')
            )
            RETURNING id INTO v_customer_id;
        ELSE
            -- Non-destructive updates: only fill missing surname/email fields
            UPDATE customers 
            SET 
                surname = COALESCE(NULLIF(TRIM(surname), ''), NULLIF(TRIM(COALESCE(p_surname, '')), '')),
                email = COALESCE(NULLIF(TRIM(email), ''), NULLIF(TRIM(COALESCE(p_email, '')), ''))
            WHERE id = v_customer_id;
        END IF;

        -- Find or create pet
        SELECT id INTO v_pet_id 
        FROM pets 
        WHERE customer_id = v_customer_id 
          AND business_id = p_business_id 
          AND LOWER(TRIM(name)) = LOWER(TRIM(p_pet_name))
        LIMIT 1;

        IF v_pet_id IS NOT NULL THEN
            -- Update missing pet fields only if safe
            UPDATE pets
            SET
                breed = COALESCE(NULLIF(TRIM(breed), ''), NULLIF(TRIM(COALESCE(p_pet_breed, '')), '')),
                size = COALESCE(NULLIF(TRIM(size), ''), NULLIF(TRIM(COALESCE(p_pet_size, '')), '')),
                notes = COALESCE(NULLIF(TRIM(notes), ''), NULLIF(TRIM(COALESCE(p_pet_notes, '')), '')),
                age_years = COALESCE(age_years, p_pet_age_years)
            WHERE id = v_pet_id;
        ELSE
            -- Create a new pet
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
        END IF;

        -- Create booking
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

        RETURN json_build_object('success', true, 'booking_id', v_booking_id);

    EXCEPTION 
        WHEN exclusion_violation THEN
            RETURN json_build_object('success', false, 'error', 'Slot already taken');
        WHEN raise_exception THEN
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

REVOKE EXECUTE ON FUNCTION public.submit_booking_request(
    uuid, text, text, text, text, text, text, text, uuid, timestamptz, text, numeric, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_booking_request(
    uuid, text, text, text, text, text, text, text, uuid, timestamptz, text, numeric, text
) TO anon, authenticated;


-- 2. Create admin_submit_booking
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
    p_pet_age_years numeric DEFAULT NULL,
    p_surname text DEFAULT NULL
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
    -- 1. Input parameters validation
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

    -- 2. Determine business_id
    v_business_id := get_user_business_id();
    IF v_business_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Admin profile not found');
    END IF;

    -- 3. Load business settings
    SELECT timezone, min_notice_hours, max_advance_days
    INTO v_tz, v_min_notice, v_max_advance
    FROM business_settings
    WHERE business_id = v_business_id;

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

    -- Calculate end_time
    v_end_time := p_start_time + (v_duration || ' minutes')::interval;

    -- 6. Opening hours validation
    v_local_start_time := (p_start_time AT TIME ZONE v_tz)::time;
    v_local_end_time := (v_end_time AT TIME ZONE v_tz)::time;
    v_start_date := (p_start_time AT TIME ZONE v_tz)::date;
    v_end_date := (v_end_time AT TIME ZONE v_tz)::date;

    IF v_start_date != v_end_date THEN
        RETURN json_build_object('success', false, 'error', 'Outside opening hours');
    END IF;

    v_day_of_week := EXTRACT(DOW FROM (p_start_time AT TIME ZONE v_tz))::int;

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

    -- 7. Execute writes atomically
    BEGIN
        -- Find or create customer
        SELECT id INTO v_customer_id 
        FROM customers 
        WHERE business_id = v_business_id 
          AND phone = TRIM(p_phone) 
        LIMIT 1;

        IF v_customer_id IS NULL THEN
            INSERT INTO customers (business_id, full_name, phone, email, surname)
            VALUES (
                v_business_id, 
                TRIM(p_full_name), 
                TRIM(p_phone), 
                NULLIF(TRIM(COALESCE(p_email, '')), ''),
                NULLIF(TRIM(COALESCE(p_surname, '')), '')
            )
            RETURNING id INTO v_customer_id;
        ELSE
            -- Non-destructive updates: only fill missing surname/email fields
            UPDATE customers 
            SET 
                surname = COALESCE(NULLIF(TRIM(surname), ''), NULLIF(TRIM(COALESCE(p_surname, '')), '')),
                email = COALESCE(NULLIF(TRIM(email), ''), NULLIF(TRIM(COALESCE(p_email, '')), ''))
            WHERE id = v_customer_id;
        END IF;

        -- Find or create pet
        SELECT id INTO v_pet_id 
        FROM pets 
        WHERE customer_id = v_customer_id 
          AND business_id = v_business_id 
          AND LOWER(TRIM(name)) = LOWER(TRIM(p_pet_name))
        LIMIT 1;

        IF v_pet_id IS NOT NULL THEN
            -- Update missing pet fields only if safe
            UPDATE pets
            SET
                breed = COALESCE(NULLIF(TRIM(breed), ''), NULLIF(TRIM(COALESCE(p_pet_breed, '')), '')),
                size = COALESCE(NULLIF(TRIM(size), ''), NULLIF(TRIM(COALESCE(p_pet_size, '')), '')),
                notes = COALESCE(NULLIF(TRIM(notes), ''), NULLIF(TRIM(COALESCE(p_pet_notes, '')), '')),
                age_years = COALESCE(age_years, p_pet_age_years)
            WHERE id = v_pet_id;
        ELSE
            -- Create a new pet
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
        END IF;

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

        RETURN json_build_object('success', true, 'booking_id', v_booking_id);

    EXCEPTION
        WHEN exclusion_violation THEN
            RETURN json_build_object('success', false, 'error', 'Slot already taken');
        WHEN raise_exception THEN
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

REVOKE EXECUTE ON FUNCTION public.admin_submit_booking(
    text, text, text, text, text, text, text, uuid, timestamptz, text, text, text, numeric, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_submit_booking(
    text, text, text, text, text, text, text, uuid, timestamptz, text, text, text, numeric, text
) TO authenticated;
