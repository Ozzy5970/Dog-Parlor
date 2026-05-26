-- Migration: Add character length limit validations to submit_booking_request inputs

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
    p_surname TEXT DEFAULT NULL,
    p_pet_species TEXT DEFAULT NULL
) RETURNS json 
SET search_path = public AS $$
DECLARE
    v_customer_id UUID;
    v_household_id UUID;
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
    
    v_normalized_phone TEXT;
    v_submitted_display_name TEXT;
    v_stored_display_name TEXT;
    v_stored_full_name TEXT;
    v_stored_surname TEXT;
    v_member_exists BOOLEAN;
BEGIN
    -- Early required input validations
    IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN RETURN json_build_object('success', false, 'error', 'Missing customer name'); END IF;
    IF p_phone IS NULL OR TRIM(p_phone) = '' THEN RETURN json_build_object('success', false, 'error', 'Missing phone'); END IF;
    IF p_pet_name IS NULL OR TRIM(p_pet_name) = '' THEN RETURN json_build_object('success', false, 'error', 'Missing pet name'); END IF;
    IF p_service_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Missing service'); END IF;
    IF p_start_time IS NULL THEN RETURN json_build_object('success', false, 'error', 'Missing start time'); END IF;

    -- Length checks to prevent abnormally large inputs (DoS protection)
    IF char_length(p_full_name) > 80 THEN RETURN json_build_object('success', false, 'error', 'Name must not exceed 80 characters'); END IF;
    IF p_surname IS NOT NULL AND char_length(p_surname) > 80 THEN RETURN json_build_object('success', false, 'error', 'Surname must not exceed 80 characters'); END IF;
    IF char_length(p_phone) > 30 THEN RETURN json_build_object('success', false, 'error', 'Phone number must not exceed 30 characters'); END IF;
    IF p_email IS NOT NULL AND char_length(p_email) > 120 THEN RETURN json_build_object('success', false, 'error', 'Email address must not exceed 120 characters'); END IF;
    IF char_length(p_pet_name) > 80 THEN RETURN json_build_object('success', false, 'error', 'Pet name must not exceed 80 characters'); END IF;
    IF p_pet_breed IS NOT NULL AND char_length(p_pet_breed) > 80 THEN RETURN json_build_object('success', false, 'error', 'Breed must not exceed 80 characters'); END IF;
    IF p_customer_notes IS NOT NULL AND char_length(p_customer_notes) > 500 THEN RETURN json_build_object('success', false, 'error', 'Customer notes must not exceed 500 characters'); END IF;
    IF p_pet_notes IS NOT NULL AND char_length(p_pet_notes) > 500 THEN RETURN json_build_object('success', false, 'error', 'Pet notes must not exceed 500 characters'); END IF;

    -- Validate Phone Normalization
    v_normalized_phone := public.normalize_sa_phone(p_phone);
    IF v_normalized_phone IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid phone number format');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid business');
    END IF;

    IF p_pet_age_years IS NOT NULL AND (p_pet_age_years < 0 OR p_pet_age_years > 40) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid dog age');
    END IF;

    IF p_pet_species IS NOT NULL AND TRIM(p_pet_species) != '' AND LOWER(TRIM(p_pet_species)) NOT IN ('dog', 'cat', 'other') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid pet species');
    END IF;

    -- Fetch settings
    SELECT timezone, min_notice_minutes, max_advance_days INTO v_tz, v_min_notice, v_max_advance
    FROM business_settings WHERE business_id = p_business_id;

    IF v_tz IS NULL THEN v_tz := 'Africa/Johannesburg'; v_min_notice := 5; v_max_advance := 60; END IF;
    IF v_min_notice IS NULL OR v_min_notice < 0 THEN v_min_notice := 5; END IF;

    SELECT duration_minutes INTO v_duration FROM services 
    WHERE id = p_service_id AND business_id = p_business_id AND is_active = true;

    IF v_duration IS NULL THEN RETURN json_build_object('success', false, 'error', 'Invalid service'); END IF;
    v_end_time := p_start_time + (v_duration || ' minutes')::interval;

    -- Notice Validation
    IF p_start_time < (NOW() + (v_min_notice || ' minutes')::interval) THEN RETURN json_build_object('success', false, 'error', 'Booking too soon'); END IF;
    IF p_start_time > (NOW() + (v_max_advance || ' days')::interval) THEN RETURN json_build_object('success', false, 'error', 'Booking too far ahead'); END IF;

    v_local_start_time := (p_start_time AT TIME ZONE v_tz)::time;
    v_local_end_time := (v_end_time AT TIME ZONE v_tz)::time;
    v_start_date := (p_start_time AT TIME ZONE v_tz)::date;
    v_end_date := (v_end_time AT TIME ZONE v_tz)::date;
    
    IF v_start_date != v_end_date THEN RETURN json_build_object('success', false, 'error', 'Outside opening hours'); END IF;
    v_day_of_week := EXTRACT(DOW FROM (p_start_time AT TIME ZONE v_tz))::int;

    SELECT open_time, close_time, is_closed INTO v_open_time, v_close_time, v_is_closed
    FROM business_opening_hours WHERE business_id = p_business_id AND day_of_week = v_day_of_week;

    IF NOT FOUND OR v_is_closed = TRUE OR v_local_start_time < v_open_time OR v_local_end_time > v_close_time THEN
        RETURN json_build_object('success', false, 'error', 'Outside opening hours');
    END IF;

    BEGIN
        -- Find Customer by business_id and normalized_phone
        SELECT id, household_id, full_name, surname 
        INTO v_customer_id, v_household_id, v_stored_full_name, v_stored_surname
        FROM customers WHERE business_id = p_business_id AND normalized_phone = v_normalized_phone LIMIT 1;
        
        IF v_customer_id IS NULL THEN
            INSERT INTO households (business_id, name)
            VALUES (p_business_id, COALESCE(NULLIF(TRIM(p_surname), ''), TRIM(p_full_name)) || ' Household')
            RETURNING id INTO v_household_id;

            INSERT INTO customers (business_id, full_name, phone, email, surname, household_id, normalized_phone) 
            VALUES (
                p_business_id, TRIM(p_full_name), TRIM(p_phone), 
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
                VALUES (p_business_id, COALESCE(NULLIF(TRIM(v_stored_surname), ''), TRIM(v_stored_full_name)) || ' Household')
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
            WHERE household_id = v_household_id AND business_id = p_business_id AND is_active = true 
              AND LOWER(TRIM(name)) = LOWER(TRIM(p_pet_name)) LIMIT 1;
        END IF;

        IF v_pet_id IS NULL THEN
            SELECT id INTO v_pet_id FROM pets 
            WHERE customer_id = v_customer_id AND business_id = p_business_id AND is_active = true 
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
                p_business_id, v_customer_id, v_household_id, TRIM(p_pet_name), 
                NULLIF(TRIM(COALESCE(p_pet_breed, '')), ''), NULLIF(TRIM(COALESCE(p_pet_size, '')), ''), 
                NULLIF(TRIM(COALESCE(p_pet_notes, '')), ''), p_pet_age_years,
                COALESCE(NULLIF(TRIM(LOWER(p_pet_species)), ''), 'dog'), true
            )
            RETURNING id INTO v_pet_id;
        END IF;

        INSERT INTO customer_pets (customer_id, pet_id, business_id, relationship)
        VALUES (v_customer_id, v_pet_id, p_business_id, 'owner')
        ON CONFLICT (customer_id, pet_id) DO NOTHING;

        INSERT INTO bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source, customer_notes)
        VALUES (
            p_business_id, v_customer_id, v_pet_id, p_service_id, p_start_time, v_end_time, 
            'pending', 'online', NULLIF(TRIM(COALESCE(p_customer_notes, '')), '')
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

REVOKE EXECUTE ON FUNCTION public.submit_booking_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_booking_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT, NUMERIC, TEXT, TEXT) TO anon, authenticated;
