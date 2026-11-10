/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SDK, SDK_SHA } from '../../tools/gf-sdk';

// The Toss build ships the reviewed GFactory SDK 0.37.1 (the same lock as 사천팝 tests/sdk-lock.test.ts).
it('SDK lock: vendor file and tools/gf-sdk.ts hash match the reviewed 0.37.1', () => {
  expect(SDK).toBe('gf-sdk@0.37.1.js');
  expect(SDK_SHA).toBe('ad0f32f65e6e97c3ef3aad9fb045a0c659653b29d633b6590459890bf2737089');
  expect(createHash('sha256').update(readFileSync(`vendor/${SDK}`)).digest('hex')).toBe(SDK_SHA);
  expect(readdirSync('vendor').filter((f) => f.startsWith('gf-sdk'))).toEqual([SDK]);
});
