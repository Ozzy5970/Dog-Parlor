CREATE OR REPLACE FUNCTION public.test_phone_normalization_verify(p_phone TEXT)
RETURNS json
SET search_path = public AS $$
DECLARE
    v_normalized TEXT;
    v_cust_count INT;
    v_customers json;
    v_households json;
BEGIN
    v_normalized := public.normalize_sa_phone(p_phone);
    
    SELECT count(*) INTO v_cust_count 
    FROM public.customers 
    WHERE normalized_phone = v_normalized;

    SELECT json_agg(t) INTO v_customers FROM (
        SELECT id, full_name, surname, phone, normalized_phone, household_id
        FROM public.customers
        WHERE normalized_phone = v_normalized
    ) t;

    SELECT json_agg(h) INTO v_households FROM (
        SELECT id, name, household_member_names
        FROM public.households
        WHERE id IN (
            SELECT household_id FROM public.customers WHERE normalized_phone = v_normalized
        )
    ) h;

    RETURN json_build_object(
        'customer_count', v_cust_count,
        'customers', v_customers,
        'households', v_households
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.test_phone_normalization_verify(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_phone_normalization_verify(TEXT) TO anon, authenticated;
