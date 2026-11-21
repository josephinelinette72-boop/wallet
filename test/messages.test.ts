/**
 * A message signature must verify for the address that signed it, and must
 * fail when the text changes. No network is involved.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountFromMnemonic } from '../src/account.js';
import { signPersonalMessage, verifyPersonalMessage } from '../src/messages.js';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('a personal signature verifies, and a different message does not', async () => {
  const { account, address } = accountFromMnemonic(PHRASE, 0);
  const { signature, hash } = await signPersonalMessage(account, 'hello');

  assert.equal(hash.startsWith('0x'), true);
  assert.equal(hash.length, 66);
  assert.equal(
    await verifyPersonalMessage({ address, message: 'hello', signature }),
    true,
  );
  assert.equal(
    await verifyPersonalMessage({ address, message: 'Hello', signature }),
    false,
  );
  assert.equal(
    await verifyPersonalMessage({
      address: '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0',
      message: 'hello',
      signature,
    }),
    false,
  );
});

test('index 0 and index 1 produce different signatures of the same text', async () => {
  const first = accountFromMnemonic(PHRASE, 0);
  const second = accountFromMnemonic(PHRASE, 1);
  const a = await signPersonalMessage(first.account, 'same text');
  const b = await signPersonalMessage(second.account, 'same text');
  assert.notEqual(a.signature, b.signature);
  assert.equal(a.hash, b.hash);
});
