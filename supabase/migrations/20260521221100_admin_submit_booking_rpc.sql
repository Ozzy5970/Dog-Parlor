-- Create the secure, atomic admin booking RPC function with pre-write validation rules
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
    p_admin_notes text
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
        INSERT INTO pets (business_id, customer_id, name, breed, size, notes)
        VALUES (
            v_business_id, 
            v_customer_id, 
            TRIM(p_pet_name), 
            NULLIF(TRIM(COALESCE(p_pet_breed, '')), ''), 
            NULLIF(TRIM(COALESCE(p_pet_size, '')), ''), 
            NULLIF(TRIM(COALESCE(p_pet_notes, '')), '')
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

-- Lock down execution permissions
REVOKE EXECUTE ON FUNCTION public.admin_submit_booking FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_submit_booking TO authenticated;
