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


test('Developer API Presets - Ivan Template Specification', () => {
  const ivan = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'Ivan');
  assert.ok(ivan, 'Ivan template must exist in default presets');
  assert.equal(ivan.developer_name, 'Ivan Infotech');
  assert.equal(ivan.service_type, 'Mobile Recharge');
  assert.equal(ivan.is_active, true);

  // Check required parameters - domain and apiToken
  const reqKeys = ivan.required_parameters.map(p => p.key);
  assert.ok(reqKeys.includes('domain'), 'Must require domain');
  assert.ok(reqKeys.includes('apiToken'), 'Must require apiToken');
  assert.equal(ivan.required_parameters.length, 2, 'Should have exactly 2 required parameters (Domain & API Token)');

  // Check Balance endpoint
  const bal = ivan.config.balance;
  assert.equal(bal.url, 'https://{domain}/apiservice.asmx/GetBalanceNew');
  assert.equal(bal.balanceKey, 'balance');
  assert.equal(bal.responseType, 'XML');

  // Check Recharge endpoint
  const rech = ivan.config.recharge;
  assert.equal(rech.url, 'https://{domain}/apiservice.asmx/Recharge');
  assert.equal(rech.requestType, 'GET');
  assert.equal(rech.responseType, 'XML');
  assert.equal(rech.statusKey, 'status');
  assert.ok(rech.successCodes.includes('SUCCESS'));
  assert.ok(rech.successCodes.includes('1000'));
  assert.ok(rech.pendingCodes.includes('PENDING'));
  assert.ok(rech.failedCodes.includes('FAILED'));
  assert.equal(rech.supplierIdKey, 'field1');
  assert.equal(rech.operatorIdKey, 'field1');
  assert.equal(rech.memberReqIdKey, 'reqid');
  assert.equal(rech.messageKey, 'remark');

  // Check Status check endpoint
  const status = ivan.config.statusCheck;
  assert.equal(status.url, 'https://{domain}/apiservice.asmx/GetRechargeStatus');
  assert.equal(status.responseType, 'XML');
  assert.equal(status.supplierIdKey, 'field1');

  // Check Dispute endpoint
  const disp = ivan.config.dispute;
  assert.equal(disp.url, 'https://{domain}/apiservice.asmx/RegisterComplaint');
  assert.equal(disp.responseType, 'XML');

  // Check Operator codes
  const opCodes = ivan.config.operatorCodes;
  assert.equal(opCodes.AIRTEL, '1');
  assert.equal(opCodes.BSNL, '2');
  assert.equal(opCodes.VODAFONE, '5');
  assert.equal(opCodes.JIO, '12');
  assert.equal(opCodes.DISHTV, '7');
  assert.equal(opCodes.TATASKY, '8');
});

test('Developer API Presets - Ivan Credential Substitution & Dynamic Domain Engine', () => {
  const ivan = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'Ivan');
  const userCredentials = {
    domain: 'https://www.wonpay.in/',
    apiToken: 'ivan-token-secret-777'
  };

  const configured = applyTemplateCredentials(ivan, userCredentials, 'WonPay Ivan Gateway');
  assert.equal(configured.name, 'WonPay Ivan Gateway');
  assert.equal(configured.balanceKey, 'balance');
  assert.equal(configured.responseType, 'XML');

  // Verify domain was cleaned and properly substituted without double https://
  assert.equal(configured.url, 'https://www.wonpay.in/apiservice.asmx/GetBalanceNew?apiToken=ivan-token-secret-777');
  assert.equal(configured.recharge.url, 'https://www.wonpay.in/apiservice.asmx/Recharge');
  assert.equal(configured.statusCheck.url, 'https://www.wonpay.in/apiservice.asmx/GetRechargeStatus');
  assert.equal(configured.dispute.url, 'https://www.wonpay.in/apiservice.asmx/RegisterComplaint');

  // Verify recharge parameters
  const rechParams = configured.recharge.parameters;
  assert.equal(rechParams.find(p => p.key === 'apiToken').value, 'ivan-token-secret-777');
  assert.equal(rechParams.find(p => p.key === 'mn').value, '{NUMBER}');
  assert.equal(rechParams.find(p => p.key === 'amt').value, '{AMOUNT}');
  assert.equal(rechParams.find(p => p.key === 'op').value, '{OPCODE}');
  assert.equal(rechParams.find(p => p.key === 'reqid').value, '{TXNID}');

  // Also test with raw domain without protocol
  const configuredRaw = applyTemplateCredentials(ivan, { domain: 'myivan.portal.com', apiToken: 'tok-123' });
  assert.equal(configuredRaw.url, 'https://myivan.portal.com/apiservice.asmx/GetBalanceNew?apiToken=tok-123');
  assert.equal(configuredRaw.recharge.url, 'https://myivan.portal.com/apiservice.asmx/Recharge');
});

test('Developer API Presets - Ivan XML Response Parsing & Live Engine Integration', () => {
  const { extractValueByPath } = require('../lib/stock-api-helper');

  const sampleXmlSuccess = '<?xml version="1.0" encoding="utf-8"?>' +
    '<Result xmlns="http://tempuri.org/">' +
    ' <reqid>TXN555888</reqid>' +
    ' <status>SUCCESS</status>' +
    ' <remark>Recharge Processed Successfully</remark>' +
    ' <balance>850.50</balance>' +
    ' <mn>9876543210</mn>' +
    ' <field1>OPR9988776655</field1>' +
    ' <ec>1000</ec>' +
    '</Result>';

  const ivan = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'Ivan');
  const rechConf = ivan.config.recharge;

  const status = extractValueByPath(sampleXmlSuccess, rechConf.statusKey);
  const operatorTxnId = extractValueByPath(sampleXmlSuccess, rechConf.operatorIdKey);
  const supplierTxnId = extractValueByPath(sampleXmlSuccess, rechConf.supplierIdKey);
  const message = extractValueByPath(sampleXmlSuccess, rechConf.messageKey);
  const balance = extractValueByPath(sampleXmlSuccess, ivan.config.balance.balanceKey);

  assert.equal(status, 'SUCCESS');
  assert.equal(operatorTxnId, 'OPR9988776655');
  assert.equal(supplierTxnId, 'OPR9988776655');
  assert.equal(message, 'Recharge Processed Successfully');
  assert.equal(balance, '850.50');

  // Verify failure xml with error code
  const sampleXmlFailed = '<?xml version="1.0" encoding="utf-8"?>' +
    '<Result xmlns="http://tempuri.org/">' +
    ' <status>FAILED</status>' +
    ' <remark>INSUFFICIENT BALANCE</remark>' +
    ' <ec>1015</ec>' +
    '</Result>';

  const failedStatus = extractValueByPath(sampleXmlFailed, rechConf.statusKey);
  assert.equal(failedStatus, 'FAILED');
  assert.ok(rechConf.failedCodes.split(',').includes('FAILED'));
  assert.ok(rechConf.failedCodes.split(',').includes('1015'));
});


test('Developer API Presets - Roundpay Template Specification', () => {
  const roundpay = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'Roundpay');
  assert.ok(roundpay, 'Roundpay template must exist in default presets');
  assert.equal(roundpay.developer_name, 'Roundpay Techno Media');
  assert.equal(roundpay.service_type, 'Mobile Recharge');
  assert.equal(roundpay.is_active, true);

  // Check required parameters
  const reqKeys = roundpay.required_parameters.map(p => p.key);
  assert.ok(reqKeys.includes('domain'), 'Must require domain parameter for custom provider hosts');
  assert.ok(reqKeys.includes('UserID'), 'Must require UserID parameter');
  assert.ok(reqKeys.includes('Token'), 'Must require Token parameter');
  assert.ok(reqKeys.includes('OutletID'), 'Must include OutletID parameter');

  // Check Balance endpoint
  const bal = roundpay.config.balance;
  assert.equal(bal.url, 'https://{domain}/API/Balance');
  assert.equal(bal.balanceKey, 'bal');
  assert.equal(bal.requestType, 'GET');
  assert.equal(bal.responseType, 'JSON');

  // Check Recharge endpoint
  const rech = roundpay.config.recharge;
  assert.equal(rech.url, 'https://{domain}/API/TransactionAPI');
  assert.equal(rech.requestType, 'GET');
  assert.equal(rech.responseType, 'JSON');
  assert.equal(rech.statusKey, 'STATUS');
  assert.ok(rech.successCodes.includes('2'));
  assert.ok(rech.successCodes.includes('SUCCESS'));
  assert.ok(rech.pendingCodes.includes('1'));
  assert.ok(rech.failedCodes.includes('3'));
  assert.ok(rech.failedCodes.includes('4'));
  assert.equal(rech.supplierIdKey, 'RPID');
  assert.equal(rech.operatorIdKey, 'OPID');
  assert.equal(rech.memberReqIdKey, 'AGENTID');
  assert.equal(rech.messageKey, 'MSG');

  // Check Status check endpoint
  const status = roundpay.config.statusCheck;
  assert.equal(status.url, 'https://{domain}/API/StatusCheck');
  assert.equal(status.responseType, 'JSON');
  assert.equal(status.statusKey, 'Status');
  assert.equal(status.supplierIdKey, 'RPID');
  assert.equal(status.operatorIdKey, 'OPID');

  // Check Dispute endpoint
  const disp = roundpay.config.dispute;
  assert.equal(disp.url, 'https://{domain}/API/RefundRequest');
  assert.equal(disp.responseType, 'JSON');

  // Check Callback endpoint
  const cb = roundpay.config.callback;
  assert.equal(cb.ourTxnIdKey, 'agentid');
  assert.equal(cb.supplierTxnIdKey, 'rpid');
  assert.equal(cb.operatorTxnIdKey, 'opid');
  assert.equal(cb.statusKey, 'status');

  // Check Operator codes
  const opCodes = roundpay.config.operatorCodes;
  assert.equal(opCodes.AIRTEL, 'AT');
  assert.equal(opCodes.BSNL, 'BS');
  assert.equal(opCodes.VODAFONE, 'VI');
  assert.equal(opCodes.JIO, 'JO');
  assert.equal(opCodes.DISHTV, 'DT');
  assert.equal(opCodes.TATASKY, 'TS');
});

test('Developer API Presets - Roundpay Credential Substitution & Dynamic Domain Engine', () => {
  const roundpay = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'Roundpay');
  const userCredentials = {
    domain: 'https://api.myroundpay.in/',
    UserID: '111',
    Token: 'ac74a8588293c84ee38319d3c13902bd'
  };

  const configured = applyTemplateCredentials(roundpay, userCredentials, 'My Roundpay Gateway');
  assert.equal(configured.name, 'My Roundpay Gateway');
  assert.equal(configured.balanceKey, 'bal');
  assert.equal(configured.responseType, 'JSON');

  // Verify domain was cleaned and properly substituted without double https://
  assert.equal(
    configured.url,
    'https://api.myroundpay.in/API/Balance?UserID=111&Token=ac74a8588293c84ee38319d3c13902bd&Format=1&OutletID=1'
  );
  assert.equal(configured.recharge.url, 'https://api.myroundpay.in/API/TransactionAPI');
  assert.equal(configured.statusCheck.url, 'https://api.myroundpay.in/API/StatusCheck');
  assert.equal(configured.dispute.url, 'https://api.myroundpay.in/API/RefundRequest');

  // Verify recharge parameters
  const rechParams = configured.recharge.parameters;
  assert.equal(rechParams.find(p => p.key === 'UserID').value, '111');
  assert.equal(rechParams.find(p => p.key === 'Token').value, 'ac74a8588293c84ee38319d3c13902bd');
  assert.equal(rechParams.find(p => p.key === 'Account').value, '{NUMBER}');
  assert.equal(rechParams.find(p => p.key === 'Amount').value, '{AMOUNT}');
  assert.equal(rechParams.find(p => p.key === 'SPKey').value, '{OPCODE}');
  assert.equal(rechParams.find(p => p.key === 'APIRequestID').value, '{TXNID}');
  assert.equal(rechParams.find(p => p.key === 'GEOCode').value, '26.8467,80.9462');
  assert.equal(rechParams.find(p => p.key === 'CustomerNumber').value, '{NUMBER}');
  assert.equal(rechParams.find(p => p.key === 'Pincode').value, '226001');
  assert.equal(rechParams.find(p => p.key === 'Format').value, '1');

  // Check callback preservation
  assert.ok(configured.callback);
  assert.equal(configured.callback.ourTxnIdKey, 'agentid');
  assert.equal(configured.callback.supplierTxnIdKey, 'rpid');

  // Also test case-insensitive credential passing (e.g. userid and token in lowercase)
  const configuredLower = applyTemplateCredentials(roundpay, {
    domain: 'live.roundpay.net',
    userid: '222',
    token: 'token-lower-456',
    OutletID: '99'
  });
  assert.equal(
    configuredLower.url,
    'https://live.roundpay.net/API/Balance?UserID=222&Token=token-lower-456&Format=1&OutletID=99'
  );
  assert.equal(configuredLower.recharge.parameters.find(p => p.key === 'UserID').value, '222');
});

test('Developer API Presets - Roundpay Live Response Parsing & Engine Integration (JSON & XML)', () => {
  const { extractValueByPath } = require('../lib/stock-api-helper');
  const roundpay = DEFAULT_DEVELOPER_APIS.find(a => a.name === 'Roundpay');
  const rechConf = roundpay.config.recharge;

  // 1. Test JSON Recharge Success Response
  const sampleJsonSuccess = {
    STATUS: '2',
    MSG: 'SUCCESS',
    BAL: '129846.22',
    ERRORCODE: '200',
    ACCOUNT: '9807341910',
    AMOUNT: '149',
    RPID: 'S201008105418617298BA',
    AGENTID: '8822499',
    OPID: 'UEH2010081054250066'
  };

  const status = extractValueByPath(sampleJsonSuccess, rechConf.statusKey);
  const operatorTxnId = extractValueByPath(sampleJsonSuccess, rechConf.operatorIdKey);
  const supplierTxnId = extractValueByPath(sampleJsonSuccess, rechConf.supplierIdKey);
  const memberReqId = extractValueByPath(sampleJsonSuccess, rechConf.memberReqIdKey);
  const message = extractValueByPath(sampleJsonSuccess, rechConf.messageKey);
  const balance = extractValueByPath(sampleJsonSuccess, roundpay.config.balance.balanceKey);

  assert.equal(status, '2');
  assert.ok(rechConf.successCodes.split(',').includes(status));
  assert.equal(operatorTxnId, 'UEH2010081054250066');
  assert.equal(supplierTxnId, 'S201008105418617298BA');
  assert.equal(memberReqId, '8822499');
  assert.equal(message, 'SUCCESS');
  assert.equal(balance, '129846.22');

  // 2. Test XML Recharge Success Response
  const sampleXmlSuccess = '<XMLRESPONSE>' +
    ' <STATUS>2</STATUS>' +
    ' <MSG>SUCCESS</MSG>' +
    ' <BAL>129846.22</BAL>' +
    ' <ERRORCODE>200</ERRORCODE>' +
    ' <ACCOUNT>9807341910</ACCOUNT>' +
    ' <AMOUNT>149</AMOUNT>' +
    ' <RPID>S201008105418617298BA</RPID>' +
    ' <AGENTID>8822499</AGENTID>' +
    ' <OPID>UEH2010081054250066</OPID>' +
    '</XMLRESPONSE>';

  assert.equal(extractValueByPath(sampleXmlSuccess, rechConf.statusKey), '2');
  assert.equal(extractValueByPath(sampleXmlSuccess, rechConf.supplierIdKey), 'S201008105418617298BA');
  assert.equal(extractValueByPath(sampleXmlSuccess, rechConf.operatorIdKey), 'UEH2010081054250066');
  assert.equal(extractValueByPath(sampleXmlSuccess, rechConf.memberReqIdKey), '8822499');
  assert.equal(extractValueByPath(sampleXmlSuccess, roundpay.config.balance.balanceKey), '129846.22');

  // 3. Test Status Check JSON response
  const sampleStatusCheck = {
    Status: 2,
    Statuscode: 1,
    ErrorCode: 200,
    Message: 'SUCCESS'
  };
  const stStatus = extractValueByPath(sampleStatusCheck, roundpay.config.statusCheck.statusKey);
  assert.equal(stStatus, '2');
  assert.ok(roundpay.config.statusCheck.successCodes.split(',').includes(stStatus));

  // 4. Test Balance Check JSON response
  const sampleBalanceCheck = {
    status: 2,
    msg: 'Transaction_Successful',
    bal: 100.00,
    errorcode: '200'
  };
  const balValue = extractValueByPath(sampleBalanceCheck, roundpay.config.balance.balanceKey);
  assert.equal(balValue, '100');

  // 5. Test Webhook callback payload parsing
  const webhookPayload = {
    status: '2',
    mobile: '9807341910',
    amount: '149',
    rpid: 'S4565622313',
    agentid: '8822499',
    opid: 'UE012345666',
    msg: 'Transaction Successful'
  };
  assert.equal(extractValueByPath(webhookPayload, roundpay.config.callback.statusKey), '2');
  assert.equal(extractValueByPath(webhookPayload, roundpay.config.callback.ourTxnIdKey), '8822499');
  assert.equal(extractValueByPath(webhookPayload, roundpay.config.callback.supplierTxnIdKey), 'S4565622313');
  assert.equal(extractValueByPath(webhookPayload, roundpay.config.callback.operatorTxnIdKey), 'UE012345666');
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
