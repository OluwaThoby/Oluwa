import { isIP } from 'node:net';

function ipv4Number(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function inCidr(address, network, bits) {
  const value = ipv4Number(address);
  const base = ipv4Number(network);
  if (value === null || base === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
}

function isPublicIpv4(address) {
  if (ipv4Number(address) === null) return false;
  const blocked = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
    ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
    ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
    ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ];
  return !blocked.some(([network, bits]) => inCidr(address, network, bits));
}

function isPublicIpv6(address) {
  const value = address.toLowerCase().split('%')[0];
  // Only global-unicast 2000::/3 addresses are eligible. This excludes
  // loopback, unspecified, link-local, ULA, multicast, mapped IPv4 and NAT64.
  if (!/^[23]/.test(value)) return false;

  // 2001:0000::/23 is reserved for protocol assignments; this also covers
  // benchmarking (2001:2::/48) and ORCHID (2001:10::/28, 2001:20::/28).
  if (value.startsWith('2001:')) {
    const secondHextet = Number.parseInt(value.split(':')[1] || '0', 16);
    if (Number.isFinite(secondHextet) && secondHextet <= 0x01ff) return false;
  }
  if (value.startsWith('2001:db8:') || value === '2001:db8') return false;
  if (value.startsWith('2002:')) return false; // 6to4
  return true;
}

export function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}
