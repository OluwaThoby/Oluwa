# AgencyOS email deliverability and sending safety

## The promise we can honestly make
AgencyOS cannot guarantee a 99% inbox-placement rate. Gmail, Microsoft, Yahoo and recipient organisations independently decide whether a message reaches the inbox, promotions, quarantine or spam. No sending provider or agency can guarantee a fixed inbox-placement percentage across all recipients.

We can set an operational target for **accepted delivery** (messages accepted by recipient mail servers) and monitor it separately from **inbox placement**, which is only measurable through supported seed tests or mailbox-provider feedback and is never universally observable. A provider's "delivered" event normally means accepted by the receiving server, not proven inbox placement.

## Release gates before any campaign can send
1. Verify control of the From domain and exact sender identity.
2. Publish and validate SPF, DKIM and DMARC; require aligned authentication for the From domain. Start DMARC in monitoring mode, inspect reports, then tighten policy deliberately.
3. Configure a dedicated sending subdomain and stable, truthful From identity. Keep transactional and prospecting streams separated where practical.
4. Require a valid, permitted recipient source and check syntax/domain/MX where available. Do not treat an MX record or a third-party "valid" result as proof that a person consented or that the mailbox exists.
5. Check suppression, prior opt-out, hard bounce and complaint lists immediately before every send.
6. Require approved content version, truthful subject/from identity, relevant personalisation, working links and legally required sender/address/unsubscribe details.
7. Enforce campaign and daily caps, gradual volume increases, duplicate prevention and a per-sender pause switch.
8. Process provider webhooks with signature verification. Persist accepted, delivered, deferred, bounced, complained and unsubscribed as distinct events.
9. Automatically suppress hard bounces and complaints; honour unsubscribe requests promptly. Never retry permanent failures or opt-outs.
10. Pause a sender/campaign on authentication failure, unexpected volume, elevated hard bounces/complaints, provider deferrals or unusual error rates.

## Metrics and operating targets
Track separately:
- Provider acceptance rate = accepted by recipient servers / attempted.
- Hard-bounce rate = permanent failures / attempted.
- Complaint rate = spam complaints / delivered or provider-defined denominator.
- Unsubscribe rate, deferrals, blocks, and provider-specific reputation signals.
- Inbox placement = independently measured inbox results / seed messages tested; report the sample size and mailbox-provider mix.

Do not label provider acceptance as inbox placement. Do not advertise "99% inbox delivery" unless the exact metric, period, denominator, provider mix and independent evidence are disclosed. A high acceptance rate does not prove inbox placement.

## Conservative initial operation
Start with low, permission-based volume to known, relevant recipients. Increase only after stable authentication and healthy provider metrics over a meaningful sample. Do not use purchased lists, scraped personal addresses, deceptive subject lines, domain rotation to evade reputation controls, or retries designed to bypass provider limits. Follow applicable privacy, direct-marketing and provider rules for each recipient's jurisdiction.

## AgencyOS execution contract
The deterministic preflight in `src/lib/email/deliverability-policy.mjs` is a local safety gate, not a deliverability predictor and not a sender. It blocks a send unless identity/authentication, recipient eligibility, suppression, content approval, scoped execution permission, idempotency and volume limits are present. A future provider adapter must repeat authoritative checks server-side immediately before the external side effect and verify signed provider events.

## Current boundary
No sending provider or authenticated sending domain is configured in AgencyOS. This work does not send email, configure DNS, warm a domain, or claim any inbox-placement percentage. Those require a domain/provider chosen by the owner and verified configuration.