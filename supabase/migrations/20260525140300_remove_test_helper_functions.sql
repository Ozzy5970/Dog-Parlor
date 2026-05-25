-- Revoke execution privileges from public roles just in case
REVOKE EXECUTE ON FUNCTION public.test_phone_normalization_cleanup(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.test_phone_normalization_verify(TEXT) FROM PUBLIC, anon, authenticated;

-- Drop the test helper functions with their exact signatures
DROP FUNCTION IF EXISTS public.test_phone_normalization_cleanup(TEXT);
DROP FUNCTION IF EXISTS public.test_phone_normalization_verify(TEXT);
