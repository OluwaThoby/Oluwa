import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEmailDnsAuthentication } from '../src/lib/email/dns-auth-check.mjs';

const records = {
  'mail.example.com': ['v=spf1 include:spf.example.net -all'],
  '_dmarc.mail.example.com': ['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com'],
  's1._domainkey.mail.example.com': ['v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A'],
};
const lookupTxt = async host => {
  if (!records[host]) {
    const error = new Error('not found');
    error.code = 'ENODATA';
    throw error;
  }
  return records[host].map(value => [value.slice(0, 20), value.slice(20)]);
};

test('passes when SPF, DKIM and DMARC records are present and valid', async () => {
  const result = await checkEmailDnsAuthentication({
    domain: 'mail.example.com',
    fromAddress: 'hello@mail.example.com',
    dkimSelector: 's1',
    lookupTxt,
  });
  assert.equal(result.authenticated, true);
  assert.equal(result.checks.spf.status, 'pass');
  assert.equal(result.checks.dkim.status, 'pass');
  assert.equal(result.checks.dmarc.status, 'pass');
  assert.equal(result.checks.alignment.status, 'pass');
  assert.equal(result.inboxPlacementGuaranteed, false);
});

test('fails closed when an authentication record is missing', async () => {
  const result = await checkEmailDnsAuthentication({
    domain: 'mail.example.com',
    fromAddress: 'hello@mail.example.com',
    dkimSelector: 'missing',
    lookupTxt,
  });
  assert.equal(result.authenticated, false);
  assert.equal(result.checks.dkim.status, 'fail');
});

test('rejects invalid domains, selector and From-domain mismatch', async () => {
  const base = { domain: 'mail.example.com', fromAddress: 'hello@mail.example.com', dkimSelector: 's1', lookupTxt };
  await assert.rejects(() => checkEmailDnsAuthentication({ ...base, domain: 'bad domain' }), /invalid_domain/);
  await assert.rejects(() => checkEmailDnsAuthentication({ ...base, dkimSelector: 'bad.selector' }), /invalid_dkim_selector/);
  await assert.rejects(() => checkEmailDnsAuthentication({ ...base, fromAddress: 'hello@other.example' }), /from_domain_mismatch/);
});

test('fails closed when multiple SPF records exist', async () => {
  const lookupMultiple = async host => host === 'mail.example.com'
    ? ['v=spf1 include:a.example -all', 'v=spf1 include:b.example -all']
    : lookupTxt(host);
  const result = await checkEmailDnsAuthentication({
    domain: 'mail.example.com',
    fromAddress: 'hello@mail.example.com',
    dkimSelector: 's1',
    lookupTxt: lookupMultiple,
  });
  assert.equal(result.checks.spf.status, 'fail');
  assert.equal(result.authenticated, false);
});
