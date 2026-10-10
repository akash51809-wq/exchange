'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function validatePasswordPolicy(password) {
  if (typeof password !== 'string') return { valid: false, error: 'Password must be a string.' };
  if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters long.' };
  if (password.length > 64) return { valid: false, error: 'Password cannot exceed 64 characters.' };
  if (!/[A-Z]/.test(password)) return { valid: false, error: 'Password must contain at least one uppercase letter.' };
  if (!/[a-z]/.test(password)) return { valid: false, error: 'Password must contain at least one lowercase letter.' };
  if (!/[0-9]/.test(password)) return { valid: false, error: 'Password must contain at least one number.' };
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character.' };
  }
  return { valid: true };
}

describe('Password Complexity Policy Tests', () => {
  it('accepts compliant strong passwords', () => {
    assert.strictEqual(validatePasswordPolicy('Exchange@2026!').valid, true);
    assert.strictEqual(validatePasswordPolicy('Admin#Secure99').valid, true);
    assert.strictEqual(validatePasswordPolicy('P@ssw0rdSecure!').valid, true);
  });

  it('rejects passwords shorter than 8 characters', () => {
    const res = validatePasswordPolicy('Ab1!xyz');
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /at least 8 characters/);
  });

  it('rejects old 6-digit numeric-only passwords', () => {
    const res = validatePasswordPolicy('123456');
    assert.strictEqual(res.valid, false);
  });

  it('rejects passwords without uppercase letters', () => {
    const res = validatePasswordPolicy('exchange@2026!');
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /uppercase/);
  });

  it('rejects passwords without lowercase letters', () => {
    const res = validatePasswordPolicy('EXCHANGE@2026!');
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /lowercase/);
  });

  it('rejects passwords without numbers', () => {
    const res = validatePasswordPolicy('Exchange@Admin!');
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /number/);
  });

  it('rejects passwords without special characters', () => {
    const res = validatePasswordPolicy('Exchange2026Admin');
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /special character/);
  });
});
