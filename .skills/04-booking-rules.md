# Booking Rules & Scheduling Logic - Dog Parlour Booking

The booking system must prevent double bookings and invalid slots.

## Core Assumptions for V1
- one dog parlour business
- one grooming station/resource
- only one pending or confirmed booking can occupy a time range

## Booking Statuses
- pending blocks time
- confirmed blocks time
- completed does not block time
- cancelled does not block time
- no_show does not block time

## Availability Must Respect
- business opening hours
- business timezone: Africa/Johannesburg
- service duration
- existing pending/confirmed bookings
- blocked slots
- min_notice_hours
- max_advance_days
- slot_interval_minutes

Never trust frontend-only validation.

## Public Booking
- frontend shows available slots for UX
- RPC/database enforces final rules
- end_time must be calculated from service duration
- blocked slots must reject bookings
- outside opening hours must reject bookings
- too-soon bookings must reject
- too-far-ahead bookings must reject

## Edge Cases to Test
- overlapping booking blocked
- adjacent booking allowed
- cancelled booking frees slot
- pending booking blocks slot
- blocked slot blocks booking
- booking outside hours rejected
- booking on closed day rejected
- booking crossing closing time rejected
