-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- Update trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- 1. businesses
CREATE TABLE businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    phone TEXT,
    email TEXT,
    address_line_1 TEXT,
    suburb TEXT,
    city TEXT,
    province TEXT,
    postal_code TEXT,
    country TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 2. business_settings
CREATE TABLE business_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
    whatsapp_number TEXT,
    slot_interval_minutes INT NOT NULL DEFAULT 30,
    booking_approval_mode TEXT NOT NULL DEFAULT 'manual_approval',
    min_notice_hours INT NOT NULL DEFAULT 2,
    max_advance_days INT NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id),
    CONSTRAINT check_slot_interval CHECK (slot_interval_minutes > 0),
    CONSTRAINT check_min_notice CHECK (min_notice_hours >= 0),
    CONSTRAINT check_max_advance CHECK (max_advance_days > 0),
    CONSTRAINT check_approval_mode CHECK (booking_approval_mode IN ('manual_approval'))
);
-- 3. business_opening_hours
CREATE TABLE business_opening_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time TIME,
    close_time TIME,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, day_of_week),
    CONSTRAINT check_times CHECK (
        (is_closed = TRUE) OR 
        (is_closed = FALSE AND open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time)
    )
);
-- 4. profiles
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 5. services
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    dog_size TEXT,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    price_cents INT NOT NULL CHECK (price_cents >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 6. customers
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, phone)
);
-- 7. pets
CREATE TABLE pets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    breed TEXT,
    size TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 8. bookings
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
    source TEXT NOT NULL CHECK (source IN ('online', 'phone', 'walk_in', 'admin')),
    customer_notes TEXT,
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_booking_times CHECK (end_time > start_time)
);
-- 9. blocked_slots
CREATE TABLE blocked_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_blocked_times CHECK (end_time > start_time)
);
-- 10. Constraints and Triggers for Double-booking Protection
-- Apply GiST exclusion constraint on bookings
ALTER TABLE bookings
ADD CONSTRAINT prevent_double_bookings
EXCLUDE USING gist (
    business_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
) WHERE (status IN ('pending', 'confirmed'));
-- Trigger function to check bookings against blocked slots
CREATE OR REPLACE FUNCTION check_booking_against_blocked_slots()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('pending', 'confirmed') THEN
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
CREATE TRIGGER trg_check_booking_blocked_slots
BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION check_booking_against_blocked_slots();
-- 10.b. Trigger for Relationship Integrity
CREATE OR REPLACE FUNCTION validate_booking_relationships()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_biz UUID;
    v_pet_biz UUID;
    v_pet_customer UUID;
    v_service_biz UUID;
    v_service_active BOOLEAN;
BEGIN
    -- Customer validation
    SELECT business_id INTO v_customer_biz FROM customers WHERE id = NEW.customer_id;
    IF v_customer_biz IS NULL OR v_customer_biz != NEW.business_id THEN
        RAISE EXCEPTION 'Customer does not belong to the business' USING ERRCODE = 'P0002';
    END IF;

    -- Pet validation
    SELECT business_id, customer_id INTO v_pet_biz, v_pet_customer FROM pets WHERE id = NEW.pet_id;
    IF v_pet_biz IS NULL OR v_pet_biz != NEW.business_id THEN
        RAISE EXCEPTION 'Pet does not belong to the business' USING ERRCODE = 'P0003';
    END IF;
    IF v_pet_customer != NEW.customer_id THEN
        RAISE EXCEPTION 'Pet does not belong to the selected customer' USING ERRCODE = 'P0004';
    END IF;

    -- Service validation
    SELECT business_id, is_active INTO v_service_biz, v_service_active FROM services WHERE id = NEW.service_id;
    IF v_service_biz IS NULL OR v_service_biz != NEW.business_id THEN
        RAISE EXCEPTION 'Service does not belong to the business' USING ERRCODE = 'P0005';
    END IF;
    
    -- Check if service is active whenever booking is pending or confirmed
    IF NEW.status IN ('pending', 'confirmed') THEN
        IF NOT v_service_active THEN
            RAISE EXCEPTION 'Service is not active' USING ERRCODE = 'P0006';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_validate_booking_relationships
BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION validate_booking_relationships();
-- updated_at triggers
CREATE TRIGGER trg_businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_business_settings_updated_at BEFORE UPDATE ON business_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_business_opening_hours_updated_at BEFORE UPDATE ON business_opening_hours FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pets_updated_at BEFORE UPDATE ON pets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_blocked_slots_updated_at BEFORE UPDATE ON blocked_slots FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- 11. Indexes
CREATE INDEX idx_bookings_business_id_times ON bookings(business_id, start_time, end_time);
CREATE INDEX idx_blocked_slots_business_id_times ON blocked_slots(business_id, start_time, end_time);
CREATE INDEX idx_services_business_id_active ON services(business_id) WHERE is_active = TRUE;
CREATE INDEX idx_customers_business_id_phone ON customers(business_id, phone);
-- 12. RLS Policies
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_opening_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;
-- Helper function to get current user's business_id
CREATE OR REPLACE FUNCTION get_user_business_id()
RETURNS UUID 
SET search_path = public AS $$
    SELECT business_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
-- Admin policies
CREATE POLICY "Admin full access on businesses" ON businesses FOR ALL USING (id = get_user_business_id()) WITH CHECK (id = get_user_business_id());
CREATE POLICY "Admin full access on settings" ON business_settings FOR ALL USING (business_id = get_user_business_id()) WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Admin full access on opening hours" ON business_opening_hours FOR ALL USING (business_id = get_user_business_id()) WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Admin full access on profiles" ON profiles FOR ALL USING (business_id = get_user_business_id()) WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Admin full access on services" ON services FOR ALL USING (business_id = get_user_business_id()) WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Admin full access on customers" ON customers FOR ALL USING (business_id = get_user_business_id()) WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Admin full access on pets" ON pets FOR ALL USING (business_id = get_user_business_id()) WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Admin full access on bookings" ON bookings FOR ALL USING (business_id = get_user_business_id()) WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Admin full access on blocked_slots" ON blocked_slots FOR ALL USING (business_id = get_user_business_id()) WITH CHECK (business_id = get_user_business_id());
-- Public read policies
CREATE POLICY "Public read active services" ON services FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Public read opening hours" ON business_opening_hours FOR SELECT USING (TRUE);
CREATE POLICY "Public read businesses" ON businesses FOR SELECT USING (TRUE);
-- 13. RPC for Public Booking Request
CREATE OR REPLACE FUNCTION submit_booking_request(
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
    p_customer_notes TEXT
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
        -- Find or create customer
        SELECT id INTO v_customer_id FROM customers WHERE business_id = p_business_id AND phone = p_phone LIMIT 1;
        IF v_customer_id IS NULL THEN
            INSERT INTO customers (business_id, full_name, phone, email) 
            VALUES (p_business_id, p_full_name, p_phone, p_email)
            RETURNING id INTO v_customer_id;
        END IF;

        -- Create pet
        INSERT INTO pets (business_id, customer_id, name, breed, size, notes)
        VALUES (p_business_id, v_customer_id, p_pet_name, p_pet_breed, p_pet_size, p_pet_notes)
        RETURNING id INTO v_pet_id;

        -- Attempt to create booking
        INSERT INTO bookings (business_id, customer_id, pet_id, service_id, start_time, end_time, status, source, customer_notes)
        VALUES (p_business_id, v_customer_id, v_pet_id, p_service_id, p_start_time, v_end_time, 'pending', 'online', p_customer_notes)
        RETURNING id INTO v_booking_id;

        -- If successful, return the ID
        RETURN json_build_object('success', true, 'booking_id', v_booking_id);

    EXCEPTION 
        WHEN exclusion_violation THEN
            -- Inner transaction block rolls back, undoing the customer/pet inserts
            RETURN json_build_object('success', false, 'error', 'Slot already taken');
        WHEN raise_exception THEN
            -- Returns the exact RAISE EXCEPTION message from triggers
            RETURN json_build_object('success', false, 'error', SQLERRM);
        WHEN OTHERS THEN
            RETURN json_build_object('success', false, 'error', 'An unexpected error occurred: ' || SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
