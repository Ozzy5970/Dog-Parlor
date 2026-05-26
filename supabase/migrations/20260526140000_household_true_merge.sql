-- Migration: Create merge_customer_households RPC for true household merging

CREATE OR REPLACE FUNCTION public.merge_customer_households(
    p_primary_cust_id UUID,
    p_secondary_cust_id UUID
) RETURNS json
SET search_path = public AS $$
DECLARE
    v_business_id UUID;
    v_primary_biz UUID;
    v_secondary_biz UUID;
    v_primary_hh_id UUID;
    v_secondary_hh_id UUID;
    
    -- Address fields storage
    v_p_addr1 TEXT; v_p_addr2 TEXT; v_p_suburb TEXT; v_p_city TEXT; v_p_province TEXT; v_p_postal TEXT; v_p_country TEXT;
    v_s_addr1 TEXT; v_s_addr2 TEXT; v_s_suburb TEXT; v_s_city TEXT; v_s_province TEXT; v_s_postal TEXT; v_s_country TEXT;
    
    -- Member names storage
    v_p_names TEXT[];
    v_s_names TEXT[];
    v_merged_names TEXT[];
BEGIN
    -- 1. Determine session business_id
    v_business_id := get_user_business_id();
    IF v_business_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized or admin profile not found');
    END IF;

    -- 2. Fetch customer details & validate business alignment
    SELECT business_id, household_id INTO v_primary_biz, v_primary_hh_id FROM customers WHERE id = p_primary_cust_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Primary customer not found');
    END IF;
    
    SELECT business_id, household_id INTO v_secondary_biz, v_secondary_hh_id FROM customers WHERE id = p_secondary_cust_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Secondary customer not found');
    END IF;

    IF v_primary_biz != v_business_id OR v_secondary_biz != v_business_id THEN
        RETURN json_build_object('success', false, 'error', 'Customers do not belong to your business');
    END IF;

    -- If already linked to the same household, return success immediately
    IF v_primary_hh_id IS NOT NULL AND v_primary_hh_id = v_secondary_hh_id THEN
        RETURN json_build_object('success', true, 'primary_household_id', v_primary_hh_id, 'message', 'Customers already belong to the same household');
    END IF;

    -- 3. Ensure primary household exists
    IF v_primary_hh_id IS NULL THEN
        INSERT INTO households (business_id, name)
        VALUES (v_business_id, 'Household ' || p_primary_cust_id::text)
        RETURNING id INTO v_primary_hh_id;
        
        -- Update primary customer
        UPDATE customers SET household_id = v_primary_hh_id WHERE id = p_primary_cust_id;
        
        -- Guardrail: Ensure primary customer's existing pets also get the new household_id
        UPDATE pets SET household_id = v_primary_hh_id WHERE customer_id = p_primary_cust_id AND business_id = v_business_id;
    END IF;

    -- 4. Consolidate address lines & merge member names if secondary household exists
    IF v_secondary_hh_id IS NOT NULL THEN
        SELECT address_line_1, address_line_2, suburb, city, province, postal_code, country, household_member_names
        INTO v_p_addr1, v_p_addr2, v_p_suburb, v_p_city, v_p_province, v_p_postal, v_p_country, v_p_names
        FROM households WHERE id = v_primary_hh_id;

        SELECT address_line_1, address_line_2, suburb, city, province, postal_code, country, household_member_names
        INTO v_s_addr1, v_s_addr2, v_s_suburb, v_s_city, v_s_province, v_s_postal, v_s_country, v_s_names
        FROM households WHERE id = v_secondary_hh_id;

        -- Safe address merge (only fill blank primary fields from secondary)
        UPDATE households SET
            address_line_1 = COALESCE(NULLIF(TRIM(v_p_addr1), ''), NULLIF(TRIM(v_s_addr1), '')),
            address_line_2 = COALESCE(NULLIF(TRIM(v_p_addr2), ''), NULLIF(TRIM(v_s_addr2), '')),
            suburb = COALESCE(NULLIF(TRIM(v_p_suburb), ''), NULLIF(TRIM(v_s_suburb), '')),
            city = COALESCE(NULLIF(TRIM(v_p_city), ''), NULLIF(TRIM(v_s_city), '')),
            province = COALESCE(NULLIF(TRIM(v_p_province), ''), NULLIF(TRIM(v_s_province), '')),
            postal_code = COALESCE(NULLIF(TRIM(v_p_postal), ''), NULLIF(TRIM(v_s_postal), '')),
            country = COALESCE(NULLIF(TRIM(v_p_country), ''), NULLIF(TRIM(v_s_country), '')),
            updated_at = NOW()
        WHERE id = v_primary_hh_id;

        -- Merge and case-insensitive deduplicate household_member_names
        SELECT ARRAY(
            SELECT DISTINCT ON (LOWER(name)) name
            FROM (
                SELECT TRIM(name) AS name
                FROM (
                    SELECT unnest(COALESCE(v_p_names, ARRAY[]::TEXT[]) || COALESCE(v_s_names, ARRAY[]::TEXT[])) AS name
                ) raw_names
                WHERE name IS NOT NULL AND TRIM(name) != ''
            ) sub
        ) INTO v_merged_names;

        UPDATE households SET
            household_member_names = v_merged_names
        WHERE id = v_primary_hh_id;
        
        -- True Merge: Move ALL customers from secondary household to primary household
        UPDATE customers 
        SET household_id = v_primary_hh_id 
        WHERE business_id = v_business_id AND household_id = v_secondary_hh_id;
        
        -- True Merge: Move ALL pets from secondary household to primary household
        UPDATE pets 
        SET household_id = v_primary_hh_id 
        WHERE business_id = v_business_id AND household_id = v_secondary_hh_id;
        
    ELSE
        -- 5. If secondary customer has no household, move only that customer and their pets
        UPDATE customers 
        SET household_id = v_primary_hh_id 
        WHERE id = p_secondary_cust_id AND business_id = v_business_id;
        
        UPDATE pets 
        SET household_id = v_primary_hh_id 
        WHERE customer_id = p_secondary_cust_id AND business_id = v_business_id;
    END IF;

    -- 6. Safely delete secondary household only if no customers and no pets still reference it
    IF v_secondary_hh_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM customers WHERE household_id = v_secondary_hh_id) AND
           NOT EXISTS (SELECT 1 FROM pets WHERE household_id = v_secondary_hh_id) THEN
            DELETE FROM households WHERE id = v_secondary_hh_id;
        END IF;
    END IF;

    RETURN json_build_object(
        'success', true,
        'primary_household_id', v_primary_hh_id,
        'linked_customer_id', p_secondary_cust_id,
        'message', 'Households linked successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Configure privileges
REVOKE EXECUTE ON FUNCTION public.merge_customer_households(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_customer_households(UUID, UUID) TO authenticated;
