-- 1. Create resolve_booking_pet RPC
CREATE OR REPLACE FUNCTION public.resolve_booking_pet(
    p_booking_id UUID,
    p_pet_id UUID
) RETURNS json
SET search_path = public AS $$
DECLARE
    v_business_id UUID;
    v_booking_business_id UUID;
    v_booking_customer_id UUID;
    v_booking_household_id UUID;
    v_booking_status TEXT;
    v_pet_business_id UUID;
    v_pet_household_id UUID;
    v_pet_customer_id UUID;
    v_pet_active BOOLEAN;
    v_pet_exists_in_household BOOLEAN;
    v_is_linked_customer_pet BOOLEAN;
BEGIN
    -- Get current user's business_id
    v_business_id := get_user_business_id();
    IF v_business_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Fetch booking details
    SELECT business_id, customer_id, status 
    INTO v_booking_business_id, v_booking_customer_id, v_booking_status
    FROM bookings
    WHERE id = p_booking_id;

    IF v_booking_business_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    IF v_booking_business_id != v_business_id THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized business access');
    END IF;

    -- Enforce: Pending or Confirmed bookings only (closed bookings protection)
    IF v_booking_status NOT IN ('pending', 'confirmed') THEN
        RETURN json_build_object('success', false, 'error', 'Cannot change pet for a closed booking.');
    END IF;

    -- Fetch customer's household_id
    SELECT household_id INTO v_booking_household_id
    FROM customers
    WHERE id = v_booking_customer_id AND business_id = v_business_id;

    -- Fetch pet details
    SELECT business_id, household_id, customer_id, is_active
    INTO v_pet_business_id, v_pet_household_id, v_pet_customer_id, v_pet_active
    FROM pets
    WHERE id = p_pet_id;

    IF v_pet_business_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Pet not found');
    END IF;

    IF v_pet_business_id != v_business_id THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized pet business access');
    END IF;

    -- Enforce: active pet only
    IF NOT v_pet_active THEN
        RETURN json_build_object('success', false, 'error', 'Selected pet is archived or inactive');
    END IF;

    -- Enforce: same customer/household OR explicit customer_pets link
    v_pet_exists_in_household := FALSE;
    IF v_booking_household_id IS NOT NULL AND v_pet_household_id IS NOT NULL AND v_booking_household_id = v_pet_household_id THEN
        v_pet_exists_in_household := TRUE;
    END IF;

    IF v_booking_customer_id = v_pet_customer_id THEN
        v_pet_exists_in_household := TRUE;
    END IF;

    -- Check explicit customer_pets link
    SELECT EXISTS (
        SELECT 1 FROM customer_pets
        WHERE customer_id = v_booking_customer_id AND pet_id = p_pet_id AND business_id = v_business_id
    ) INTO v_is_linked_customer_pet;

    IF NOT v_pet_exists_in_household AND NOT v_is_linked_customer_pet THEN
        RETURN json_build_object('success', false, 'error', 'Pet does not belong to the same customer/household');
    END IF;

    -- Update booking pet_id
    UPDATE bookings
    SET pet_id = p_pet_id,
        updated_at = NOW()
    WHERE id = p_booking_id AND business_id = v_business_id;

    -- Ensure relationship exists in junction table
    INSERT INTO customer_pets (customer_id, pet_id, business_id, relationship)
    VALUES (v_booking_customer_id, p_pet_id, v_business_id, 'owner')
    ON CONFLICT (customer_id, pet_id) DO NOTHING;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Create create_pet_for_booking_and_assign RPC
CREATE OR REPLACE FUNCTION public.create_pet_for_booking_and_assign(
    p_booking_id UUID,
    p_name TEXT,
    p_species TEXT DEFAULT 'dog',
    p_breed TEXT DEFAULT NULL,
    p_size TEXT DEFAULT NULL,
    p_age_years NUMERIC DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS json
SET search_path = public AS $$
DECLARE
    v_business_id UUID;
    v_booking_business_id UUID;
    v_booking_customer_id UUID;
    v_booking_status TEXT;
    v_customer_household_id UUID;
    v_new_pet_id UUID;
    v_trimmed_name TEXT;
    v_trimmed_species TEXT;
BEGIN
    -- Get current user's business_id
    v_business_id := get_user_business_id();
    IF v_business_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Fetch booking details
    SELECT business_id, customer_id, status 
    INTO v_booking_business_id, v_booking_customer_id, v_booking_status
    FROM bookings
    WHERE id = p_booking_id;

    IF v_booking_business_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    IF v_booking_business_id != v_business_id THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized business access');
    END IF;

    -- Enforce: Pending or Confirmed bookings only (closed bookings protection)
    IF v_booking_status NOT IN ('pending', 'confirmed') THEN
        RETURN json_build_object('success', false, 'error', 'Cannot change pet for a closed booking.');
    END IF;

    -- Fetch customer's household_id
    SELECT household_id INTO v_customer_household_id
    FROM customers
    WHERE id = v_booking_customer_id AND business_id = v_business_id;

    -- Validate and trim fields
    v_trimmed_name := TRIM(p_name);
    IF v_trimmed_name IS NULL OR v_trimmed_name = '' THEN
        RETURN json_build_object('success', false, 'error', 'Pet name is required');
    END IF;

    v_trimmed_species := LOWER(TRIM(COALESCE(p_species, 'dog')));
    IF v_trimmed_species NOT IN ('dog', 'cat', 'other') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid pet species. Must be dog, cat, or other.');
    END IF;

    IF p_age_years IS NOT NULL AND (p_age_years < 0 OR p_age_years > 40) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid pet age. Must be between 0 and 40.');
    END IF;

    -- Insert new active pet record
    INSERT INTO pets (business_id, customer_id, household_id, name, species, breed, size, age_years, notes, is_active)
    VALUES (
        v_business_id,
        v_booking_customer_id,
        v_customer_household_id,
        v_trimmed_name,
        v_trimmed_species,
        NULLIF(TRIM(p_breed), ''),
        NULLIF(TRIM(p_size), ''),
        p_age_years,
        NULLIF(TRIM(p_notes), ''),
        TRUE
    )
    RETURNING id INTO v_new_pet_id;

    -- Link customer to pet in customer_pets
    INSERT INTO customer_pets (customer_id, pet_id, business_id, relationship)
    VALUES (v_booking_customer_id, v_new_pet_id, v_business_id, 'owner')
    ON CONFLICT (customer_id, pet_id) DO NOTHING;

    -- Update booking assignment
    UPDATE bookings
    SET pet_id = v_new_pet_id,
        updated_at = NOW()
    WHERE id = p_booking_id AND business_id = v_business_id;

    RETURN json_build_object('success', true, 'pet_id', v_new_pet_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Access Controls
-- Revoke all public execution privileges
REVOKE ALL ON FUNCTION public.resolve_booking_pet(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pet_for_booking_and_assign(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC;

-- Grant execution to authenticated role only
GRANT EXECUTE ON FUNCTION public.resolve_booking_pet(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pet_for_booking_and_assign(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
