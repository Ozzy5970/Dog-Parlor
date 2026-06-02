# Dog Parlour: Business Owner Demo Guide

This guide details how to set up the Dog Parlour booking system with realistic 4–6 week operational data, and provides a step-by-step walkthrough to showcase the system to the parlour owner.

---

## 1. What Demo Data is Created
The seed script populates the database with realistic business activity linked to the business ID `8f7b76e1-95a9-4670-bbcf-2c8c67c8227b`:
- **40 Customers**: Generated with realistic South African names (Pieter Botha, Sipho Cele, Priya Naidoo, etc.) and valid phone formats.
- **45 Pets**: Popular breeds (Jack Russell, Labrador, German Shepherd, Chihuahua, Poodle, etc.) with custom ages and sizes.
- **90+ Bookings**: Distributed historically across the last 6 weeks, today's schedule, and upcoming dates.

All seeded profiles use the safety marker `email LIKE 'seed.customer%@example.com'`. Dependent pets and bookings are linked directly to these accounts, making database cleanup simple and safe.

---

## 2. SQL Commands

### How to Run the Demo Seed
You can apply the seed script by running the following Supabase command locally in your terminal (which applies it to the linked remote database):
```bash
supabase db execute --file supabase/seed_demo_bookings.sql
```
*Alternatively, you can copy the contents of `supabase/seed_demo_bookings.sql` and paste them into your remote database SQL Editor on the Supabase Dashboard.*

### How to Run the Cleanup (Wipe Demo Data)
To completely wipe all demo data from the database before real business usage, run:
```bash
supabase db execute --file supabase/cleanup_demo_bookings.sql
```
*Alternatively, copy the contents of `supabase/cleanup_demo_bookings.sql` and paste them into the Supabase Dashboard SQL Editor.*

---

## 3. Recommended Pages to Open
Open the following tabs in your browser for the presentation:
1. **Admin Dashboard**: `http://localhost:5173/admin` (or your production admin url)
2. **Bookings Page**: `http://localhost:5173/admin/bookings`
3. **Analytics Page**: `http://localhost:5173/admin/analytics`

---

## 4. Step-by-Step Meeting Walkthrough

Follow this script to wow the business owner:

### Step 1: The First Impression (Dashboard Overview)
1. Open the **Admin Dashboard**.
2. **Point out today's stats**:
   - Show the **This Month Revenue** card. Point out that this is only calculated from finalized checked-out bookings (i.e. where money has actually changed hands).
   - Point out **Today's Active Appointments** count and the operational checklist.

### Step 2: Handle Online Booking Requests (Awaiting Decision)
1. Point to the **Awaiting Confirmation** panel at the top right of the dashboard. Explain that these are online customer requests waiting for approval.
2. Locate a pending booking in the list (e.g. from customer `Pending 1` or `Pending 2`).
3. Click **Confirm Request**.
4. **WhatsApp Automation**:
   - Check that a new tab opens automatically with a pre-filled WhatsApp message.
   - Explain to the owner: *"Once approved, the system automatically opens WhatsApp with a pre-formatted template for you to send manually. This way, you keep customer communication personal without needing expensive business API integrations."*
   - Go back to the dashboard. Point out that the booking has now moved from *Awaiting Confirmation* to the *Today's Operations / Upcoming Active* list.

### Step 3: Check-In & Arrived State (Today's Operations)
1. Point to **Today's Operations** or the **Active Appointment Panel** (in the bottom right corner).
2. Locate a **Confirmed** booking that is due now (e.g. from `Confirmed Overdue 1` or `Confirmed Overdue 2`).
3. Click the **Arrived** button.
4. Point out the change:
   - The status updates to **Arrived** in the UI.
   - **Important**: Point out that the booking card **does not disappear** from the active workflow. Explain: *"In many apps, checked-in bookings vanish. Here, the arrived dog stays visible in your queue so you never forget who is currently in the shop or in the grooming tub."*

### Step 4: Checkout & Payment (The Revenue Rule)
1. Look at the same arrived booking card. You will see two buttons: **Paid R___ Cash** and **Paid R___ Card** displaying the exact service cost.
2. Click **Paid Card**.
3. **Observe the changes**:
   - The booking disappears from the active operations queue and moves to history.
   - **Show the revenue stats**: Point out that the **This Month Revenue** stat has updated. Explain: *"The revenue only updates when the dog is checked out and payment has been explicitly marked as Cash or Card. Arrived or Confirmed states do not skew your financial metrics."*

### Step 5: Handling No-Shows
1. Locate another due booking in the outcome panel.
2. Click **Did not arrive** (Mark No Show).
3. Point out that the booking moves out of the active queue without updating the revenue.

### Step 6: Review Bookings List
1. Open the **Manage Bookings** page.
2. Show the three operational tabs:
   - **Awaiting Confirmation**: Show that only `pending` requests appear here.
   - **Upcoming / Active**: Point out that this tab contains all `confirmed` and `arrived` dogs currently in progress today or scheduled next.
   - **History / Past & Closed**: Point out completed, cancelled, declined, and no-show bookings.

### Step 7: Business Reports & Analytics
1. Open the **Analytics** page.
2. **Point out the clear separation**:
   - **Actual Completed Revenue**: Point out the card showing the exact total for finalized grooms.
   - **Potential Revenue**: Point out the card showing estimated cashflow from bookings that are confirmed or arrived but not yet checked out.
   - **Breakdown Cards**: Show the separate totals for **Cash Revenue** vs **Card Revenue**, **Pending Requests**, **Checkout-Pending (Arrived)**, and **No-Shows**.
3. Show the **Monthly Business Report**:
   - Select the current month.
   - Show the layout, stats comparisons with the previous month, busiest days, and key insights.
   - Click **Print Report** to show the clean, printable layout options.
