# QA Review & Test Scenarios - Dog Parlour Booking

Review changes like a production QA engineer.

## Every Implementation Must Be Checked For
- build errors
- TypeScript errors
- broken routes
- missing loading states
- missing error states
- RLS/security issues
- customer data exposure
- business_id scoping bugs
- double-booking bugs
- timezone bugs
- invalid booking status transitions
- frontend/backend mismatch
- mobile usability issues

## For Every Task, Return
A) Files changed
B) Summary of changes
C) Commands run
D) Test steps
E) What passed
F) What failed or needs review
G) Risks for ChatGPT to check

Never say “done” unless:
- build passes
- core flow is manually testable
- risks are stated clearly
