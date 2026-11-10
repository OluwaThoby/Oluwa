/**
 * DNS authentication checks for an email sending domain.
 * Checks published DNS evidence only; it does not prove inbox placement.
 */
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const SELECTOR_RE = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/i;

function flattenTxt(records) {
  return records.map(parts => Array.isArray(parts) ? parts.join('') : String(parts));
}

async function lookup(name, lookupTxt) {
  try {
    return flattenTxt(await lookupTxt(name));
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : '';
    if (code === 'ENODATA' || code === 'ENOTFOUND' || code === 'NXDOMAIN') return [];
    throw error;
  }
}

export async function checkEmailDnsAuthentication({
  domain,
  fromAddress,
  dkimSelector,
  lookupTxt,
}) {
  const normalizedDomain = typeof domain === 'string' ? domain.trim().toLowerCase() : '';
  const normalizedFrom = typeof fromAddress === 'string' ? fromAddress.trim().toLowerCase() : '';
  const selector = typeof dkimSelector === 'string' ? dkimSelector.trim() : '';

  if (!DOMAIN_RE.test(normalizedDomain)) throw new Error('invalid_domain');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedFrom)) throw new Error('invalid_from_address');
  if (normalizedFrom.split('@')[1] !== normalizedDomain) throw new Error('from_domain_mismatch');
  if (!SELECTOR_RE.test(selector)) throw new Error('invalid_dkim_selector');
  if (typeof lookupTxt !== 'function') throw new Error('dns_lookup_unavailable');

  const [rootRecords, dmarcRecords, dkimRecords] = await Promise.all([
    lookup(normalizedDomain, lookupTxt),
    lookup(`_dmarc.${normalizedDomain}`, lookupTxt),
    lookup(`${selector}._domainkey.${normalizedDomain}`, lookupTxt),
  ]);

  const spfRecords = rootRecords.filter(record => /^v=spf1(?:\s|$)/i.test(record.trim()));
  const dmarcCandidates = dmarcRecords.filter(record => /^v=DMARC1(?:;|\s|$)/i.test(record.trim()));
  const dkimCandidates = dkimRecords.filter(record => /(?:^|;)\s*v=DKIM1(?:;|\s|$)/i.test(record.trim()));

  const spf = spfRecords.length === 1 ? 'pass' : 'fail';
  const dmarc = dmarcCandidates.length === 1 && /(?:^|;)\s*p=(none|quarantine|reject)(?:;|\s|$)/i.test(dmarcCandidates[0]) ? 'pass' : 'fail';
  const dkim = dkimCandidates.length === 1 && /(?:^|;)\s*p=[a-z0-9+/=]+(?:;|$)/i.test(dkimCandidates[0]) ? 'pass' : 'fail';

  return {
    domain: normalizedDomain,
    fromAddress: normalizedFrom,
    selector,
    checks: {
      spf: { status: spf, recordCount: spfRecords.length },
      dkim: { status: dkim, recordCount: dkimCandidates.length, hostname: `${selector}._domainkey.${normalizedDomain}` },
      dmarc: { status: dmarc, recordCount: dmarcCandidates.length, hostname: `_dmarc.${normalizedDomain}` },
      alignment: { status: 'pass', mode: 'strict', note: 'The From address domain exactly matches the checked domain.' },
    },
    authenticated: spf === 'pass' && dkim === 'pass' && dmarc === 'pass',
    inboxPlacementGuaranteed: false,
    checkedAt: new Date().toISOString(),
  };
}
