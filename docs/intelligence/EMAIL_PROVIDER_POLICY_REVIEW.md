# Provider selection: cold outreach compatibility

Reviewed provider policies on 10 November 2026. This is a policy-fit review, not legal advice or a guarantee that a provider will approve an account.

| Provider | Published rule relevant to AgencyOS | Decision |
|---|---|---|
| Resend | Prohibits unsolicited email, expressly including cold outreach, purchased lists and scraped contact data. Requires explicit opt-in. | Do not use for prospecting outreach. |
| Brevo | Requires active, explicit and specific consent; its anti-spam policy is opt-in based. | Do not use for prospecting outreach without documented opt-in. |
| Amazon SES | Can suspend accounts for unsolicited email; its enforcement guidance asks whether recipients specifically requested the messages and how addresses were acquired. | Do not assume it is suitable for cold prospecting. Obtain written provider approval before use. |
| SMTP2GO | Explicitly prohibits cold email and lists internet-scraped addresses and marketing leads as disallowed. | Do not use for prospecting outreach. |
| Mailgun | Requires express, provable consent for non-transactional email and evidence of that consent. | Do not use for prospecting outreach without documented consent. |
| Twilio SendGrid | Prohibits unsolicited bulk email and emailing addresses obtained from the internet/social media or generic aliases without prior affirmative consent. | Do not use for prospecting outreach without affirmative consent. |

## Sources

- Resend Acceptable Use Policy: https://resend.com/legal/acceptable-use
- Brevo anti-spam policy: https://help.brevo.com/hc/en-us/articles/209405205-What-is-the-anti-spam-policy-of-Brevo
- AWS SES enforcement FAQ: https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html
- SMTP2GO Terms: https://www.smtp2go.com/terms/
- Mailgun Acceptable Use Policy: https://www.mailgun.com/legal/aup/
- Twilio Email Policy: https://www.twilio.com/en-us/legal/service-country-specific-terms/email

## AgencyOS decision

Do not wire AgencyOS's prospecting engine to an email provider whose published policy prohibits the intended recipient acquisition or outreach method. A technically successful API integration would not make the use permitted and could put the sender account and domain reputation at risk.

The provider-neutral webhook and delivery-event ingestion layer is built, but no provider is connected. Before selecting a provider, verify its current written policy for targeted B2B prospecting, the jurisdictions and recipient types involved, and any volume or consent conditions. A mailbox connection is not an automatic exemption from mailbox-provider rules or applicable law.

Until a compatible route is verified, keep email sending disabled. AgencyOS can still research prospects, prepare tailored drafts for human review, and support non-email contact channels where lawful and appropriate.
