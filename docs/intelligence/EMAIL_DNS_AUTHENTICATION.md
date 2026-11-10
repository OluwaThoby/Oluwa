# DNS authentication verification

AgencyOS can inspect public TXT records for the exact sending domain and a supplied DKIM selector.

## Endpoint
`POST /api/email-deliverability/dns-check`
Body: `{ "domain": "mail.example.com", "from_address": "hello@mail.example.com", "dkim_selector": "s1" }`

The endpoint checks:
- Exactly one SPF TXT record beginning with `v=spf1`.
- Exactly one DMARC record at `_dmarc.<domain>` with a valid policy tag.
- Exactly one DKIM record at `<selector>._domainkey.<domain>` with a public key.
- Strict alignment between the From address domain and the checked domain.

The owner must obtain the DKIM selector from the chosen sending provider. The check is read-only and does not modify DNS or enable sending. DNS presence is not proof that a provider signs messages correctly; real-message authentication headers must be tested after provider configuration.

No DNS result guarantees inbox placement. The checker deliberately returns `inboxPlacementGuaranteed: false`.
