-- Supabase Migration: Strict Booking Lifecycle, Payment Method, and Checkout Flow
-- Created: 2026-06-02

-- 1. Alter check constraint on bookings status
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check 
    CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'no_show', 'arrived', 'completed'));

-- 2. Add payment and timestamp columns to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'card')) DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Recreate prevent_double_bookings exclusion constraint to include arrived/completed and prevent double-booking
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS prevent_double_bookings;
ALTER TABLE public.bookings
ADD CONSTRAINT prevent_double_bookings
EXCLUDE USING gist (
    business_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
) WHERE (status IN ('pending', 'confirmed', 'arrived', 'completed'));

-- 4. Recreate check_booking_against_blocked_slots trigger function
CREATE OR REPLACE FUNCTION public.check_booking_against_blocked_slots()
RETURNS TRIGGER 
SET search_path = public AS $$
BEGIN
    IF NEW.status IN ('pending', 'confirmed', 'arrived', 'completed') THEN
        IF EXISTS (
            SELECT 1 FROM blocked_slots bs
            WHERE bs.business_id = NEW.business_id
            AND tstzrange(NEW.start_time, NEW.end_time, '[)') && tstzrange(bs.start_time, bs.end_time, '[)')
        ) THEN
            RAISE EXCEPTION 'Slot is blocked' USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Recreate validate_booking_relationships trigger function
CREATE OR REPLACE FUNCTION public.validate_booking_relationships()
RETURNS TRIGGER 
SET search_path = public AS $$
DECLARE
    v_customer_biz UUID;
    v_cust_hh_id UUID;
    v_pet_biz UUID;
    v_pet_customer UUID;
    v_pet_hh_id UUID;
    v_service_biz UUID;
    v_service_active BOOLEAN;
BEGIN
    -- Validate Customer belongs to the business
    SELECT business_id, household_id INTO v_customer_biz, v_cust_hh_id FROM customers WHERE id = NEW.customer_id;
    IF v_customer_biz IS NULL OR v_customer_biz != NEW.business_id THEN
        RAISE EXCEPTION 'Customer does not belong to the business' USING ERRCODE = 'P0002';
    END IF;

    -- Validate Pet business ownership
    SELECT business_id, customer_id, household_id INTO v_pet_biz, v_pet_customer, v_pet_hh_id FROM pets WHERE id = NEW.pet_id;
    IF v_pet_biz IS NULL OR v_pet_biz != NEW.business_id THEN
        RAISE EXCEPTION 'Pet does not belong to the business' USING ERRCODE = 'P0003';
    END IF;
    
    -- Validate Customer connection to the Pet:
    IF v_pet_customer != NEW.customer_id THEN
        IF v_pet_hh_id IS NULL OR v_cust_hh_id IS NULL OR v_pet_hh_id != v_cust_hh_id THEN
            IF NOT EXISTS (
                SELECT 1 FROM customer_pets 
                WHERE customer_id = NEW.customer_id AND pet_id = NEW.pet_id
            ) THEN
                RAISE EXCEPTION 'Pet does not belong to the selected customer' USING ERRCODE = 'P0004';
            END IF;
        END IF;
    END IF;

    -- Validate Service details
    SELECT business_id, is_active INTO v_service_biz, v_service_active FROM services WHERE id = NEW.service_id;
    IF v_service_biz IS NULL OR v_service_biz != NEW.business_id THEN
        RAISE EXCEPTION 'Service does not belong to the business' USING ERRCODE = 'P0005';
    END IF;
    
    -- Check active status for active booking lifecycles
    IF NEW.status IN ('pending', 'confirmed', 'arrived', 'completed') AND NOT v_service_active THEN
        RAISE EXCEPTION 'Service is not active' USING ERRCODE = 'P0006';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Patch get_public_available_slots to check active status blockages ('pending', 'confirmed', 'arrived', 'completed')
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
    IF p_business_id IS NULL THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Invalid business.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;
    IF p_service_id IS NULL THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Invalid service.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;
    IF p_date IS NULL THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Invalid date.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Invalid business.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    SELECT timezone, slot_interval_minutes, min_notice_minutes, max_advance_days
    INTO v_tz, v_interval, v_min_notice, v_max_advance
    FROM business_settings
    WHERE business_id = p_business_id;

    v_tz := COALESCE(v_tz, 'Africa/Johannesburg');
    
    IF v_interval IS NULL OR v_interval < 5 THEN
        v_interval := 30;
    END IF;
    
    IF v_min_notice IS NULL OR v_min_notice < 0 THEN
        v_min_notice := 5;
    END IF;
    
    IF v_max_advance IS NULL OR v_max_advance < 1 THEN
        v_max_advance := 60;
    END IF;

    v_today_local := (NOW() AT TIME ZONE v_tz)::date;
    IF p_date < v_today_local THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Selected date is in the past.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    v_max_allowed_date := v_today_local + v_max_advance;
    IF p_date > v_max_allowed_date THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Selected date exceeds limit.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    v_day_of_week := EXTRACT(DOW FROM p_date)::int;
    SELECT open_time, close_time, is_closed
    INTO v_open_time, v_close_time, v_is_closed
    FROM business_opening_hours
    WHERE business_id = p_business_id AND day_of_week = v_day_of_week;

    IF NOT FOUND OR v_is_closed = TRUE OR v_open_time IS NULL OR v_close_time IS NULL THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'The business is closed on this day.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    SELECT duration_minutes, is_active
    INTO v_duration, v_service_active
    FROM services
    WHERE id = p_service_id AND business_id = p_business_id;

    IF NOT FOUND THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Service not found.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    IF v_duration IS NULL OR v_duration <= 0 OR v_service_active = FALSE THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Service is inactive.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    v_start_of_day_utc := p_date::timestamp AT TIME ZONE v_tz;
    v_end_of_day_utc := (p_date::timestamp + INTERVAL '23 hours 59 minutes 59 seconds') AT TIME ZONE v_tz;

    IF EXISTS (
        SELECT 1 FROM blocked_slots
        WHERE business_id = p_business_id
          AND start_time <= v_start_of_day_utc + INTERVAL '1 minute'
          AND end_time >= v_end_of_day_utc - INTERVAL '1 minute'
    ) THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'The parlour is unavailable.', 'hasFullDayClosure', true, 'hasPartialClosure', false);
    END IF;

    IF EXISTS (
        SELECT 1 FROM blocked_slots
        WHERE business_id = p_business_id
          AND start_time < v_end_of_day_utc
          AND end_time > v_start_of_day_utc
    ) THEN
        v_has_partial_closure := TRUE;
    END IF;

    v_start_minutes := EXTRACT(HOUR FROM v_open_time)::int * 60 + EXTRACT(MINUTE FROM v_open_time)::int;
    v_close_minutes := EXTRACT(HOUR FROM v_close_time)::int * 60 + EXTRACT(MINUTE FROM v_close_time)::int;
    v_earliest_allowed := NOW() + (v_min_notice || ' minutes')::interval;

    v_min := v_start_minutes;
    WHILE v_min + v_duration <= v_close_minutes LOOP
        v_slot_start_local := p_date::timestamp + (v_min || ' minutes')::interval;
        v_slot_end_local := v_slot_start_local + (v_duration || ' minutes')::interval;
        
        v_slot_start_utc := v_slot_start_local AT TIME ZONE v_tz;
        v_slot_end_utc := v_slot_end_local AT TIME ZONE v_tz;

        IF v_slot_start_utc >= v_earliest_allowed THEN
            -- Check booking overlaps using strict active statuses
            SELECT EXISTS (
                SELECT 1 FROM bookings
                WHERE business_id = p_business_id
                  AND status IN ('pending', 'confirmed', 'arrived', 'completed')
                  AND start_time < v_slot_end_utc
                  AND end_time > v_slot_start_utc
            ) INTO v_overlaps_booking;

            IF NOT v_overlaps_booking THEN
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

    RETURN json_build_object('slots', v_slots_json, 'reason', NULL, 'hasFullDayClosure', false, 'hasPartialClosure', (v_has_partial_closure AND jsonb_array_length(v_slots_json) > 0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Patch get_admin_available_slots to check active status blockages ('pending', 'confirmed', 'arrived', 'completed')
CREATE OR REPLACE FUNCTION public.get_admin_available_slots(
    p_business_id UUID,
    p_service_id UUID,
    p_date DATE
) RETURNS json 
SET search_path = public AS $$
DECLARE
    v_tz TEXT;
    v_interval INT := 10;
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
    IF p_business_id IS NULL THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Invalid business.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;
    IF p_service_id IS NULL THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Invalid service.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;
    IF p_date IS NULL THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Invalid date.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Invalid business.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    SELECT timezone, max_advance_days
    INTO v_tz, v_max_advance
    FROM business_settings
    WHERE business_id = p_business_id;

    v_tz := COALESCE(v_tz, 'Africa/Johannesburg');
    
    IF v_max_advance IS NULL OR v_max_advance < 1 THEN
        v_max_advance := 60;
    END IF;

    v_today_local := (NOW() AT TIME ZONE v_tz)::date;
    IF p_date < v_today_local THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Selected date is in the past.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    v_max_allowed_date := v_today_local + v_max_advance;
    IF p_date > v_max_allowed_date THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Selected date exceeds limit.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    v_day_of_week := EXTRACT(DOW FROM p_date)::int;
    SELECT open_time, close_time, is_closed
    INTO v_open_time, v_close_time, v_is_closed
    FROM business_opening_hours
    WHERE business_id = p_business_id AND day_of_week = v_day_of_week;

    IF NOT FOUND OR v_is_closed = TRUE OR v_open_time IS NULL OR v_close_time IS NULL THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'The business is closed on this day.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    SELECT duration_minutes, is_active
    INTO v_duration, v_service_active
    FROM services
    WHERE id = p_service_id AND business_id = p_business_id;

    IF NOT FOUND THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Service not found.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    IF v_duration IS NULL OR v_duration <= 0 OR v_service_active = FALSE THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'Service is inactive.', 'hasFullDayClosure', false, 'hasPartialClosure', false);
    END IF;

    v_start_of_day_utc := p_date::timestamp AT TIME ZONE v_tz;
    v_end_of_day_utc := (p_date::timestamp + INTERVAL '23 hours 59 minutes 59 seconds') AT TIME ZONE v_tz;

    IF EXISTS (
        SELECT 1 FROM blocked_slots
        WHERE business_id = p_business_id
          AND start_time <= v_start_of_day_utc + INTERVAL '1 minute'
          AND end_time >= v_end_of_day_utc - INTERVAL '1 minute'
    ) THEN
        RETURN json_build_object('slots', json_build_array(), 'reason', 'The parlour is unavailable.', 'hasFullDayClosure', true, 'hasPartialClosure', false);
    END IF;

    IF EXISTS (
        SELECT 1 FROM blocked_slots
        WHERE business_id = p_business_id
          AND start_time < v_end_of_day_utc
          AND end_time > v_start_of_day_utc
    ) THEN
        v_has_partial_closure := TRUE;
    END IF;

    v_start_minutes := EXTRACT(HOUR FROM v_open_time)::int * 60 + EXTRACT(MINUTE FROM v_open_time)::int;
    v_close_minutes := EXTRACT(HOUR FROM v_close_time)::int * 60 + EXTRACT(MINUTE FROM v_close_time)::int;
    v_earliest_allowed := NOW() - INTERVAL '10 minutes';

    v_min := v_start_minutes;
    WHILE v_min + v_duration <= v_close_minutes LOOP
        v_slot_start_local := p_date::timestamp + (v_min || ' minutes')::interval;
        v_slot_end_local := v_slot_start_local + (v_duration || ' minutes')::interval;
        
        v_slot_start_utc := v_slot_start_local AT TIME ZONE v_tz;
        v_slot_end_utc := v_slot_end_local AT TIME ZONE v_tz;

        IF v_slot_start_utc >= v_earliest_allowed THEN
            -- Check booking overlaps using strict active statuses
            SELECT EXISTS (
                SELECT 1 FROM bookings
                WHERE business_id = p_business_id
                  AND status IN ('pending', 'confirmed', 'arrived', 'completed')
                  AND start_time < v_slot_end_utc
                  AND end_time > v_slot_start_utc
            ) INTO v_overlaps_booking;

            IF NOT v_overlaps_booking THEN
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

    RETURN json_build_object('slots', v_slots_json, 'reason', NULL, 'hasFullDayClosure', false, 'hasPartialClosure', (v_has_partial_closure AND jsonb_array_length(v_slots_json) > 0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
