-- Create a new SECURITY DEFINER function to securely fetch booking slots for public users.
-- This function runs with the privileges of its owner (superuser), allowing it to query
-- the bookings and blocked_slots tables internally while returning only anonymized slot availability.

CREATE OR REPLACE FUNCTION public.get_public_available_slots(
    p_business_id UUID,
    p_service_id UUID,
    p_date DATE
) RETURNS json 
SET search_path = public AS $$
DECLARE
    v_tz TEXT;
    v_interval INT;
    v_min_notice INT;
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
    -- 1. Validate required inputs early
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

    -- 2. Validate business existence
    IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
        RETURN json_build_object(
            'slots', json_build_array(),
            'reason', 'Invalid business.',
            'hasFullDayClosure', false,
            'hasPartialClosure', false
        );
    END IF;

    -- 3. Fetch business settings
    SELECT timezone, slot_interval_minutes, min_notice_hours, max_advance_days
    INTO v_tz, v_interval, v_min_notice, v_max_advance
    FROM business_settings
    WHERE business_id = p_business_id;

    -- Harden settings variables
    v_tz := COALESCE(v_tz, 'Africa/Johannesburg');
    
    IF v_interval IS NULL OR v_interval < 5 THEN
        v_interval := 30;
    END IF;
    
    IF v_min_notice IS NULL OR v_min_notice < 0 THEN
        v_min_notice := 2;
    END IF;
    
    IF v_max_advance IS NULL OR v_max_advance < 1 THEN
        v_max_advance := 60;
    END IF;

    -- 4. Check bounds for p_date
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

    -- 5. Fetch opening hours
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

    -- 6. Validate service details
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

    -- 7. Compute UTC range bounds for the day
    v_start_of_day_utc := p_date::timestamp AT TIME ZONE v_tz;
    v_end_of_day_utc := (p_date::timestamp + INTERVAL '23 hours 59 minutes 59 seconds') AT TIME ZONE v_tz;

    -- 8. Check blocked slots for closures
    -- Full day closure check
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

    -- 9. Generate slots
    v_start_minutes := EXTRACT(HOUR FROM v_open_time)::int * 60 + EXTRACT(MINUTE FROM v_open_time)::int;
    v_close_minutes := EXTRACT(HOUR FROM v_close_time)::int * 60 + EXTRACT(MINUTE FROM v_close_time)::int;
    v_earliest_allowed := NOW() + (v_min_notice || ' hours')::interval;

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

-- Limit execution permissions to prevent unauthorized access
REVOKE EXECUTE ON FUNCTION public.get_public_available_slots(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_available_slots(UUID, UUID, DATE) TO anon, authenticated;
