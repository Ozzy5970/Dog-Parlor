-- Migration: Production Customer, Household, and Pet Master Data Overhaul (Hardened)

-- =========================================================================
-- 1. Schema Alterations
-- =========================================================================

-- A. Add Admin-Managed Address Fields to Households
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS address_line_1 TEXT;
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS address_line_2 TEXT;
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS suburb TEXT;
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Safe implementation for Household Country column
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS country TEXT;
UPDATE public.households SET country = 'South Africa' WHERE country IS NULL OR TRIM(country) = '';
ALTER TABLE public.households ALTER COLUMN country SET DEFAULT 'South Africa';
ALTER TABLE public.households ALTER COLUMN country SET NOT NULL;

-- B. Add Household Links & Species Field to Pets (Hardened Sequence)
ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS household_id UUID;
ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS species TEXT;
UPDATE public.pets SET species = 'dog' WHERE species IS NULL OR TRIM(species) = '';
ALTER TABLE public.pets ALTER COLUMN species SET DEFAULT 'dog';
ALTER TABLE public.pets ALTER COLUMN species SET NOT NULL;

ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- C. Composite Unique Constraints (Wrapped in safe DO blocks to check pg_constraint)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'customers_id_business_id_unique' 
          AND conrelid = 'public.customers'::regclass
    ) THEN
        ALTER TABLE public.customers ADD CONSTRAINT customers_id_business_id_unique UNIQUE (id, business_id);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'pets_id_business_id_unique' 
          AND conrelid = 'public.pets'::regclass
    ) THEN
        ALTER TABLE public.pets ADD CONSTRAINT pets_id_business_id_unique UNIQUE (id, business_id);
    END IF;
END;
$$;

-- D. Same-Business Foreign Key Constraint on Pets
ALTER TABLE public.pets DROP CONSTRAINT IF EXISTS pets_household_same_business_fk;
ALTER TABLE public.pets
ADD CONSTRAINT pets_household_same_business_fk
FOREIGN KEY (household_id, business_id)
REFERENCES public.households(id, business_id)
ON DELETE SET NULL;

-- E. Case-Insensitive Species Validation CHECK Constraint
ALTER TABLE public.pets DROP CONSTRAINT IF EXISTS check_pet_species;
ALTER TABLE public.pets ADD CONSTRAINT check_pet_species CHECK (LOWER(species) IN ('dog', 'cat', 'other'));

-- =========================================================================
-- 2. Junction Table `customer_pets`
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.customer_pets (
    customer_id UUID NOT NULL,
    pet_id UUID NOT NULL,
    business_id UUID NOT NULL,
    relationship TEXT NOT NULL DEFAULT 'owner',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (customer_id, pet_id),
    
    CONSTRAINT customer_pets_customer_same_business_fk
        FOREIGN KEY (customer_id, business_id)
        REFERENCES public.customers(id, business_id)
        ON DELETE CASCADE,
        
    CONSTRAINT customer_pets_pet_same_business_fk
        FOREIGN KEY (pet_id, business_id)
        REFERENCES public.pets(id, business_id)
        ON DELETE CASCADE
);

-- Safe alter column/add in case table was created previously without relationship column
ALTER TABLE public.customer_pets ADD COLUMN IF NOT EXISTS relationship TEXT NOT NULL DEFAULT 'owner';

-- Enable Row Level Security (RLS)
ALTER TABLE public.customer_pets ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policy
DROP POLICY IF EXISTS "Authenticated users manage own business customer_pets" ON public.customer_pets;
CREATE POLICY "Authenticated users manage own business customer_pets"
ON public.customer_pets
FOR ALL
TO authenticated
USING (business_id = get_user_business_id())
WITH CHECK (business_id = get_user_business_id());

-- Configure Permissions
REVOKE ALL ON public.customer_pets FROM PUBLIC;
REVOKE ALL ON public.customer_pets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_pets TO authenticated;

-- =========================================================================
-- 3. Optimization Indexes
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_customer_pets_pet_id ON public.customer_pets(pet_id);
CREATE INDEX IF NOT EXISTS idx_customer_pets_business_id ON public.customer_pets(business_id);
CREATE INDEX IF NOT EXISTS idx_pets_household_id ON public.pets(household_id);
CREATE INDEX IF NOT EXISTS idx_pets_is_active ON public.pets(is_active);

-- Added index for household-first active pet matching:
CREATE INDEX IF NOT EXISTS idx_pets_household_name_active
ON public.pets (business_id, household_id, is_active, LOWER(TRIM(name)));

-- =========================================================================
-- 4. Safe Backfill Block
-- =========================================================================

DO $$
DECLARE
    r RECORD;
    v_hh_id UUID;
BEGIN
    -- A. Ensure every existing customer has a household record
    FOR r IN SELECT id, business_id, full_name, surname FROM public.customers WHERE household_id IS NULL LOOP
        INSERT INTO public.households (business_id, name)
        VALUES (
            r.business_id, 
            COALESCE(NULLIF(TRIM(r.surname), ''), split_part(r.full_name, ' ', 2), r.full_name) || ' Household'
        )
        RETURNING id INTO v_hh_id;
        
        UPDATE public.customers
        SET household_id = v_hh_id
        WHERE id = r.id;
    END LOOP;

    -- B. Link existing pets to their primary owner's household
    UPDATE public.pets p
    SET household_id = c.household_id
    FROM public.customers c
    WHERE p.customer_id = c.id
      AND p.household_id IS NULL;

    -- C. Map all current customer-pet pairings in the customer_pets junction table
    INSERT INTO public.customer_pets (customer_id, pet_id, business_id, relationship)
    SELECT customer_id, id, business_id, 'owner'
    FROM public.pets
    ON CONFLICT (customer_id, pet_id) DO NOTHING;
END;
$$;

-- =========================================================================
-- 5. Updated Booking Validation Trigger
-- =========================================================================

CREATE OR REPLACE FUNCTION validate_booking_relationships()
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
    -- 1. Must be the primary owner (`customer_id` on the pet record)
    -- 2. OR share the same household unit
    -- 3. OR have an explicit link in the `customer_pets` table
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
    
    -- Check active status for confirmable/pending appointments
    IF NEW.status IN ('pending', 'confirmed') AND NOT v_service_active THEN
        RAISE EXCEPTION 'Service is not active' USING ERRCODE = 'P0006';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS trg_validate_booking_relationships ON bookings;
CREATE TRIGGER trg_validate_booking_relationships
BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION validate_booking_relationships();

-- =========================================================================
-- 6. RPC Re-creation
-- =========================================================================

-- Drop previous booking functions to prevent overload conflicts
DROP FUNCTION IF EXISTS public.submit_booking_request(uuid, text, text, text, text, text, text, text, uuid, timestamptz, text, numeric, text);
DROP FUNCTION IF EXISTS public.submit_booking_request(uuid, text, text, text, text, text, text, text, uuid, timestamptz, text, numeric, text, text);

DROP FUNCTION IF EXISTS public.admin_submit_booking(text, text, text, text, text, text, text, uuid, timestamptz, text, text, text, numeric, text);
DROP FUNCTION IF EXISTS public.admin_submit_booking(text, text, text, text, text, text, text, uuid, timestamptz, text, text, text, numeric, text, text);


-- A. Recreate submit_booking_request (Public Online Booking)
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
BEGIN
    -- 1. Validate Business
    IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid business');
    END IF;

    -- Validate Pet Age
    IF p_pet_age_years IS NOT NULL AND (p_pet_age_years < 0 OR p_pet_age_years > 40) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid dog age');
    END IF;

    -- Validate Pet Species (if provided)
    IF p_pet_species IS NOT NULL AND TRIM(p_pet_species) != '' AND LOWER(TRIM(p_pet_species)) NOT IN ('dog', 'cat', 'other') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid pet species');
    END IF;

    -- 2. Fetch Settings
    SELECT timezone, min_notice_hours, max_advance_days 
    INTO v_tz, v_min_notice, v_max_advance
    FROM business_settings 
    WHERE business_id = p_business_id;

    IF v_tz IS NULL THEN v_tz := 'Africa/Johannesburg'; v_min_notice := 2; v_max_advance := 60; END IF;

    -- 3. Validate Service
    SELECT duration_minutes INTO v_duration FROM services 
    WHERE id = p_service_id AND business_id = p_business_id AND is_active = true;

    IF v_duration IS NULL THEN RETURN json_build_object('success', false, 'error', 'Invalid service'); END IF;
    v_end_time := p_start_time + (v_duration || ' minutes')::interval;

    -- 4. Opening Hours & Limits Validation
    IF p_start_time < (NOW() + (v_min_notice || ' hours')::interval) THEN
        RETURN json_build_object('success', false, 'error', 'Booking too soon');
    END IF;
    IF p_start_time > (NOW() + (v_max_advance || ' days')::interval) THEN
        RETURN json_build_object('success', false, 'error', 'Booking too far ahead');
    END IF;

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

    -- 5. Write Transaction
    BEGIN
        -- Find or Create Customer
        SELECT id, household_id INTO v_customer_id, v_household_id 
        FROM customers WHERE business_id = p_business_id AND phone = TRIM(p_phone) LIMIT 1;
        
        IF v_customer_id IS NULL THEN
            -- Create a new household record (address fields remain NULL)
            INSERT INTO households (business_id, name)
            VALUES (p_business_id, COALESCE(NULLIF(TRIM(p_surname), ''), TRIM(p_full_name)) || ' Household')
            RETURNING id INTO v_household_id;

            INSERT INTO customers (business_id, full_name, phone, email, surname, household_id) 
            VALUES (
                p_business_id, TRIM(p_full_name), TRIM(p_phone), 
                NULLIF(TRIM(COALESCE(p_email, '')), ''), NULLIF(TRIM(COALESCE(p_surname, '')), ''),
                v_household_id
            )
            RETURNING id INTO v_customer_id;
        ELSE
            -- Non-destructive update
            UPDATE customers SET 
                surname = COALESCE(NULLIF(TRIM(surname), ''), NULLIF(TRIM(COALESCE(p_surname, '')), '')),
                email = COALESCE(NULLIF(TRIM(email), ''), NULLIF(TRIM(COALESCE(p_email, '')), ''))
            WHERE id = v_customer_id;
            
            IF v_household_id IS NULL THEN
                INSERT INTO households (business_id, name)
                VALUES (p_business_id, COALESCE(NULLIF(TRIM(p_surname), ''), NULLIF(TRIM(surname), ''), TRIM(p_full_name)) || ' Household')
                RETURNING id INTO v_household_id;
                
                UPDATE customers SET household_id = v_household_id WHERE id = v_customer_id;
            END IF;
        END IF;

        -- Find Pet (Active status check: Household first, fallback to Customer ID)
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
            -- Update missing pet fields + species update hierarchy
            UPDATE pets SET
                breed = COALESCE(NULLIF(TRIM(breed), ''), NULLIF(TRIM(COALESCE(p_pet_breed, '')), '')),
                size = COALESCE(NULLIF(TRIM(size), ''), NULLIF(TRIM(COALESCE(p_pet_size, '')), '')),
                notes = COALESCE(NULLIF(TRIM(notes), ''), NULLIF(TRIM(COALESCE(p_pet_notes, '')), '')),
                species = COALESCE(NULLIF(TRIM(species), ''), NULLIF(TRIM(LOWER(p_pet_species)), ''), 'dog'),
                age_years = COALESCE(p_pet_age_years, age_years)
            WHERE id = v_pet_id;
        ELSE
            -- Create a new pet (defaults species to 'dog' if blank/null)
            INSERT INTO pets (business_id, customer_id, household_id, name, breed, size, notes, age_years, species, is_active)
            VALUES (
                p_business_id, v_customer_id, v_household_id, TRIM(p_pet_name), 
                NULLIF(TRIM(COALESCE(p_pet_breed, '')), ''), NULLIF(TRIM(COALESCE(p_pet_size, '')), ''), 
                NULLIF(TRIM(COALESCE(p_pet_notes, '')), ''), p_pet_age_years,
                COALESCE(NULLIF(TRIM(LOWER(p_pet_species)), ''), 'dog'), true
            )
            RETURNING id INTO v_pet_id;
        END IF;

        -- Ensure mapping in junction table
        INSERT INTO customer_pets (customer_id, pet_id, business_id, relationship)
        VALUES (v_customer_id, v_pet_id, p_business_id, 'owner')
        ON CONFLICT (customer_id, pet_id) DO NOTHING;

        -- Create Booking
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


-- B. Recreate admin_submit_booking (Admin Side Booking Creation)
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
    -- Validations
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

    v_business_id := get_user_business_id();
    IF v_business_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Admin profile not found'); END IF;

    -- Settings
    SELECT timezone, min_notice_hours, max_advance_days INTO v_tz, v_min_notice, v_max_advance
    FROM business_settings WHERE business_id = v_business_id;

    IF v_tz IS NULL THEN v_tz := 'Africa/Johannesburg'; v_min_notice := 2; v_max_advance := 60; END IF;

    -- Time validation
    IF p_start_time < (NOW() + (v_min_notice || ' hours')::interval) THEN RETURN json_build_object('success', false, 'error', 'Booking too soon'); END IF;
    IF p_start_time > (NOW() + (v_max_advance || ' days')::interval) THEN RETURN json_build_object('success', false, 'error', 'Booking too far ahead'); END IF;

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

    -- Execute
    BEGIN
        SELECT id, household_id INTO v_customer_id, v_household_id 
        FROM customers WHERE business_id = v_business_id AND phone = TRIM(p_phone) LIMIT 1;

        IF v_customer_id IS NULL THEN
            INSERT INTO households (business_id, name)
            VALUES (v_business_id, COALESCE(NULLIF(TRIM(p_surname), ''), TRIM(p_full_name)) || ' Household')
            RETURNING id INTO v_household_id;

            INSERT INTO customers (business_id, full_name, phone, email, surname, household_id)
            VALUES (
                v_business_id, TRIM(p_full_name), TRIM(p_phone), 
                NULLIF(TRIM(COALESCE(p_email, '')), ''), NULLIF(TRIM(COALESCE(p_surname, '')), ''),
                v_household_id
            )
            RETURNING id INTO v_customer_id;
        ELSE
            UPDATE customers SET 
                surname = COALESCE(NULLIF(TRIM(surname), ''), NULLIF(TRIM(COALESCE(p_surname, '')), '')),
                email = COALESCE(NULLIF(TRIM(email), ''), NULLIF(TRIM(COALESCE(p_email, '')), ''))
            WHERE id = v_customer_id;
            
            IF v_household_id IS NULL THEN
                INSERT INTO households (business_id, name)
                VALUES (v_business_id, COALESCE(NULLIF(TRIM(p_surname), ''), NULLIF(TRIM(surname), ''), TRIM(p_full_name)) || ' Household')
                RETURNING id INTO v_household_id;
                
                UPDATE customers SET household_id = v_household_id WHERE id = v_customer_id;
            END IF;
        END IF;

        -- Find Pet (Active status check: Household first, fallback to Customer ID)
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

        -- Create Booking
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
        WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', 'Unexpected error');
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- C. Create merge_customer_pets RPC (Consolidation)
CREATE OR REPLACE FUNCTION public.merge_customer_pets(
    p_primary_pet_id UUID,
    p_duplicate_pet_ids UUID[]
) RETURNS json
SET search_path = public AS $$
DECLARE
    v_business_id UUID;
    v_primary_biz UUID;
    v_primary_active BOOLEAN;
    v_primary_hh_id UUID;
    v_primary_cust_id UUID;
    
    v_dup_id UUID;
    v_dup_biz UUID;
    v_dup_active BOOLEAN;
    v_dup_hh_id UUID;
    v_dup_cust_id UUID;
    v_dup_name TEXT;
    
    v_archived_count INT := 0;
    v_bookings_updated INT := 0;
    
    -- Field merging storage
    v_primary_breed TEXT;
    v_primary_size TEXT;
    v_primary_notes TEXT;
    v_primary_species TEXT;
    v_primary_age numeric;
    
    r RECORD;
BEGIN
    -- 1. Input Parameter basic validations
    IF p_primary_pet_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Primary pet ID is required');
    END IF;
    IF p_duplicate_pet_ids IS NULL OR ARRAY_LENGTH(p_duplicate_pet_ids, 1) IS NULL OR ARRAY_LENGTH(p_duplicate_pet_ids, 1) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Duplicate pet IDs are required');
    END IF;

    -- Dry-run validation for repeated duplicate IDs in the array
    IF (SELECT COUNT(DISTINCT id) FROM unnest(p_duplicate_pet_ids) AS id) != COALESCE(ARRAY_LENGTH(p_duplicate_pet_ids, 1), 0) THEN
        RETURN json_build_object('success', false, 'error', 'Duplicate pet list contains repeated IDs');
    END IF;

    -- 2. Determine current session business_id
    v_business_id := get_user_business_id();
    IF v_business_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized or admin profile not found');
    END IF;

    -- 3. Load primary pet details & validate state
    SELECT business_id, is_active, household_id, customer_id, breed, size, notes, species, age_years
    INTO v_primary_biz, v_primary_active, v_primary_hh_id, v_primary_cust_id,
         v_primary_breed, v_primary_size, v_primary_notes, v_primary_species, v_primary_age
    FROM pets
    WHERE id = p_primary_pet_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Primary pet not found');
    END IF;
    IF v_primary_biz != v_business_id THEN
        RETURN json_build_object('success', false, 'error', 'Primary pet does not belong to your business');
    END IF;
    IF v_primary_active = FALSE THEN
        RETURN json_build_object('success', false, 'error', 'Primary pet is not active');
    END IF;

    -- 4. Dry-Run Validation on Duplicates (Atomic Check-First)
    FOREACH v_dup_id IN ARRAY p_duplicate_pet_ids LOOP
        IF v_dup_id = p_primary_pet_id THEN
            RETURN json_build_object('success', false, 'error', 'Primary pet cannot be in the duplicate list');
        END IF;

        SELECT business_id, is_active, household_id, customer_id, name
        INTO v_dup_biz, v_dup_active, v_dup_hh_id, v_dup_cust_id, v_dup_name
        FROM pets
        WHERE id = v_dup_id;

        IF NOT FOUND THEN
            RETURN json_build_object('success', false, 'error', 'Duplicate pet not found: ' || COALESCE(v_dup_id::text, ''));
        END IF;
        IF v_dup_biz != v_business_id THEN
            RETURN json_build_object('success', false, 'error', 'Duplicate pet "' || v_dup_name || '" belongs to another business');
        END IF;
        IF v_dup_active = FALSE THEN
            RETURN json_build_object('success', false, 'error', 'Duplicate pet "' || v_dup_name || '" is already inactive or archived');
        END IF;

        -- Household or Customer Alignment Check
        IF v_primary_hh_id IS NOT NULL THEN
            IF v_dup_hh_id IS NULL OR v_dup_hh_id != v_primary_hh_id THEN
                RETURN json_build_object('success', false, 'error', 'Duplicate pet "' || v_dup_name || '" is not in the same household');
            END IF;
        ELSE
            IF v_dup_cust_id != v_primary_cust_id THEN
                RETURN json_build_object('success', false, 'error', 'Duplicate pet "' || v_dup_name || '" belongs to a different owner');
            END IF;
        END IF;
    END LOOP;

    -- 5. Coalesce Field Values into Primary Record
    FOR r IN 
        SELECT breed, size, notes, species, age_years
        FROM pets
        WHERE id = ANY(p_duplicate_pet_ids)
        ORDER BY created_at ASC
    LOOP
        IF NULLIF(TRIM(v_primary_breed), '') IS NULL AND NULLIF(TRIM(r.breed), '') IS NOT NULL THEN
            v_primary_breed := TRIM(r.breed);
        END IF;
        IF NULLIF(TRIM(v_primary_size), '') IS NULL AND NULLIF(TRIM(r.size), '') IS NOT NULL THEN
            v_primary_size := TRIM(r.size);
        END IF;
        IF NULLIF(TRIM(v_primary_notes), '') IS NULL AND NULLIF(TRIM(r.notes), '') IS NOT NULL THEN
            v_primary_notes := TRIM(r.notes);
        END IF;
        IF NULLIF(TRIM(v_primary_species), '') IS NULL AND NULLIF(TRIM(r.species), '') IS NOT NULL THEN
            v_primary_species := TRIM(r.species);
        END IF;
        IF v_primary_age IS NULL AND r.age_years IS NOT NULL THEN
            v_primary_age := r.age_years;
        END IF;
    END LOOP;

    -- Update Primary Pet
    UPDATE pets
    SET breed = NULLIF(v_primary_breed, ''),
        size = NULLIF(v_primary_size, ''),
        notes = NULLIF(v_primary_notes, ''),
        species = COALESCE(NULLIF(v_primary_species, ''), 'dog'),
        age_years = v_primary_age,
        updated_at = NOW()
    WHERE id = p_primary_pet_id;

    -- 6. Re-route Booking History
    UPDATE bookings
    SET pet_id = p_primary_pet_id,
        updated_at = NOW()
    WHERE pet_id = ANY(p_duplicate_pet_ids)
      AND business_id = v_business_id;
      
    GET DIAGNOSTICS v_bookings_updated = ROW_COUNT;

    -- 7. Safe Junction Table Merge (Insert then Delete)
    INSERT INTO customer_pets (customer_id, pet_id, business_id, relationship)
    SELECT customer_id, p_primary_pet_id, v_business_id, COALESCE(relationship, 'owner')
    FROM customer_pets
    WHERE pet_id = ANY(p_duplicate_pet_ids)
      AND business_id = v_business_id
    ON CONFLICT (customer_id, pet_id) DO NOTHING;

    DELETE FROM customer_pets
    WHERE pet_id = ANY(p_duplicate_pet_ids)
      AND business_id = v_business_id;

    -- 8. Archive Duplicate Records
    UPDATE pets
    SET is_active = FALSE,
        archived_at = NOW(),
        updated_at = NOW()
    WHERE id = ANY(p_duplicate_pet_ids)
      AND business_id = v_business_id
      AND is_active = TRUE;

    GET DIAGNOSTICS v_archived_count = ROW_COUNT;

    RETURN json_build_object(
        'success', true,
        'archived_count', v_archived_count,
        'bookings_updated', v_bookings_updated
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =========================================================================
-- 7. Explicit Grants & Revokes
-- =========================================================================

-- Revoke and Grant for submit_booking_request
REVOKE EXECUTE ON FUNCTION public.submit_booking_request(uuid, text, text, text, text, text, text, text, uuid, timestamptz, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_booking_request(uuid, text, text, text, text, text, text, text, uuid, timestamptz, text, numeric, text, text) TO anon, authenticated;

-- Revoke and Grant for admin_submit_booking
REVOKE EXECUTE ON FUNCTION public.admin_submit_booking(text, text, text, text, text, text, text, uuid, timestamptz, text, text, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_submit_booking(text, text, text, text, text, text, text, uuid, timestamptz, text, text, text, numeric, text, text) TO authenticated;

-- Revoke and Grant for merge_customer_pets
REVOKE EXECUTE ON FUNCTION public.merge_customer_pets(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_customer_pets(UUID, UUID[]) TO authenticated;
