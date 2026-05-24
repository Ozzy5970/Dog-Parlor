-- Create temporary verify_idempotent_pet_age_test function for integration testing

CREATE OR REPLACE FUNCTION public.verify_idempotent_pet_age_test()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_business_id UUID := '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
    v_service_id UUID := '1b1e847c-783b-4c07-90ff-4f464016f4d2';
    v_test_phone TEXT := '0729998888';
    v_pet_name TEXT := 'Zach';
    v_time1 TIMESTAMPTZ;
    v_time2 TIMESTAMPTZ;
    v_booking1 JSON;
    v_booking2 JSON;
    v_customer_count INT;
    v_pet_count INT;
    v_pet_age NUMERIC;
    v_booking1_id UUID;
    v_booking2_id UUID;
    v_pet1_id UUID;
    v_pet2_id UUID;
BEGIN
    -- Cleanup any existing test records first
    DELETE FROM bookings WHERE customer_id IN (SELECT id FROM customers WHERE phone = v_test_phone);
    DELETE FROM pets WHERE customer_id IN (SELECT id FROM customers WHERE phone = v_test_phone);
    DELETE FROM customers WHERE phone = v_test_phone;

    -- Make sure times fit opening hours (Wednesday 10am)
    -- We can force the day to be next Wednesday and the week after
    v_time1 := DATE_TRUNC('week', NOW() + INTERVAL '2 weeks') + INTERVAL '2 days 10 hours'; -- Wednesday 10:00
    v_time2 := DATE_TRUNC('week', NOW() + INTERVAL '3 weeks') + INTERVAL '2 days 10 hours'; -- Wednesday 10:00

    -- Run booking 1 (Zach age 1)
    v_booking1 := submit_booking_request(
        v_business_id,
        'Test Zach Owner',
        v_test_phone,
        'zach@test.com',
        v_pet_name,
        'Dachshund',
        'small',
        'None',
        v_service_id,
        v_time1,
        'First booking',
        1,
        'Owner'
    );
    
    IF NOT (v_booking1->>'success')::boolean THEN
        RETURN json_build_object('success', false, 'error', 'Booking 1 failed: ' || (v_booking1->>'error'));
    END IF;
    v_booking1_id := (v_booking1->>'booking_id')::UUID;

    -- Run booking 2 (Zach age 2)
    v_booking2 := submit_booking_request(
        v_business_id,
        'Test Zach Owner',
        v_test_phone,
        'zach@test.com',
        v_pet_name,
        'Dachshund',
        'small',
        'Updated notes',
        v_service_id,
        v_time2,
        'Second booking',
        2,
        'Owner'
    );

    IF NOT (v_booking2->>'success')::boolean THEN
        -- Cleanup booking 1 first
        DELETE FROM bookings WHERE id = v_booking1_id;
        DELETE FROM pets WHERE customer_id IN (SELECT id FROM customers WHERE phone = v_test_phone);
        DELETE FROM customers WHERE phone = v_test_phone;
        RETURN json_build_object('success', false, 'error', 'Booking 2 failed: ' || (v_booking2->>'error'));
    END IF;
    v_booking2_id := (v_booking2->>'booking_id')::UUID;

    -- Verify results
    SELECT COUNT(*) INTO v_customer_count FROM customers WHERE phone = v_test_phone;
    SELECT COUNT(*) INTO v_pet_count FROM pets WHERE name = v_pet_name AND customer_id IN (SELECT id FROM customers WHERE phone = v_test_phone);
    SELECT age_years INTO v_pet_age FROM pets WHERE name = v_pet_name AND customer_id IN (SELECT id FROM customers WHERE phone = v_test_phone) LIMIT 1;
    
    SELECT pet_id INTO v_pet1_id FROM bookings WHERE id = v_booking1_id;
    SELECT pet_id INTO v_pet2_id FROM bookings WHERE id = v_booking2_id;

    -- Cleanup test records
    DELETE FROM bookings WHERE id IN (v_booking1_id, v_booking2_id);
    DELETE FROM pets WHERE customer_id IN (SELECT id FROM customers WHERE phone = v_test_phone);
    DELETE FROM customers WHERE phone = v_test_phone;

    IF v_customer_count != 1 THEN
        RETURN json_build_object('success', false, 'error', 'Expected 1 customer, got ' || v_customer_count);
    END IF;
    IF v_pet_count != 1 THEN
        RETURN json_build_object('success', false, 'error', 'Expected 1 pet, got ' || v_pet_count);
    END IF;
    IF v_pet_age != 2 THEN
        RETURN json_build_object('success', false, 'error', 'Expected pet age 2, got ' || v_pet_age);
    END IF;
    IF v_pet1_id != v_pet2_id THEN
        RETURN json_build_object('success', false, 'error', 'Expected pet IDs to match, got ' || COALESCE(v_pet1_id::text, 'null') || ' and ' || COALESCE(v_pet2_id::text, 'null'));
    END IF;

    RETURN json_build_object('success', true, 'message', 'ALL TESTS PASSED SUCCESSFULLY! Cleaned up verification records.');
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_idempotent_pet_age_test() TO anon, authenticated;
