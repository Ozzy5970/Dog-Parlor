-- SQL Script to run all controlled QA workflow scenarios on local database in a transaction
-- Target business_id: 8f7b76e1-95a9-4670-bbcf-2c8c67c8227b

BEGIN;

-- Clean up any records from the previous run to ensure a clean state
DELETE FROM public.bookings WHERE business_id = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
DELETE FROM public.customer_pets WHERE business_id = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
DELETE FROM public.pets WHERE business_id = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
DELETE FROM public.customers WHERE business_id = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
DELETE FROM public.households WHERE business_id = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';

-- Set the admin session context for local testing
SET LOCAL request.jwt.claim.sub = 'cb2f52b8-44a0-480d-817a-ffc216492b09';

DO $$
DECLARE
    v_res json;
    v_cust_id uuid;
    v_pet1_id uuid;
    v_pet2_id uuid;
BEGIN
    RAISE NOTICE '--- Starting Controlled QA Workflow Scenarios ---';

    -- 1. Normal online customer: Sarah Jacobs
    v_res := public.submit_booking_request(
        '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b',
        'Sarah',
        '0821112222',
        'sarah.jacobs@example.com',
        'Milo',
        'Maltese',
        'small',
        'Likes belly rubs',
        '1b1e847c-783b-4c07-90ff-4f464016f4d2',
        '2026-05-26 07:00:00+00', -- Tuesday 09:00 SAST
        'Online notes',
        3,
        'Jacobs',
        'dog'
    );
    RAISE NOTICE 'Scenario 1 (Sarah Jacobs) Result: %', v_res;

    -- 2. Normal manual phone booking: Daniel Naidoo
    v_res := public.admin_submit_booking(
        'Daniel',
        '0832223333',
        'daniel.naidoo@example.com',
        'Rex',
        'German Shepherd',
        'large',
        'Very friendly',
        '1b1e847c-783b-4c07-90ff-4f464016f4d2',
        '2026-05-26 09:00:00+00', -- Tuesday 11:00 SAST
        'phone',
        'Customer called',
        'Staff notes',
        5,
        'Naidoo',
        'dog'
    );
    RAISE NOTICE 'Scenario 2 (Daniel Naidoo) Result: %', v_res;

    -- 3. Normal walk-in booking: Aisha Khan
    v_res := public.admin_submit_booking(
        'Aisha',
        '0843334444',
        'aisha.khan@example.com',
        'Bella',
        'Poodle',
        'medium',
        'Calm dog',
        '1b1e847c-783b-4c07-90ff-4f464016f4d2',
        '2026-05-26 11:00:00+00', -- Tuesday 13:00 SAST
        'walk_in',
        'Walked in',
        'Staff notes',
        2,
        'Khan',
        'dog'
    );
    RAISE NOTICE 'Scenario 3 (Aisha Khan) Result: %', v_res;

    -- 4. Same phone, different names: Austin Simons & Andrea Simons
    -- Booking 1 (Austin Simons)
    v_res := public.submit_booking_request(
        '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b',
        'Austin',
        '0825550000',
        'austin.simons@example.com',
        'Zach',
        'Yorkie',
        'small',
        'Active dog',
        '1b1e847c-783b-4c07-90ff-4f464016f4d2',
        '2026-05-27 07:00:00+00', -- Wednesday 09:00 SAST
        'First booking notes',
        4,
        'Simons',
        'dog'
    );
    RAISE NOTICE 'Scenario 4 Booking 1 (Austin Simons) Result: %', v_res;

    -- Booking 2 (Andrea Simons)
    v_res := public.submit_booking_request(
        '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b',
        'Andrea',
        '0825550000',
        'andrea.simons@example.com',
        'Zach',
        'Yorkie',
        'small',
        'Active dog',
        '1b1e847c-783b-4c07-90ff-4f464016f4d2',
        '2026-05-27 09:00:00+00', -- Wednesday 11:00 SAST
        'Second booking notes',
        4,
        'Simons',
        'dog'
    );
    RAISE NOTICE 'Scenario 4 Booking 2 (Andrea Simons) Result: %', v_res;

    -- 5. Different phone, same surname: John Smith & Peter Smith
    -- Booking 1 (John Smith)
    v_res := public.submit_booking_request(
        '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b',
        'John',
        '0821001000',
        'john.smith@example.com',
        'Max',
        'Golden Retriever',
        'large',
        'Playful',
        '1b1e847c-783b-4c07-90ff-4f464016f4d2',
        '2026-05-28 07:00:00+00', -- Thursday 09:00 SAST
        'John notes',
        6,
        'Smith',
        'dog'
    );
    RAISE NOTICE 'Scenario 5 Booking 1 (John Smith) Result: %', v_res;

    -- Booking 2 (Peter Smith)
    v_res := public.submit_booking_request(
        '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b',
        'Peter',
        '0822002000',
        'peter.smith@example.com',
        'Bruno',
        'Bulldog',
        'medium',
        'Sleepy',
        '1b1e847c-783b-4c07-90ff-4f464016f4d2',
        '2026-05-28 09:00:00+00', -- Thursday 11:00 SAST
        'Peter notes',
        3,
        'Smith',
        'dog'
    );
    RAISE NOTICE 'Scenario 5 Booking 2 (Peter Smith) Result: %', v_res;

    -- 6. Different phone, same pet name: Carla Adams & Megan Williams
    -- Booking 1 (Carla Adams)
    v_res := public.submit_booking_request(
        '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b',
        'Carla',
        '0823003000',
        'carla.adams@example.com',
        'Luna',
        'Husky',
        'large',
        'Howls a lot',
        '1b1e847c-783b-4c07-90ff-4f464016f4d2',
        '2026-05-29 07:00:00+00', -- Friday 09:00 SAST
        'Carla notes',
        5,
        'Adams',
        'dog'
    );
    RAISE NOTICE 'Scenario 6 Booking 1 (Carla Adams) Result: %', v_res;

    -- Booking 2 (Megan Williams)
    v_res := public.submit_booking_request(
        '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b',
        'Megan',
        '0824004000',
        'megan.williams@example.com',
        'Luna',
        'Beagle',
        'medium',
        'Sniffs everything',
        '1b1e847c-783b-4c07-90ff-4f464016f4d2',
        '2026-05-29 09:00:00+00', -- Friday 11:00 SAST
        'Megan notes',
        2,
        'Williams',
        'dog'
    );
    RAISE NOTICE 'Scenario 6 Booking 2 (Megan Williams) Result: %', v_res;

    -- 7. Same profile, two same-name pets (Zac)
    -- Create customer and household manually
    INSERT INTO households (business_id, name)
    VALUES ('8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 'Twin Test Household')
    RETURNING id INTO v_cust_id; -- Temporary reuse variable for household_id
    
    INSERT INTO customers (business_id, full_name, phone, email, surname, household_id)
    VALUES ('8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', 'Twin Test', '0827777777', 'twin.test@example.com', 'Test', v_cust_id)
    RETURNING id INTO v_cust_id;

    -- Add two active pets both named Zac
    INSERT INTO pets (business_id, customer_id, name, breed, size, is_active)
    VALUES ('8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', v_cust_id, 'Zac', 'Chihuahua', 'small', true)
    RETURNING id INTO v_pet1_id;

    INSERT INTO pets (business_id, customer_id, name, breed, size, is_active)
    VALUES ('8f7b76e1-95a9-4670-bbcf-2c8c67c8227b', v_cust_id, 'Zac', 'Terrier', 'small', true)
    RETURNING id INTO v_pet2_id;

    -- Submit booking for Zac
    v_res := public.submit_booking_request(
        '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b',
        'Twin Test',
        '0827777777',
        'twin.test@example.com',
        'Zac',
        'Chihuahua',
        'small',
        'Zac notes',
        '1b1e847c-783b-4c07-90ff-4f464016f4d2',
        '2026-06-01 07:00:00+00', -- Monday June 1, 09:00 SAST
        'Twin test booking',
        1,
        'Test',
        'dog'
    );
    RAISE NOTICE 'Scenario 7 Booking Result: %', v_res;

END $$;

COMMIT;
