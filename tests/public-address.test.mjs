import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress } from '../src/lib/security/public-address.mjs';

test('accepts public IPv4 and IPv6 addresses', () => {
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  assert.equal(isPublicAddress('2001:4860:4860::8888'), true);
});

test('blocks private, loopback, link-local and carrier-grade IPv4 ranges', () => {
  for (const ip of ['10.0.0.1','172.16.0.1','192.168.1.1','127.0.0.1','169.254.1.2','100.64.0.1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test('blocks reserved, documentation, benchmarking and multicast IPv4 ranges', () => {
  for (const ip of ['0.1.2.3','192.0.2.10','198.18.0.1','198.51.100.2','203.0.113.9','224.0.0.1','240.0.0.1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test('blocks non-global, mapped and special-purpose IPv6 ranges', () => {
  for (const ip of ['::','::1','fc00::1','fd12::1','fe80::1','ff02::1','::ffff:192.168.1.1','2001:db8::1','2002::1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test('rejects malformed addresses', () => {
  assert.equal(isPublicAddress('localhost'), false);
  assert.equal(isPublicAddress('999.1.1.1'), false);
});
