const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pzwlqdyqdtkkfsbkakqw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6d2xxZHlxZHRra2ZzYmtha3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjI4ODYsImV4cCI6MjA5NDgzODg4Nn0.HWbRZdBufTOYGxEgHzdl_6dcnKEk2U4pbzGweLHgXRU';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const businessId = '8f7b76e1-95a9-4670-bbcf-2c8c67c8227b';
const testPhoneNormalized = '+27821112222';

async function runTests() {
  console.log('--- START PHONE NORMALIZATION TESTING ---');

  // 1. Clean up any existing data for the test phone
  console.log('Cleaning up existing test customer data using secure RPC...');
  const { error: cleanupErr } = await supabase.rpc('test_phone_normalization_cleanup', {
    p_phone: testPhoneNormalized
  });
  
  if (cleanupErr) {
    console.warn('Cleanup RPC warning (could be first run):', cleanupErr.message);
  } else {
    console.log('Cleanup RPC succeeded.');
  }

  // 2. Fetch an active service ID
  const { data: services, error: serviceError } = await supabase
    .from('services')
    .select('id, name')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .limit(1);

  if (serviceError || !services || services.length === 0) {
    throw new Error('No active services found for test: ' + JSON.stringify(serviceError));
  }
  const serviceId = services[0].id;
  console.log(`Using active service: ${services[0].name} (${serviceId})`);

  // We choose a date in the future that is a Monday (e.g. 2026-06-15)
  // local time: 2026-06-15T09:00:00+02:00 -> UTC: 2026-06-15T07:00:00Z (within opening hours)
  // local time: 2026-06-15T11:00:00+02:00 -> UTC: 2026-06-15T09:00:00Z
  // local time: 2026-06-15T13:00:00+02:00 -> UTC: 2026-06-15T11:00:00Z
  const startTime1 = '2026-06-15T07:00:00Z';
  const startTime2 = '2026-06-15T09:00:00Z';
  const startTime3 = '2026-06-15T11:00:00Z';

  // --- Scenario 7: Deduplication Tests ---
  console.log('\n--- Scenario 7: Deduplication Tests ---');

  // A) Book with 0821112222
  console.log('A) Booking first request with 0821112222 (Sarah Jacobs)...');
  const resA = await supabase.rpc('submit_booking_request', {
    p_business_id: businessId,
    p_full_name: 'Sarah',
    p_surname: 'Jacobs',
    p_phone: '0821112222',
    p_email: 'sarah.jacobs@example.com',
    p_pet_name: 'Milo',
    p_pet_breed: 'Maltese',
    p_pet_size: 'small',
    p_pet_notes: 'None',
    p_service_id: serviceId,
    p_start_time: startTime1,
    p_customer_notes: 'First booking',
    p_pet_age_years: 3,
    p_pet_species: 'dog'
  });
  console.log('Result A (Expected success):', resA.data, resA.error ? `Error: ${resA.error.message}` : '');

  // B) Book again with 082 111 2222 (Name: Sarah J.)
  console.log('\nB) Booking second request with 082 111 2222 (Sarah J.)...');
  const resB = await supabase.rpc('submit_booking_request', {
    p_business_id: businessId,
    p_full_name: 'Sarah',
    p_surname: 'J.',
    p_phone: '082 111 2222',
    p_email: 'sarah.j@example.com',
    p_pet_name: 'Milo',
    p_pet_breed: 'Maltese',
    p_pet_size: 'small',
    p_pet_notes: 'None',
    p_service_id: serviceId,
    p_start_time: startTime2,
    p_customer_notes: 'Second booking',
    p_pet_age_years: 3,
    p_pet_species: 'dog'
  });
  console.log('Result B (Expected success):', resB.data, resB.error ? `Error: ${resB.error.message}` : '');

  // C) Book again with +27821112222 (Name: S Jacobs)
  console.log('\nC) Booking third request with +27821112222 (S Jacobs)...');
  const resC = await supabase.rpc('submit_booking_request', {
    p_business_id: businessId,
    p_full_name: 'S',
    p_surname: 'Jacobs',
    p_phone: '+27821112222',
    p_email: 's.jacobs@example.com',
    p_pet_name: 'Milo',
    p_pet_breed: 'Maltese',
    p_pet_size: 'small',
    p_pet_notes: 'None',
    p_service_id: serviceId,
    p_start_time: startTime3,
    p_customer_notes: 'Third booking',
    p_pet_age_years: 3,
    p_pet_species: 'dog'
  });
  console.log('Result C (Expected success):', resC.data, resC.error ? `Error: ${resC.error.message}` : '');

  // D) Verify one customer profile and Other names
  console.log('\nD) Verifying customer profiles in database...');
  const { data: verifyData, error: verifyErr } = await supabase.rpc('test_phone_normalization_verify', {
    p_phone: testPhoneNormalized
  });

  if (verifyErr) {
    console.error('Error verifying customer data:', verifyErr.message);
  } else {
    console.log(`Verification result:`, JSON.stringify(verifyData, null, 2));
  }

  // --- Scenario 8: Invalid Phones Tests ---
  console.log('\n--- Scenario 8: Invalid Phones Tests ---');

  // E) Book with 12345 (too short)
  console.log('E) Booking with 12345 (too short)...');
  const resE = await supabase.rpc('submit_booking_request', {
    p_business_id: businessId,
    p_full_name: 'Invalid',
    p_surname: 'Test',
    p_phone: '12345',
    p_email: 'invalid@example.com',
    p_pet_name: 'Milo',
    p_pet_breed: null,
    p_pet_size: 'small',
    p_pet_notes: null,
    p_service_id: serviceId,
    p_start_time: startTime1,
    p_customer_notes: null,
    p_pet_species: 'dog'
  });
  console.log('Result E (Should fail):', resE.data, resE.error ? `Error: ${resE.error.message}` : '');

  // F) Book with blank phone
  console.log('\nF) Booking with blank phone...');
  const resF = await supabase.rpc('submit_booking_request', {
    p_business_id: businessId,
    p_full_name: 'Invalid',
    p_surname: 'Test',
    p_phone: '   ',
    p_email: 'invalid@example.com',
    p_pet_name: 'Milo',
    p_pet_breed: null,
    p_pet_size: 'small',
    p_pet_notes: null,
    p_service_id: serviceId,
    p_start_time: startTime1,
    p_customer_notes: null,
    p_pet_species: 'dog'
  });
  console.log('Result F (Should fail):', resF.data, resF.error ? `Error: ${resF.error.message}` : '');

  // G) Book with 082111222222 (too long)
  console.log('\nG) Booking with 082111222222 (too long)...');
  const resG = await supabase.rpc('submit_booking_request', {
    p_business_id: businessId,
    p_full_name: 'Invalid',
    p_surname: 'Test',
    p_phone: '082111222222',
    p_email: 'invalid@example.com',
    p_pet_name: 'Milo',
    p_pet_breed: null,
    p_pet_size: 'small',
    p_pet_notes: null,
    p_service_id: serviceId,
    p_start_time: startTime1,
    p_customer_notes: null,
    p_pet_species: 'dog'
  });
  console.log('Result G (Should fail):', resG.data, resG.error ? `Error: ${resG.error.message}` : '');

  console.log('\n--- CLEANING UP TEST DATA ---');
  const { error: finalCleanupErr } = await supabase.rpc('test_phone_normalization_cleanup', {
    p_phone: testPhoneNormalized
  });
  if (finalCleanupErr) {
    console.error('Final cleanup RPC failed:', finalCleanupErr.message);
  } else {
    console.log('Cleanup completed successfully.');
  }

  console.log('\n--- END PHONE NORMALIZATION TESTING ---');
}

runTests().catch(console.error);
