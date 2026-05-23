# Low-Token Review Response Format - Dog Parlour Booking

## Purpose
Reduce token usage while still giving ChatGPT enough context to review changes safely.

## Rules

### 1. Default Response Style
For normal frontend/backend code changes, do not return full files unless explicitly requested.
Return concise review information only:
- File path
- What changed
- Why it changed
- Before snippet (if relevant)
- After snippet (if relevant)
- Commands run
- Build/test result
- Risks for ChatGPT to review

### 2. Snippet Size
Keep snippets small:
- Show only the changed function, component section, SQL block, or affected lines
- Avoid dumping entire files
- Avoid repeating unchanged code

### 3. When Changing One Small Section
Use this format:
A) File changed
B) Before
C) After
D) Why this change fixes the issue
E) Build/test result
F) Risks

### 4. When Many Files Changed
Use this format:
A) Files changed
B) Summary per file
C) Important snippets only
D) Commands run
E) Build/test result
F) Risks

### 5. Important Exception: SQL/RLS/RPC Migrations
For security-critical database work, always return the full final SQL migration for ChatGPT review before pushing.
This includes:
- RLS policies
- SECURITY DEFINER functions
- RPC functions
- triggers
- constraints
- permissions / GRANT / REVOKE
- Migrations that alter auth, business_id, customers, pets, bookings, profiles, or public access

*Reason: Small missing SQL details can create security bugs. ChatGPT must see the full final SQL before approval.*

### 6. Do Not Push Migrations Before ChatGPT Approval
For SQL/RLS/RPC changes:
- Propose SQL first
- Wait for ChatGPT approval
- Then create/apply/push migration

### 7. Never Include Secrets
Do not print:
- `.env` values
- `service_role` keys
- Database passwords
- Supabase access tokens

### 8. Keep Response Concise
Do not include long explanations unless there is a real risk, tradeoff, or architectural decision.
