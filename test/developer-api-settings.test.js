'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_DEVELOPER_APIS,
  seedDeveloperApiTemplates,
  applyTemplateCredentials,
  substituteCredential,
} = require('../lib/developer-api-presets');
const { ADMIN_PANEL_MENU, renderAdminNavigation } = require('../config/admin-panel-menu');
const createAdminApiSettingPage = require('../pages/admin-api-setting');

test('Developer API Presets - Robotic Exchange Template Specification', () => {
  const roboticExchange = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'Robotic Exchange');
  assert.ok(roboticExchange, 'Robotic Exchange template must exist in default presets');
  assert.equal(roboticExchange.developer_name, 'Ezytm Technologies');
  assert.equal(roboticExchange.service_type, 'Mobile Recharge');
  assert.equal(roboticExchange.is_active, true);

  // Check required parameters
  const reqKeys = roboticExchange.required_parameters.map(p => p.key);
  assert.ok(reqKeys.includes('Apimember_id'), 'Must require Apimember_id');
  assert.ok(reqKeys.includes('Api_password'), 'Must require Api_password');
  assert.equal(roboticExchange.required_parameters.length, 2, 'Should only have 2 required parameters (Member ID & Password)');

  // Check Balance endpoint
  const bal = roboticExchange.config.balance;
  assert.equal(bal.url, 'https://api.roboticexchange.in/Robotics/webservice/GetWalletBalance');
  assert.equal(bal.balanceKey, 'SellerWalletBalance');
  assert.equal(bal.requestType, 'GET');

  // Check Recharge endpoint
  const rech = roboticExchange.config.recharge;
  assert.equal(rech.url, 'https://api.roboticexchange.in/Robotics/webservice/GetMobileRecharge');
  assert.equal(rech.requestType, 'GET');
  assert.equal(rech.statusKey, 'STATUS');
  assert.equal(rech.successCodes, '1');
  assert.equal(rech.pendingCodes, '2');
  assert.equal(rech.failedCodes, '3');
  assert.equal(rech.supplierIdKey, 'ORDERID');
  assert.equal(rech.operatorIdKey, 'OPTRANSID');

  // Check Status check endpoint
  const status = roboticExchange.config.statusCheck;
  assert.equal(status.url, 'https://api.roboticexchange.in/Robotics/webservice/GetStatus');

  // Check Dispute endpoint
  const disp = roboticExchange.config.dispute;
  assert.equal(disp.url, 'https://api.roboticexchange.in/Robotics/webservice/RechargeComplaint');

  // Check operator code mappings
  const opCodes = roboticExchange.config.operatorCodes;
  assert.equal(opCodes.AIRTEL, 'AT');
  assert.equal(opCodes.JIO, 'JO');
  assert.equal(opCodes.VODAFONEIDEA, 'VI');
  assert.equal(opCodes.BSNL, 'BS');
  assert.equal(opCodes['SUN TV'], 'SD');

  // Check circle code mappings
  const circles = roboticExchange.config.circleCodes;
  assert.equal(circles.DELHI, '10');
  assert.equal(circles['UP WEST'], '97');
  assert.equal(circles.MUMBAI, '92');
  assert.equal(circles.BIHAR, '52');
});

test('Developer API Presets - Credential Substitution Engine', () => {
  const roboticExchange = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'Robotic Exchange');
  const userCredentials = {
    Apimember_id: '3083',
    Api_password: 'SecretPassword123',
  };

  const configured = applyTemplateCredentials(roboticExchange, userCredentials, 'My Robotic API');
  assert.equal(configured.name, 'My Robotic API');
  assert.equal(configured.balanceKey, 'SellerWalletBalance');

  // Balance params
  const balMemberParam = configured.parameters.find(p => p.key === 'Apimember_id');
  const balPassParam = configured.parameters.find(p => p.key === 'Api_password');
  assert.equal(balMemberParam.value, '3083');
  assert.equal(balPassParam.value, 'SecretPassword123');

  // Recharge params
  const rechParams = configured.recharge.parameters;
  const rechMember = rechParams.find(p => p.key === 'Apimember_id');
  const rechPass = rechParams.find(p => p.key === 'Api_password');
  const rechMobile = rechParams.find(p => p.key === 'Mobile_no');
  const rechOp = rechParams.find(p => p.key === 'Operator_code');
  const rechAmt = rechParams.find(p => p.key === 'Amount');
  const rechTxn = rechParams.find(p => p.key === 'Member_request_txnid');
  const rechCircle = rechParams.find(p => p.key === 'Circle');

  assert.equal(rechMember.value, '3083');
  assert.equal(rechPass.value, 'SecretPassword123');
  assert.equal(rechMobile.value, '{NUMBER}');
  assert.equal(rechOp.value, '{OPCODE}');
  assert.equal(rechAmt.value, '{AMOUNT}');
  assert.equal(rechTxn.value, '{TXNID}');
  assert.equal(rechCircle.value, '{CIRCLE}');

  // Status Check params
  const stParams = configured.statusCheck.parameters;
  assert.equal(stParams.find(p => p.key === 'Apimember_id').value, '3083');
  assert.equal(stParams.find(p => p.key === 'Member_request_txnid').value, '{TXNID}');

  // Dispute params
  const dispParams = configured.dispute.parameters;
  assert.equal(dispParams.find(p => p.key === 'Apimember_id').value, '3083');
  assert.equal(dispParams.find(p => p.key === 'OurRefTxnId').value, '{ORDERID}');
});

test('Admin Navigation - API Setting Menu in Settings', () => {
  const settingsMenu = ADMIN_PANEL_MENU.find(m => m.label === 'Settings');
  assert.ok(settingsMenu, 'Settings menu must exist in Admin Panel');
  const apiSettingItem = settingsMenu.items.find(i => i.label === 'API Setting');
  assert.ok(apiSettingItem, 'API Setting must exist under Settings menu');
  assert.equal(apiSettingItem.path, '/admin/settings/api-setting');

  const navHtml = renderAdminNavigation('/admin/settings/api-setting');
  assert.ok(navHtml.includes('/admin/settings/api-setting'), 'Admin navigation must include /admin/settings/api-setting link');
  assert.ok(navHtml.includes('API Setting'), 'Admin navigation must show API Setting text');
});

test('Admin API Setting Page - Render and Component Structure', async () => {
  const mockDb = {
    query: async () => ({
      rows: [
        {
          id: 'test-uuid-1',
          name: 'Robotic Exchange',
          developer_name: 'Ezytm Technologies',
          service_type: 'Mobile Recharge',
          description: 'Robotics API',
          is_active: true,
          required_parameters: [{ key: 'Apimember_id', label: 'Member ID', required: true }],
          config: {
            balance: { url: 'https://api.roboticexchange.in/test' },
            recharge: { url: 'https://api.roboticexchange.in/rech' },
            statusCheck: { url: 'https://api.roboticexchange.in/status' },
            dispute: { url: 'https://api.roboticexchange.in/dispute' },
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ]
    })
  };

  const { sendAdminApiSettingPage } = createAdminApiSettingPage({
    db: mockDb,
    httpError: (msg, status) => new Error(msg),
    sendJson: () => {}
  });

  let capturedHtml = '';
  const mockResponse = {
    writeHead: () => {},
    end: (html) => { capturedHtml = html; }
  };

  await sendAdminApiSettingPage({ id: 'admin-1', role: 'admin' }, mockResponse);

  assert.ok(capturedHtml.includes('Developer API Settings & Templates'), 'Page must have title');
  assert.ok(capturedHtml.includes('Robotic Exchange'), 'Page must list Robotic Exchange');
  assert.ok(capturedHtml.includes('Ezytm Technologies'), 'Page must list developer name');
  assert.ok(capturedHtml.includes('btnAddNewApi'), 'Page must have Add New API button');
  assert.ok(capturedHtml.includes('apiModal'), 'Page must include Add/Edit modal');
});
