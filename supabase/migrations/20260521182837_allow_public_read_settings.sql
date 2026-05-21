-- Allow public users (anon role) to read business settings
-- This is necessary to retrieve timezone, slot intervals, advance notice hours, and WhatsApp numbers for calendar calculation and confirmation links.
DROP POLICY IF EXISTS "Public read business settings" ON public.business_settings;

CREATE POLICY "Public read business settings"
ON public.business_settings
FOR SELECT
TO anon
USING (TRUE);
