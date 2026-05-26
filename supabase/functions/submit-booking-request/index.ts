import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const allowedOrigins = [
  'https://groomersdogparlour.co.za',
  'http://localhost:5173'
]

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  } else {
    // Return standard domain origin as safe fallback
    headers['Access-Control-Allow-Origin'] = 'https://groomersdogparlour.co.za'
  }
  return headers
}

const isLocalDev = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const appEnv = Deno.env.get('APP_ENV') || '';
  return (
    appEnv === 'local' ||
    appEnv === 'development' ||
    supabaseUrl.includes('localhost') ||
    supabaseUrl.includes('127.0.0.1') ||
    supabaseUrl.includes('kong:')
  );
};

serve(async (req) => {
  // Handle CORS Preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: getCorsHeaders(req),
    })
  }

  try {
    const { booking_input, turnstile_token } = await req.json()

    if (!booking_input) {
      return new Response(
        JSON.stringify({ success: false, error: 'Booking payload is required.' }),
        {
          status: 400,
          headers: {
            ...getCorsHeaders(req),
            'Content-Type': 'application/json',
          },
        }
      )
    }

    // 1. Verify Turnstile Token
    const isLocal = isLocalDev()
    const secretKey = Deno.env.get('TURNSTILE_SECRET_KEY') || (isLocal ? '1x00000000000000000000000000000000AA' : '');

    // In production, we do NOT allow silent fallback to dummy secret key
    if (!isLocal) {
      if (!secretKey || secretKey === '1x00000000000000000000AA' || secretKey === '1x00000000000000000000000000000000AA') {
        console.error('TURNSTILE_SECRET_KEY is missing or contains a dummy value in production.');
        return new Response(
          JSON.stringify({ success: false, error: 'Server configuration error' }),
          {
            status: 500,
            headers: {
              ...getCorsHeaders(req),
              'Content-Type': 'application/json',
            },
          }
        )
      }
    }

    const clientIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || '';

    // Verify Turnstile Token using Cloudflare Siteverify API
    const siteverifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    const siteverifyRes = await fetch(siteverifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: secretKey,
        response: turnstile_token || '',
        remoteip: clientIp,
      }),
    });

    const verification = await siteverifyRes.json();
    if (!verification.success) {
      console.warn('Turnstile validation failed:', verification);
      return new Response(
        JSON.stringify({ success: false, error: 'Security verification failed. Please try again.' }),
        {
          status: 400,
          headers: {
            ...getCorsHeaders(req),
            'Content-Type': 'application/json',
          },
        }
      )
    }

    // 2. Turnstile validated successfully. Now initialize database connection.
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Database connection credentials missing.');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        {
          status: 500,
          headers: {
            ...getCorsHeaders(req),
            'Content-Type': 'application/json',
          },
        }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call existing submit_booking_request database RPC
    const { data, error } = await supabase.rpc('submit_booking_request', {
      p_business_id: booking_input.business_id,
      p_full_name: booking_input.full_name,
      p_phone: booking_input.phone,
      p_email: booking_input.email || null,
      p_pet_name: booking_input.pet_name,
      p_pet_breed: booking_input.pet_breed || null,
      p_pet_size: booking_input.pet_size || null,
      p_pet_notes: booking_input.pet_notes || null,
      p_service_id: booking_input.service_id,
      p_start_time: booking_input.start_time,
      p_customer_notes: booking_input.customer_notes || null,
      p_pet_age_years: booking_input.pet_age_years !== undefined ? booking_input.pet_age_years : null,
      p_surname: booking_input.surname || null,
      p_pet_species: 'dog',
    })

    if (error) {
      console.error('Database RPC Error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 400,
          headers: {
            ...getCorsHeaders(req),
            'Content-Type': 'application/json',
          },
        }
      )
    }

    // Cast response from RPC JSON payload
    let result = data
    if (typeof result === 'string') {
      try {
        result = JSON.parse(result)
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    return new Response(
      JSON.stringify(result || { success: false, error: 'Empty response from booking database.' }),
      {
        status: 200,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (err: any) {
    console.error('Unexpected Edge Function error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'An unexpected server error occurred.' }),
      {
        status: 500,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
