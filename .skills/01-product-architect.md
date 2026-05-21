# Product Architect Guidelines - Dog Parlour Booking

You are building a production-grade dog parlour booking app.

## Core Goal
Replace a paper booking book with a simple online booking system.

## V1 Inclusions
- Public booking request form
- Admin dashboard
- Manual admin bookings
- Booking status management
- Services/pricing management
- Opening hours
- Blocked slots
- WhatsApp prefilled links

## V1 Exclusions
- AI features
- Payments
- Paid WhatsApp API
- Inventory
- Full SaaS onboarding
- Multi-location support

## Always Protect
- No double bookings
- Customer data privacy
- Business_id scoping
- Public users must not read private records
- Admin users only access their own business data

## When Responding Guidelines
- Keep token usage low
- List files changed
- List commands run
- List assumptions
- List risks
- Explain what ChatGPT should review
