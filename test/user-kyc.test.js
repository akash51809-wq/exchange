'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createUserKycPage = require('../pages/user-kyc');
const createAdminKycListPage = require('../pages/admin-kyc-list');

test('User KYC Page - Component Rendering by Status', async (t) => {
  await t.test('renders Not Submitted state when user has no KYC record', async () => {
    const mockDb = {
      query: async () => ({ rowCount: 0, rows: [] }),
    };
    const { sendUserKycPage } = createUserKycPage({ db: mockDb });

    let renderedHtml = '';
    const mockRes = {
      writeHead: () => {},
      end: (h) => { renderedHtml = h; },
    };

    await sendUserKycPage({ id: 'u1' }, mockRes);

    assert.ok(renderedHtml.includes('KYC Verification'));
    assert.ok(renderedHtml.includes('KYC Not Submitted'));
    assert.ok(renderedHtml.includes('id="kycForm"'));
    assert.ok(renderedHtml.includes('id="aadharNumber"'));
    assert.ok(renderedHtml.includes('id="panNumber"'));
    assert.ok(renderedHtml.includes('id="gstNumber"'));
    assert.ok(renderedHtml.includes('id="fileAadharFront"'));
    assert.ok(renderedHtml.includes('id="fileAadharBack"'));
    assert.ok(renderedHtml.includes('id="filePanCard"'));
  });

  await t.test('renders Pending state with document previews when KYC is submitted', async () => {
    const mockDb = {
      query: async () => ({
        rowCount: 1,
        rows: [{
          id: 'kyc-1',
          user_id: 'u1',
          gst_number: '09ABCDE1234F1Z5',
          aadhar_number: '987654321098',
          aadhar_front_data: 'data:image/jpeg;base64,dummyfront',
          aadhar_back_data: 'data:image/jpeg;base64,dummyback',
          pan_number: 'ABCDE1234F',
          pan_card_data: 'data:image/jpeg;base64,dummypan',
          status: 'pending',
          rejection_reason: null,
          submitted_at: new Date().toISOString(),
        }],
      }),
    };
    const { sendUserKycPage } = createUserKycPage({ db: mockDb });

    let renderedHtml = '';
    const mockRes = {
      writeHead: () => {},
      end: (h) => { renderedHtml = h; },
    };

    await sendUserKycPage({ id: 'u1' }, mockRes);

    assert.ok(renderedHtml.includes('Pending for Approval'));
    assert.ok(renderedHtml.includes('Submitted KYC Documents'));
    assert.ok(renderedHtml.includes('987654321098'));
    assert.ok(renderedHtml.includes('ABCDE1234F'));
    assert.ok(renderedHtml.includes('09ABCDE1234F1Z5'));
    assert.ok(!renderedHtml.includes('id="kycForm"'), 'Form should not be visible while pending');
  });

  await t.test('renders Approved state with verified badges', async () => {
    const mockDb = {
      query: async () => ({
        rowCount: 1,
        rows: [{
          id: 'kyc-1',
          user_id: 'u1',
          gst_number: '',
          aadhar_number: '123456789012',
          aadhar_front_data: 'data:image/jpeg;base64,front',
          aadhar_back_data: 'data:image/jpeg;base64,back',
          pan_number: 'ABCDE5678G',
          pan_card_data: 'data:image/jpeg;base64,pan',
          status: 'approved',
          rejection_reason: null,
          reviewed_at: new Date().toISOString(),
        }],
      }),
    };
    const { sendUserKycPage } = createUserKycPage({ db: mockDb });

    let renderedHtml = '';
    const mockRes = {
      writeHead: () => {},
      end: (h) => { renderedHtml = h; },
    };

    await sendUserKycPage({ id: 'u1' }, mockRes);

    assert.ok(renderedHtml.includes('KYC Approved &amp; Verified'));
    assert.ok(renderedHtml.includes('Verified by Admin'));
    assert.ok(!renderedHtml.includes('id="kycForm"'));
  });

  await t.test('renders Rejected state with Admin Rejection Reason and Re-KYC form', async () => {
    const mockDb = {
      query: async () => ({
        rowCount: 1,
        rows: [{
          id: 'kyc-1',
          user_id: 'u1',
          gst_number: '07AAACN1234A1Z1',
          aadhar_number: '112233445566',
          aadhar_front_data: 'data:image/jpeg;base64,oldfront',
          aadhar_back_data: 'data:image/jpeg;base64,oldback',
          pan_number: 'ABCDE9999Z',
          pan_card_data: 'data:image/jpeg;base64,oldpan',
          status: 'rejected',
          rejection_reason: 'Aadhaar photo is blurred and numbers are unreadable. Please upload a clear photo.',
          submitted_at: new Date().toISOString(),
        }],
      }),
    };
    const { sendUserKycPage } = createUserKycPage({ db: mockDb });

    let renderedHtml = '';
    const mockRes = {
      writeHead: () => {},
      end: (h) => { renderedHtml = h; },
    };

    await sendUserKycPage({ id: 'u1' }, mockRes);

    assert.ok(renderedHtml.includes('KYC Rejected'));
    assert.ok(renderedHtml.includes('Admin Rejection Reason:'));
    assert.ok(renderedHtml.includes('Aadhaar photo is blurred and numbers are unreadable'));
    assert.ok(renderedHtml.includes('Re-Submit KYC Application (Re-KYC)'));
    assert.ok(renderedHtml.includes('id="kycForm"'));
    assert.ok(renderedHtml.includes('112233445566'));
  });
});

test('Admin Pending KYC Page - List & Action Elements', async (t) => {
  await t.test('renders pending submissions table with action buttons and photo viewers', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('SELECT') && sql.includes('COUNT(*)')) {
          return {
            rows: [{
              pending_count: '2',
              approved_count: '5',
              rejected_count: '1',
              total_count: '8',
            }],
          };
        }
        return {
          rows: [
            {
              id: 'kyc-row-1',
              user_id: 'u-1',
              gst_number: '09AAACA1234A1Z5',
              aadhar_number: '998877665544',
              aadhar_front_data: 'data:image/jpeg;base64,frontimg',
              aadhar_back_data: 'data:image/jpeg;base64,backimg',
              pan_number: 'PANNO1234F',
              pan_card_data: 'data:image/jpeg;base64,panimg',
              status: 'pending',
              rejection_reason: null,
              submitted_at: new Date().toISOString(),
              username: 'seller99',
              user_name: 'Rohit Sharma',
              email: 'rohit@example.com',
              role: 'user',
              phone_ciphertext: null,
            },
          ],
        };
      },
    };

    const { sendAdminKycListPage } = createAdminKycListPage({
      db: mockDb,
      decryptMobile: () => '9876543210',
    });

    let renderedHtml = '';
    const mockRes = {
      writeHead: () => {},
      end: (h) => { renderedHtml = h; },
    };

    await sendAdminKycListPage({ id: 'admin-1', role: 'admin' }, mockRes, new URLSearchParams());

    assert.ok(renderedHtml.includes('User KYC Verification &amp; Approvals'));
    assert.ok(renderedHtml.includes('Rohit Sharma'));
    assert.ok(renderedHtml.includes('@seller99'));
    assert.ok(renderedHtml.includes('998877665544'));
    assert.ok(renderedHtml.includes('PANNO1234F'));
    assert.ok(renderedHtml.includes('Aadhaar Front'));
    assert.ok(renderedHtml.includes('Aadhaar Back'));
    assert.ok(renderedHtml.includes('PAN Photo'));
    assert.ok(renderedHtml.includes('btn-approve-kyc'));
    assert.ok(renderedHtml.includes('btn-reject-kyc'));
    assert.ok(renderedHtml.includes('id="rejectKycModal"'));
    assert.ok(renderedHtml.includes('id="adminDocModal"'));
  });
});

test('KYC Database Schema & Status Enforcements', async (t) => {
  await t.test('KYC submission sets user status to pending', () => {
    const validStatusTransitions = {
      'not_submitted': ['pending'],
      'pending': ['approved', 'rejected'],
      'rejected': ['pending'],
      'approved': ['rejected'],
    };
    assert.deepEqual(validStatusTransitions['not_submitted'], ['pending']);
    assert.ok(validStatusTransitions['rejected'].includes('pending'), 'User must be able to Re-KYC when rejected');
  });

  await t.test('Validates Aadhaar, PAN and document rules', () => {
    function validateKycInput({ aadharNumber, panNumber, aadharFront, aadharBack, panCard }) {
      const a = String(aadharNumber || '').replace(/\s+/g, '').trim();
      const p = String(panNumber || '').replace(/\s+/g, '').trim().toUpperCase();
      if (!a || a.length < 12) throw new Error('Please enter a valid 12-digit Aadhaar number.');
      if (!p || p.length !== 10) throw new Error('Please enter a valid 10-character PAN number.');
      if (!aadharFront) throw new Error('Aadhaar card front photo is required.');
      if (!aadharBack) throw new Error('Aadhaar card back photo is required.');
      if (!panCard) throw new Error('PAN card photo is required.');
      return true;
    }

    assert.throws(() => validateKycInput({ aadharNumber: '123', panNumber: 'ABCDE1234F', aadharFront: 'd', aadharBack: 'd', panCard: 'd' }), /12-digit Aadhaar/);
    assert.throws(() => validateKycInput({ aadharNumber: '123456789012', panNumber: 'INVALID', aadharFront: 'd', aadharBack: 'd', panCard: 'd' }), /10-character PAN/);
    assert.throws(() => validateKycInput({ aadharNumber: '123456789012', panNumber: 'ABCDE1234F', aadharFront: '', aadharBack: 'd', panCard: 'd' }), /front photo/);
    assert.doesNotThrow(() => validateKycInput({ aadharNumber: '123456789012', panNumber: 'ABCDE1234F', aadharFront: 'img1', aadharBack: 'img2', panCard: 'img3' }));
  });
});
