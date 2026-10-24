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

test('Developer API Presets - M robo Template Specification', () => {
  const mRobo = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'M robo');
  assert.ok(mRobo, 'M robo template must exist in default presets');
  assert.equal(mRobo.developer_name, 'MRobotics');
  assert.equal(mRobo.service_type, 'Mobile Recharge');
  assert.equal(mRobo.is_active, true);

  // Check required parameters - only api_token
  const reqKeys = mRobo.required_parameters.map(p => p.key);
  assert.ok(reqKeys.includes('api_token'), 'Must require api_token');
  assert.equal(mRobo.required_parameters.length, 1, 'Should only have 1 required parameter (API Token)');

  // Check Balance endpoint
  const bal = mRobo.config.balance;
  assert.equal(bal.url, 'https://mrobotics.in/api/operator_balance');
  assert.equal(bal.balanceKey, 'data');
  assert.equal(bal.requestType, 'GET');

  // Check Recharge endpoint
  const rech = mRobo.config.recharge;
  assert.equal(rech.url, 'https://mrobotics.in/api/recharge');
  assert.equal(rech.requestType, 'POST');
  assert.equal(rech.statusKey, 'status');
  assert.equal(rech.successCodes, 'success');
  assert.equal(rech.pendingCodes, 'pending');
  assert.equal(rech.failedCodes, 'failure,failed');
  assert.equal(rech.supplierIdKey, 'id');
  assert.equal(rech.operatorIdKey, 'tnx_id');
  assert.equal(rech.messageKey, 'response');

  // Check Status check endpoint
  const status = mRobo.config.statusCheck;
  assert.equal(status.url, 'https://mrobotics.in/api/order_id_status');
  assert.equal(status.requestType, 'GET');
  assert.equal(status.statusKey, 'status');
  assert.equal(status.supplierIdKey, 'id');
  assert.equal(status.operatorIdKey, 'tnx_id');

  // Check operator code mappings
  const opCodes = mRobo.config.operatorCodes;
  assert.equal(opCodes.AIRTEL, '2');
  assert.equal(opCodes.AT, '2');
  assert.equal(opCodes.JIO, '5');
  assert.equal(opCodes.JO, '5');
  assert.equal(opCodes.VODAFONE, '1');
  assert.equal(opCodes.IDEA, '3');
  assert.equal(opCodes.BSNL, '4');
  assert.equal(opCodes.DISHTV, '6');
  assert.equal(opCodes.TATASKY, '7');
  assert.equal(opCodes.SUNDIRECT, '12');
  assert.equal(opCodes.VIDEOCON, '28');
  assert.equal(opCodes['AIRTEL DTH'], '24');
});

test('Developer API Presets - M robo Credential Substitution Engine', () => {
  const mRobo = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'M robo');
  const userCredentials = {
    api_token: '12345678-1234-1234-1234-123456789012',
  };

  const configured = applyTemplateCredentials(mRobo, userCredentials, 'My M Robo');
  assert.equal(configured.name, 'My M Robo');
  assert.equal(configured.balanceKey, 'data');
  assert.equal(configured.url, 'https://mrobotics.in/api/operator_balance?api_token=12345678-1234-1234-1234-123456789012');

  // Balance params
  const balTokenParam = configured.parameters.find(p => p.key === 'api_token');
  assert.equal(balTokenParam.value, '12345678-1234-1234-1234-123456789012');

  // Recharge params
  assert.equal(configured.recharge.requestType, 'POST');
  assert.equal(configured.recharge.url, 'https://mrobotics.in/api/recharge');
  const rechParams = configured.recharge.parameters;
  assert.equal(rechParams.find(p => p.key === 'api_token').value, '12345678-1234-1234-1234-123456789012');
  assert.equal(rechParams.find(p => p.key === 'mobile_no').value, '{NUMBER}');
  assert.equal(rechParams.find(p => p.key === 'amount').value, '{AMOUNT}');
  assert.equal(rechParams.find(p => p.key === 'company_id').value, '{OPCODE}');
  assert.equal(rechParams.find(p => p.key === 'order_id').value, '{TXNID}');
  assert.equal(rechParams.find(p => p.key === 'is_stv').value, 'false');

  // Status check params
  assert.equal(configured.statusCheck.requestType, 'GET');
  assert.equal(configured.statusCheck.url, 'https://mrobotics.in/api/order_id_status');
  const stParams = configured.statusCheck.parameters;
  assert.equal(stParams.find(p => p.key === 'api_token').value, '12345678-1234-1234-1234-123456789012');
  assert.equal(stParams.find(p => p.key === 'order_id').value, '{ORDERID}');
});

test('Developer API Presets - real robo Template Specification', () => {
  const realRobo = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'real robo');
  assert.ok(realRobo, 'real robo template must exist in default presets');
  assert.equal(realRobo.developer_name, 'RealRobo');
  assert.equal(realRobo.service_type, 'Mobile Recharge');
  assert.equal(realRobo.is_active, true);

  // Check required parameters - only api_token
  const reqKeys = realRobo.required_parameters.map(p => p.key);
  assert.ok(reqKeys.includes('api_token'), 'Must require api_token');
  assert.equal(realRobo.required_parameters.length, 1, 'Should only have 1 required parameter (API Token)');

  // Check Balance endpoint
  const bal = realRobo.config.balance;
  assert.equal(bal.url, 'https://realrobo.in/api/balance');
  assert.equal(bal.balanceKey, 'data.balance');
  assert.equal(bal.requestType, 'GET');

  // Check Recharge endpoint
  const rech = realRobo.config.recharge;
  assert.equal(rech.url, 'https://realrobo.in/api/recharge');
  assert.equal(rech.requestType, 'POST');
  assert.equal(rech.statusKey, 'status');
  assert.equal(rech.successCodes, 'success');
  assert.equal(rech.pendingCodes, 'pending');
  assert.equal(rech.failedCodes, 'failure,failed');
  assert.equal(rech.supplierIdKey, 'recharge_id');
  assert.equal(rech.operatorIdKey, 'txid');
  assert.equal(rech.memberReqIdKey, 'req_id');
  assert.equal(rech.messageKey, 'message');

  // Check Status check endpoint
  const status = realRobo.config.statusCheck;
  assert.equal(status.url, 'https://realrobo.in/api/status_check');
  assert.equal(status.requestType, 'GET');
  assert.equal(status.statusKey, 'status');
  assert.equal(status.supplierIdKey, 'recharge_id');
  assert.equal(status.operatorIdKey, 'txid');

  // Check Dispute endpoint
  const disp = realRobo.config.dispute;
  assert.equal(disp.url, 'https://realrobo.in/api/raise_complaint');
  assert.equal(disp.requestType, 'POST');
  assert.equal(disp.statusKey, 'status');
  assert.equal(disp.successCodes, 'true,1,SUCCESS');

  // Check operator code mappings
  const opCodes = realRobo.config.operatorCodes;
  assert.equal(opCodes.AIRTEL, '1');
  assert.equal(opCodes.BSNL, '2');
  assert.equal(opCodes.JIO, '3');
  assert.equal(opCodes.VI, '4');
  assert.equal(opCodes.VODAFONE, '4');
  assert.equal(opCodes.IDEA, '4');
  assert.equal(opCodes['AIRTEL DTH'], '5');
  assert.equal(opCodes.DISHTV, '6');
  assert.equal(opCodes.SUNDIRECT, '7');
  assert.equal(opCodes.TATASKY, '8');
  assert.equal(opCodes['TATA PLAY'], '8');
  assert.equal(opCodes.VIDEOCON, '9');
  assert.equal(opCodes.D2H, '9');

  // Check circle code mappings
  const circles = realRobo.config.circleCodes;
  assert.equal(circles['ANDHRA PRADESH'], '1');
  assert.equal(circles.DELHI, '5');
  assert.equal(circles.MUMBAI, '15');
  assert.equal(circles['UP WEST'], '22');
  assert.equal(circles.BIHAR, '3');
});

test('Developer API Presets - real robo Credential Substitution Engine', () => {
  const realRobo = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'real robo');
  const userCredentials = {
    api_token: 'realrobo-secret-token-12345',
  };

  const configured = applyTemplateCredentials(realRobo, userCredentials, 'My RealRobo Seller API');
  assert.equal(configured.name, 'My RealRobo Seller API');
  assert.equal(configured.balanceKey, 'data.balance');
  assert.equal(configured.url, 'https://realrobo.in/api/balance?api_token=realrobo-secret-token-12345');

  // Balance params
  const balTokenParam = configured.parameters.find(p => p.key === 'api_token');
  assert.equal(balTokenParam.value, 'realrobo-secret-token-12345');

  // Recharge params
  assert.equal(configured.recharge.requestType, 'POST');
  assert.equal(configured.recharge.url, 'https://realrobo.in/api/recharge');
  const rechParams = configured.recharge.parameters;
  assert.equal(rechParams.find(p => p.key === 'api_token').value, 'realrobo-secret-token-12345');
  assert.equal(rechParams.find(p => p.key === 'number').value, '{NUMBER}');
  assert.equal(rechParams.find(p => p.key === 'amount').value, '{AMOUNT}');
  assert.equal(rechParams.find(p => p.key === 'operator_id').value, '{OPCODE}');
  assert.equal(rechParams.find(p => p.key === 'req_id').value, '{TXNID}');

  // Status check params
  assert.equal(configured.statusCheck.requestType, 'GET');
  assert.equal(configured.statusCheck.url, 'https://realrobo.in/api/status_check');
  const stParams = configured.statusCheck.parameters;
  assert.equal(stParams.find(p => p.key === 'api_token').value, 'realrobo-secret-token-12345');
  assert.equal(stParams.find(p => p.key === 'req_id').value, '{TXNID}');

  // Dispute params
  assert.equal(configured.dispute.requestType, 'POST');
  assert.equal(configured.dispute.url, 'https://realrobo.in/api/raise_complaint');
  const dispParams = configured.dispute.parameters;
  assert.equal(dispParams.find(p => p.key === 'api_token').value, 'realrobo-secret-token-12345');
  assert.equal(dispParams.find(p => p.key === 'req_id').value, '{TXNID}');
  assert.equal(dispParams.find(p => p.key === 'recharge_id').value, '{ORDERID}');
  assert.equal(dispParams.find(p => p.key === 'client_message').value, '{REASON}');
});

test('Developer API Presets - real robo Recharge Forwarding Engine & Response Parsing', async () => {
  const realRobo = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'real robo');
  const configured = applyTemplateCredentials(realRobo, { api_token: 'valid-token-xyz' }, 'Real Robo Stock API');

  let interceptedCall = null;
  const mockForwardRechargeToSeller = async ({ rechargeData }) => {
    // Verify operator code and circle code translation
    const opCodes = configured.operatorCodes;
    const mappedOp = opCodes[rechargeData.operatorCode] || rechargeData.operatorCode;
    const cirCodes = configured.circleCodes;
    const mappedCir = cirCodes[rechargeData.circle] || rechargeData.circle;

    interceptedCall = {
      mappedOp,
      mappedCir,
      rechargeData,
      url: configured.recharge.url,
      requestType: configured.recharge.requestType
    };

    // Simulate RealRobo API success response
    const mockApiResponse = {
      status: 'success',
      txid: '1523148787',
      recharge_id: 1350579228,
      message: 'recharge successful',
      number: rechargeData.number,
      amount: Number(rechargeData.amount)
    };

    const statusUpper = String(mockApiResponse.status).toUpperCase();
    const isSuccess = configured.recharge.successCodes.toUpperCase().split(',').includes(statusUpper);

    return {
      ok: isSuccess,
      status: isSuccess ? 'SUCCESS' : 'FAILURE',
      supplierTxnId: String(mockApiResponse.recharge_id),
      operatorTxnId: String(mockApiResponse.txid),
      message: mockApiResponse.message
    };
  };

  const result = await mockForwardRechargeToSeller({
    rechargeData: {
      number: '9876543210',
      amount: '50.00',
      operatorCode: 'AIRTEL',
      circle: 'DELHI',
      txnid: 'EXCH12345'
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.supplierTxnId, '1350579228');
  assert.equal(result.operatorTxnId, '1523148787');
  assert.equal(result.message, 'recharge successful');
  assert.equal(interceptedCall.mappedOp, '1', 'Airtel must translate to RealRobo operator_id 1');
  assert.equal(interceptedCall.mappedCir, '5', 'Delhi must translate to RealRobo circle_id 5');
  assert.equal(interceptedCall.url, 'https://realrobo.in/api/recharge');
  assert.equal(interceptedCall.requestType, 'POST');
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
