-- Migration: Add get_admin_available_slots RPC and update admin_submit_booking notice validation

-- 1. Create get_admin_available_slots function
CREATE OR REPLACE FUNCTION public.get_admin_available_slots(
    p_business_id UUID,
    p_service_id UUID,
    p_date DATE
) RETURNS json 
SET search_path = public AS $$
DECLARE
    v_tz TEXT;
    v_interval INT := 10; -- Hardcode 10-minute intervals for admin booking
    v_max_advance INT;
    
    v_today_local DATE;
    v_max_allowed_date DATE;
    v_day_of_week INT;
    
    v_open_time TIME;
    v_close_time TIME;
    v_is_closed BOOLEAN;
    
    v_duration INT;
    v_service_active BOOLEAN;
    
    v_start_of_day_utc TIMESTAMPTZ;
    v_end_of_day_utc TIMESTAMPTZ;
    
    v_has_full_day_closure BOOLEAN := FALSE;
    v_has_partial_closure BOOLEAN := FALSE;
    
    v_start_minutes INT;
    v_close_minutes INT;
    v_min INT;
    
    v_slot_start_local TIMESTAMP;
    v_slot_end_local TIMESTAMP;
    v_slot_start_utc TIMESTAMPTZ;
    v_slot_end_utc TIMESTAMPTZ;
    v_earliest_allowed TIMESTAMPTZ;
    
    v_slot_label TEXT;
    v_slots_json JSONB := '[]'::jsonb;
    v_overlaps_booking BOOLEAN;
    v_overlaps_blocked BOOLEAN;
BEGIN
    -- Validate required inputs early
    IF p_business_id IS NULL THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'Invalid business.',
            'hasFullDayClosure', false,
            'hasPartialClosure', false
        );
    END IF;
    IF p_service_id IS NULL THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'Invalid service.',
            'hasFullDayClosure', false,
            'hasPartialClosure', false
        );
    END IF;
    IF p_date IS NULL THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'Invalid date.',
            'hasFullDayClosure', false,
            'hasPartialClosure', false
        );
    END IF;

    -- Validate business existence
    IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'Invalid business.',
            'hasFullDayClosure', false,
            'hasPartialClosure', false
        );
    END IF;

    -- Fetch business settings
    SELECT timezone, max_advance_days
    INTO v_tz, v_max_advance
    FROM business_settings
    WHERE business_id = p_business_id;

    -- Harden settings variables
    v_tz := COALESCE(v_tz, 'Africa/Johannesburg');
    
    IF v_max_advance IS NULL OR v_max_advance < 1 THEN
        v_max_advance := 60;
    END IF;

    -- Check bounds for p_date
    v_today_local := (NOW() AT TIME ZONE v_tz)::date;
    IF p_date < v_today_local THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'Selected date is in the past.',
            'hasFullDayClosure', false,
            'hasPartialClosure', false
        );
    END IF;

    v_max_allowed_date := v_today_local + v_max_advance;
    IF p_date > v_max_allowed_date THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'Selected date exceeds the maximum advance booking limit.',
            'hasFullDayClosure', false,
            'hasPartialClosure', false
        );
    END IF;

    -- Fetch opening hours
    v_day_of_week := EXTRACT(DOW FROM p_date)::int;
    SELECT open_time, close_time, is_closed
    INTO v_open_time, v_close_time, v_is_closed
    FROM business_opening_hours
    WHERE business_id = p_business_id AND day_of_week = v_day_of_week;

    IF NOT FOUND OR v_is_closed = TRUE OR v_open_time IS NULL OR v_close_time IS NULL THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'The business is closed on this day.',
            'hasFullDayClosure', false,
            'hasPartialClosure', false
        );
    END IF;

    -- Validate service details
    SELECT duration_minutes, is_active
    INTO v_duration, v_service_active
    FROM services
    WHERE id = p_service_id AND business_id = p_business_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'Grooming service not found.',
            'hasFullDayClosure', false,
            'hasPartialClosure', false
        );
    END IF;

    IF v_duration IS NULL OR v_duration <= 0 OR v_service_active = FALSE THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'This grooming service is currently inactive.',
            'hasFullDayClosure', false,
            'hasPartialClosure', false
        );
    END IF;

    -- Compute UTC range bounds for the day
    v_start_of_day_utc := p_date::timestamp AT TIME ZONE v_tz;
    v_end_of_day_utc := (p_date::timestamp + INTERVAL '23 hours 59 minutes 59 seconds') AT TIME ZONE v_tz;

    -- Check blocked slots for closures
    IF EXISTS (
        SELECT 1 FROM blocked_slots
        WHERE business_id = p_business_id
          AND start_time <= v_start_of_day_utc + INTERVAL '1 minute'
          AND end_time >= v_end_of_day_utc - INTERVAL '1 minute'
    ) THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'The parlour is unavailable on this date. Please choose another day.',
            'hasFullDayClosure', true,
            'hasPartialClosure', false
        );
    END IF;

    -- Partial closure check
    IF EXISTS (
        SELECT 1 FROM blocked_slots
        WHERE business_id = p_business_id
          AND start_time < v_end_of_day_utc
          AND end_time > v_start_of_day_utc
    ) THEN
        v_has_partial_closure := TRUE;
    END IF;

    -- Generate slots
    v_start_minutes := EXTRACT(HOUR FROM v_open_time)::int * 60 + EXTRACT(MINUTE FROM v_open_time)::int;
    v_close_minutes := EXTRACT(HOUR FROM v_close_time)::int * 60 + EXTRACT(MINUTE FROM v_close_time)::int;
    
    -- Earliest allowed is up to 10 minutes in the past to support urgent same-day bookings
    v_earliest_allowed := NOW() - INTERVAL '10 minutes';

    v_min := v_start_minutes;
    WHILE v_min + v_duration <= v_close_minutes LOOP
        v_slot_start_local := p_date::timestamp + (v_min || ' minutes')::interval;
        v_slot_end_local := v_slot_start_local + (v_duration || ' minutes')::interval;
        
        v_slot_start_utc := v_slot_start_local AT TIME ZONE v_tz;
        v_slot_end_utc := v_slot_end_local AT TIME ZONE v_tz;

        -- Notice period check
        IF v_slot_start_utc >= v_earliest_allowed THEN
            -- Check booking overlaps
            SELECT EXISTS (
                SELECT 1 FROM bookings
                WHERE business_id = p_business_id
                  AND status IN ('pending', 'confirmed')
                  AND start_time < v_slot_end_utc
                  AND end_time > v_slot_start_utc
            ) INTO v_overlaps_booking;

            IF NOT v_overlaps_booking THEN
                -- Check blocked slot overlaps
                SELECT EXISTS (
                    SELECT 1 FROM blocked_slots
                    WHERE business_id = p_business_id
                      AND start_time < v_slot_end_utc
                      AND end_time > v_slot_start_utc
                ) INTO v_overlaps_blocked;

                IF NOT v_overlaps_blocked THEN
                    v_slot_label := TO_CHAR(v_slot_start_local, 'HH24:MI');
                    v_slots_json := v_slots_json || jsonb_build_array(jsonb_build_object(
                        'start_time', v_slot_start_utc,
                        'end_time', v_slot_end_utc,
                        'label', v_slot_label,
                        'disabled', false
                    ));
                END IF;
            END IF;
        END IF;

        v_min := v_min + v_interval;
    END LOOP;

    RETURN json_build_object(
        'slots', v_slots_json,
        'reason', NULL,
        'hasFullDayClosure', false,
        'hasPartialClosure', (v_has_partial_closure AND jsonb_array_length(v_slots_json) > 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set exact permissions for get_admin_available_slots
REVOKE EXECUTE ON FUNCTION public.get_admin_available_slots(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_available_slots(UUID, UUID, DATE) TO authenticated;


-- 2. Update admin_submit_booking function to bypass public notice checks
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
    p_surname text DEFAULT NULL,
    p_pet_species text DEFAULT NULL
) RETURNS json
SET search_path = public AS $$
DECLARE
    v_business_id uuid;
    v_duration int;
    v_end_time timestamptz;
    v_customer_id uuid;
    v_household_id uuid;
    v_pet_id uuid;
    v_booking_id uuid;
    v_tz text;
    v_max_advance int;
    v_local_start_time time;
    v_local_end_time time;
    v_start_date date;
    v_end_date date;
    v_day_of_week int;
    v_open_time time;
    v_close_time time;
    v_is_closed boolean;
    
    v_normalized_phone TEXT;
    v_submitted_display_name TEXT;
    v_stored_display_name TEXT;
    v_stored_full_name TEXT;
    v_stored_surname TEXT;
    v_member_exists BOOLEAN;
BEGIN
    IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN RETURN json_build_object('success', false, 'error', 'Missing customer name'); END IF;
    IF p_phone IS NULL OR TRIM(p_phone) = '' THEN RETURN json_build_object('success', false, 'error', 'Missing phone'); END IF;
    IF p_pet_name IS NULL OR TRIM(p_pet_name) = '' THEN RETURN json_build_object('success', false, 'error', 'Missing pet name'); END IF;
    IF p_service_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Missing service'); END IF;
    IF p_start_time IS NULL THEN RETURN json_build_object('success', false, 'error', 'Missing start time'); END IF;
    IF p_source IS NULL OR TRIM(p_source) = '' OR p_source NOT IN ('phone', 'walk_in', 'admin') THEN RETURN json_build_object('success', false, 'error', 'Invalid source'); END IF;
    
    IF p_pet_age_years IS NOT NULL AND (p_pet_age_years < 0 OR p_pet_age_years > 40) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid dog age');
    END IF;

    IF p_pet_species IS NOT NULL AND TRIM(p_pet_species) != '' AND LOWER(TRIM(p_pet_species)) NOT IN ('dog', 'cat', 'other') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid pet species');
    END IF;

    -- Validate Phone Normalization
    v_normalized_phone := public.normalize_sa_phone(p_phone);
    IF v_normalized_phone IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid phone number format');
    END IF;

    v_business_id := get_user_business_id();
    IF v_business_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Admin profile not found'); END IF;

    SELECT timezone, max_advance_days INTO v_tz, v_max_advance
    FROM business_settings WHERE business_id = v_business_id;

    IF v_tz IS NULL THEN v_tz := 'Africa/Johannesburg'; v_max_advance := 60; END IF;

    -- Limit past bookings to the 10-minute grace window
    IF p_start_time < (NOW() - INTERVAL '10 minutes') THEN 
        RETURN json_build_object('success', false, 'error', 'Booking time has already passed.'); 
    END IF;
    
    -- Check if booking exceeds maximum advance days
    IF p_start_time > (NOW() + (v_max_advance || ' days')::interval) THEN 
        RETURN json_build_object('success', false, 'error', 'Booking too far ahead'); 
    END IF;

    SELECT duration_minutes INTO v_duration FROM services 
    WHERE id = p_service_id AND business_id = v_business_id AND is_active = true;

    IF v_duration IS NULL THEN RETURN json_build_object('success', false, 'error', 'Invalid service'); END IF;
    v_end_time := p_start_time + (v_duration || ' minutes')::interval;

    v_local_start_time := (p_start_time AT TIME ZONE v_tz)::time;
    v_local_end_time := (v_end_time AT TIME ZONE v_tz)::time;
    v_start_date := (p_start_time AT TIME ZONE v_tz)::date;
    v_end_date := (v_end_time AT TIME ZONE v_tz)::date;

    IF v_start_date != v_end_date THEN RETURN json_build_object('success', false, 'error', 'Outside opening hours'); END IF;
    v_day_of_week := EXTRACT(DOW FROM (p_start_time AT TIME ZONE v_tz))::int;

    SELECT open_time, close_time, is_closed INTO v_open_time, v_close_time, v_is_closed
    FROM business_opening_hours WHERE business_id = v_business_id AND day_of_week = v_day_of_week;

    IF NOT FOUND OR v_is_closed = TRUE OR v_local_start_time < v_open_time OR v_local_end_time > v_close_time THEN
        RETURN json_build_object('success', false, 'error', 'Outside opening hours');
    END IF;

    BEGIN
        SELECT id, household_id, full_name, surname 
        INTO v_customer_id, v_household_id, v_stored_full_name, v_stored_surname
        FROM customers WHERE business_id = v_business_id AND normalized_phone = v_normalized_phone LIMIT 1;

        IF v_customer_id IS NULL THEN
            INSERT INTO households (business_id, name)
            VALUES (v_business_id, COALESCE(NULLIF(TRIM(p_surname), ''), TRIM(p_full_name)) || ' Household')
            RETURNING id INTO v_household_id;

            INSERT INTO customers (business_id, full_name, phone, email, surname, household_id, normalized_phone)
            VALUES (
                v_business_id, TRIM(p_full_name), TRIM(p_phone), 
                NULLIF(TRIM(COALESCE(p_email, '')), ''), NULLIF(TRIM(COALESCE(p_surname, '')), ''),
                v_household_id, v_normalized_phone
            )
            RETURNING id INTO v_customer_id;
        ELSE
            v_submitted_display_name := TRIM(p_full_name);
            IF p_surname IS NOT NULL AND TRIM(p_surname) != '' THEN
                v_submitted_display_name := v_submitted_display_name || ' ' || TRIM(p_surname);
            END IF;
            v_submitted_display_name := TRIM(v_submitted_display_name);

            v_stored_full_name := COALESCE(NULLIF(TRIM(v_stored_full_name), ''), NULLIF(TRIM(p_full_name), ''));
            v_stored_surname := COALESCE(NULLIF(TRIM(v_stored_surname), ''), NULLIF(TRIM(COALESCE(p_surname, '')), ''));

            UPDATE customers SET 
                full_name = v_stored_full_name,
                surname = v_stored_surname,
                email = COALESCE(NULLIF(TRIM(email), ''), NULLIF(TRIM(COALESCE(p_email, '')), ''))
            WHERE id = v_customer_id;
            
            IF v_household_id IS NULL THEN
                INSERT INTO households (business_id, name)
                VALUES (v_business_id, COALESCE(NULLIF(TRIM(v_stored_surname), ''), TRIM(v_stored_full_name)) || ' Household')
                RETURNING id INTO v_household_id;
                
                UPDATE customers SET household_id = v_household_id WHERE id = v_customer_id;
            END IF;

            v_stored_display_name := TRIM(COALESCE(v_stored_full_name, ''));
            IF v_stored_surname IS NOT NULL AND TRIM(v_stored_surname) != '' THEN
                v_stored_display_name := v_stored_display_name || ' ' || TRIM(v_stored_surname);
            END IF;
            v_stored_display_name := TRIM(v_stored_display_name);

            IF v_submitted_display_name != '' AND LOWER(v_submitted_display_name) != LOWER(v_stored_display_name) THEN
                SELECT EXISTS (
                    SELECT 1 FROM households 
                    WHERE id = v_household_id 
                      AND EXISTS (
                          SELECT 1 FROM unnest(household_member_names) AS m 
                          WHERE LOWER(TRIM(m)) = LOWER(TRIM(v_submitted_display_name))
                      )
                ) INTO v_member_exists;

                IF NOT v_member_exists THEN
                    UPDATE households 
                    SET household_member_names = array_append(household_member_names, TRIM(v_submitted_display_name))
                    WHERE id = v_household_id;
                END IF;
            END IF;
        END IF;

        v_pet_id := NULL;
        IF v_household_id IS NOT NULL THEN
            SELECT id INTO v_pet_id FROM pets 
            WHERE household_id = v_household_id AND business_id = v_business_id AND is_active = true 
              AND LOWER(TRIM(name)) = LOWER(TRIM(p_pet_name)) LIMIT 1;
        END IF;

        IF v_pet_id IS NULL THEN
            SELECT id INTO v_pet_id FROM pets 
            WHERE customer_id = v_customer_id AND business_id = v_business_id AND is_active = true 
              AND LOWER(TRIM(name)) = LOWER(TRIM(p_pet_name)) LIMIT 1;
        END IF;

        IF v_pet_id IS NOT NULL THEN
            UPDATE pets SET
                breed = COALESCE(NULLIF(TRIM(breed), ''), NULLIF(TRIM(COALESCE(p_pet_breed, '')), '')),
                size = COALESCE(NULLIF(TRIM(size), ''), NULLIF(TRIM(COALESCE(p_pet_size, '')), '')),
                notes = COALESCE(NULLIF(TRIM(notes), ''), NULLIF(TRIM(COALESCE(p_pet_notes, '')), '')),
                species = COALESCE(NULLIF(TRIM(species), ''), NULLIF(TRIM(LOWER(p_pet_species)), ''), 'dog'),
                age_years = COALESCE(p_pet_age_years, age_years)
            WHERE id = v_pet_id;
        ELSE
            INSERT INTO pets (business_id, customer_id, household_id, name, breed, size, notes, age_years, species, is_active)
            VALUES (
                v_business_id, v_customer_id, v_household_id, TRIM(p_pet_name), 
                NULLIF(TRIM(COALESCE(p_pet_breed, '')), ''), NULLIF(TRIM(COALESCE(p_pet_size, '')), ''), 
                NULLIF(TRIM(COALESCE(p_pet_notes, '')), ''), p_pet_age_years,
                COALESCE(NULLIF(TRIM(LOWER(p_pet_species)), ''), 'dog'), true
            )
            RETURNING id INTO v_pet_id;
        END IF;

        INSERT INTO customer_pets (customer_id, pet_id, business_id, relationship)
        VALUES (v_customer_id, v_pet_id, v_business_id, 'owner')
        ON CONFLICT (customer_id, pet_id) DO NOTHING;

        INSERT INTO bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source, customer_notes, admin_notes)
        VALUES (
            v_business_id, v_customer_id, v_pet_id, p_service_id, p_start_time, v_end_time, 
            'confirmed', p_source, NULLIF(TRIM(COALESCE(p_customer_notes, '')), ''), NULLIF(TRIM(COALESCE(p_admin_notes, '')), '')
        )
        RETURNING id INTO v_booking_id;

        RETURN json_build_object('success', true, 'booking_id', v_booking_id);

    EXCEPTION 
        WHEN exclusion_violation THEN RETURN json_build_object('success', false, 'error', 'Slot already taken');
        WHEN raise_exception THEN
            IF SQLERRM = 'Slot is blocked' THEN RETURN json_build_object('success', false, 'error', 'Slot is blocked');
            ELSIF SQLERRM = 'Service is not active' THEN RETURN json_build_object('success', false, 'error', 'Invalid service');
            ELSE RETURN json_build_object('success', false, 'error', SQLERRM);
            END IF;
        WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', 'An unexpected error occurred: ' || SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set exact permissions for admin_submit_booking
REVOKE EXECUTE ON FUNCTION public.admin_submit_booking(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_submit_booking(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
