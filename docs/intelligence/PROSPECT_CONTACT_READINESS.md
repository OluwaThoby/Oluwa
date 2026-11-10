# Prospect contact evidence and readiness

AgencyOS separates discovering a business, saving an outreach draft, reviewing contact evidence, approving a message, and actually sending it. A public email address is not automatically permission to contact someone.

## Current readiness checklist

The owner-only `GET /api/prospects/eligibility` endpoint evaluates saved prospect records against:

- A syntactically valid business email address.
- A traceable HTTPS source URL for the contact.
- A recorded evidence category: `explicit_consent`, `existing_customer_relationship`, `legitimate_interest_reviewed`, or `public_business_contact_reviewed`.
- No suppression or do-not-contact status.

The accepted evidence values are workflow labels, not legal conclusions. In particular, a public business contact address does not itself prove consent or establish a lawful basis. The owner must verify the source, purpose, jurisdiction, relevance, applicable law, and the sending provider's current acceptable-use policy.

## Hard boundaries

- Readiness means the evidence is complete enough to enter a separate human approval step; it is not permission to send.
- The endpoint never sends, schedules, approves, or creates a scoped execution grant.
- Suppression always blocks readiness.
- Missing or ambiguous evidence fails closed.
- Draft creation remains available as a private preparation activity; it does not make the recipient contactable.
- No bulk cold-email, scraped-list, or provider-policy circumvention workflow is enabled.

## Data model note

This first iteration reads existing prospect fields only (`business_email`, `source_url`, `consent_basis`, and `status`). It does not alter the live database or invent missing columns. A dedicated reviewed-at/by audit record should be added through a separately approved database migration before this becomes a multi-user workflow.
