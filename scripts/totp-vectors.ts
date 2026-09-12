/**
 * Verifies the hand-written TOTP implementation against the published test vectors in
 * RFC 6238 Appendix B and RFC 4648 section 10, plus the drift and replay behavior this app
 * depends on. Run with `npm run test:totp`.
 *
 * This exists because the OTP code is implemented here rather than taken from a library: a
 * one-digit mistake in the truncation step still produces plausible-looking six-digit codes,
 * and only the vectors catch it.
 */
import { base32Decode, base32Encode } from "../src/lib/otp/base32.ts";
import { hotp, stepFor, totpCode, verifyTotp, type TotpAlgorithm, type TotpOptions } from "../src/lib/otp/totp.ts";

let pass = 0;
let fail = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = actual === expected;
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${actual}, want ${expected}`}`);
};

// --- RFC 4648 section 10 base32 vectors ---------------------------------------
const b32: [string, string][] = [
  ["", ""],
  ["f", "MY"],
  ["fo", "MZXQ"],
  ["foo", "MZXW6"],
  ["foob", "MZXW6YQ"],
  ["fooba", "MZXW6YTB"],
  ["foobar", "MZXW6YTBOI"],
];
for (const [plain, encoded] of b32) {
  check(`base32Encode(${JSON.stringify(plain)})`, base32Encode(Buffer.from(plain)), encoded);
  check(
    `base32Decode(${JSON.stringify(encoded)})`,
    Buffer.from(base32Decode(encoded)).toString(),
    plain,
  );
}
check("base32Decode tolerates spacing/lowercase/padding", Buffer.from(base32Decode("mzxw 6ytb-OI==")).toString(), "foobar");

// --- RFC 6238 Appendix B ------------------------------------------------------
// Seeds are the ASCII string "12345678901234567890" repeated to the hash block size.
const seeds: Record<TotpAlgorithm, Buffer> = {
  SHA1: Buffer.from("12345678901234567890"),
  SHA256: Buffer.from("12345678901234567890123456789012"),
  SHA512: Buffer.from("1234567890123456789012345678901234567890123456789012345678901234"),
};

const vectors: [number, string, string, string][] = [
  [59, "94287082", "46119246", "90693936"],
  [1111111109, "07081804", "68084774", "25091201"],
  [1111111111, "14050471", "67062674", "99943326"],
  [1234567890, "89005924", "91819424", "93441116"],
  [2000000000, "69279037", "90698825", "38618901"],
  [20000000000, "65353130", "77737706", "47863826"],
];

for (const [seconds, sha1, sha256, sha512] of vectors) {
  const perAlgorithm: [TotpAlgorithm, string][] = [
    ["SHA1", sha1],
    ["SHA256", sha256],
    ["SHA512", sha512],
  ];
  for (const [algorithm, expected] of perAlgorithm) {
    const options: TotpOptions = { digits: 8, period: 30, algorithm };
    const counter = stepFor(seconds * 1000, options.period);
    check(`RFC 6238 T=${seconds} ${algorithm}`, hotp(seeds[algorithm], counter, options), expected);
  }
}

// --- verify() behavior --------------------------------------------------------
const secret = base32Encode(seeds.SHA1);
const now = 59_000;
const opts: TotpOptions = { digits: 8, period: 30, algorithm: "SHA1" };

check("verify accepts the current step", verifyTotp(secret, "94287082", { atMs: now, options: opts }).valid, true);
check("verify rejects a wrong code", verifyTotp(secret, "00000000", { atMs: now, options: opts }).valid, false);
check("verify rejects a malformed code", verifyTotp(secret, "abc", { atMs: now, options: opts }).valid, false);

// Drift tolerance: a code from the previous step still works one step later.
const prev = hotp(seeds.SHA1, stepFor(now, 30) - 1n, opts);
check("verify accepts the previous step (drift)", verifyTotp(secret, prev, { atMs: now, options: opts }).valid, true);
check(
  "verify rejects the previous step when window=0",
  verifyTotp(secret, prev, { atMs: now, window: 0, options: opts }).valid,
  false,
);

// Replay: the same code must not be accepted twice.
const first = verifyTotp(secret, "94287082", { atMs: now, options: opts });
check("verify reports the matched step", first.step, stepFor(now, 30));
check(
  "verify refuses a step already spent (replay)",
  verifyTotp(secret, "94287082", { atMs: now, notBeforeStep: first.step, options: opts }).valid,
  false,
);

// Default options should produce 6 digits.
check("default options give 6 digits", totpCode(secret, now).length, 6);

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
