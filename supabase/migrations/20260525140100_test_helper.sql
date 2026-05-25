CREATE OR REPLACE FUNCTION public.test_phone_normalization_cleanup(p_phone TEXT)
RETURNS void
SET search_path = public AS $$
DECLARE
    v_normalized TEXT;
BEGIN
    v_normalized := public.normalize_sa_phone(p_phone);
    IF v_normalized IS NULL THEN
        RAISE EXCEPTION 'Invalid phone number';
    END IF;

    DELETE FROM public.bookings WHERE customer_id IN (SELECT id FROM public.customers WHERE normalized_phone = v_normalized);
    DELETE FROM public.customer_pets WHERE customer_id IN (SELECT id FROM public.customers WHERE normalized_phone = v_normalized);
    DELETE FROM public.pets WHERE customer_id IN (SELECT id FROM public.customers WHERE normalized_phone = v_normalized);
    DELETE FROM public.customers WHERE normalized_phone = v_normalized;
    DELETE FROM public.households WHERE name = 'Sarah Household' OR name = 'Sarah Jacobs Household' OR name = 'Sarah J. Household' OR name = 'S Household';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.test_phone_normalization_cleanup(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_phone_normalization_cleanup(TEXT) TO anon, authenticated;
