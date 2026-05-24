DROP POLICY IF EXISTS "Public read businesses" ON public.businesses;
DROP POLICY IF EXISTS "Public read opening hours" ON public.business_opening_hours;
DROP POLICY IF EXISTS "Public read active services" ON public.services;
CREATE POLICY "Public read businesses"
ON public.businesses
FOR SELECT
TO anon
USING (TRUE);
CREATE POLICY "Public read opening hours"
ON public.business_opening_hours
FOR SELECT
TO anon
USING (TRUE);
CREATE POLICY "Public read active services"
ON public.services
FOR SELECT
TO anon
USING (is_active = TRUE);
