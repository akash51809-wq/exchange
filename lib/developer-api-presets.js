'use strict';

/**
 * Default Developer API Presets & Templates
 * Includes 'Robotic Exchange' (Robotics User Panel API Documentation)
 */

const DEFAULT_DEVELOPER_APIS = [
  {
    name: 'Robotic Exchange',
    developer_name: 'Ezytm Technologies',
    service_type: 'Mobile Recharge',
    description: 'Robotics User Panel API Documentation. Supports Mobile Recharge, Status Check, Wallet Balance, Complaints, and Lapu verification.',
    is_active: true,
    required_parameters: [
      {
        key: 'Apimember_id',
        label: 'API Member ID / User ID',
        type: 'text',
        required: true,
        placeholder: 'e.g. 3083',
        description: 'Your Robotic Exchange Member ID'
      },
      {
        key: 'Api_password',
        label: 'API Password',
        type: 'password',
        required: true,
        placeholder: 'Enter API Password',
        description: 'Your Robotic Exchange API Password'
      }
    ],
    config: {
      balance: {
        url: 'https://api.roboticexchange.in/Robotics/webservice/GetWalletBalance',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'Apimember_id', value: '{Apimember_id}' },
          { key: 'Api_password', value: '{Api_password}' }
        ],
        balanceKey: 'SellerWalletBalance'
      },
      recharge: {
        url: 'https://api.roboticexchange.in/Robotics/webservice/GetMobileRecharge',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'Apimember_id', value: '{Apimember_id}' },
          { key: 'Api_password', value: '{Api_password}' },
          { key: 'Mobile_no', value: '{NUMBER}' },
          { key: 'Operator_code', value: '{OPCODE}' },
          { key: 'Amount', value: '{AMOUNT}' },
          { key: 'Member_request_txnid', value: '{TXNID}' },
          { key: 'Circle', value: '{CIRCLE}' }
        ],
        statusKey: 'STATUS',
        successCodes: '1',
        pendingCodes: '2',
        failedCodes: '3',
        supplierIdKey: 'ORDERID',
        operatorIdKey: 'OPTRANSID',
        memberReqIdKey: 'MEMBERREQID',
        messageKey: 'MESSAGE'
      },
      statusCheck: {
        url: 'https://api.roboticexchange.in/Robotics/webservice/GetStatus',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'Apimember_id', value: '{Apimember_id}' },
          { key: 'Api_password', value: '{Api_password}' },
          { key: 'Member_request_txnid', value: '{TXNID}' }
        ],
        statusKey: 'STATUS',
        successCodes: '1',
        pendingCodes: '2',
        failedCodes: '3',
        supplierIdKey: 'ORDERID',
        operatorIdKey: 'OPTRANSID'
      },
      dispute: {
        url: 'https://api.roboticexchange.in/Robotics/webservice/RechargeComplaint',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'Apimember_id', value: '{Apimember_id}' },
          { key: 'Api_password', value: '{Api_password}' },
          { key: 'Member_request_txnid', value: '{TXNID}' },
          { key: 'OurRefTxnId', value: '{ORDERID}' },
          { key: 'ComplaintReason', value: '{REASON}' }
        ],
        statusKey: 'STATUS',
        successCodes: '1'
      },
      lapuBalance: {
        url: 'https://api.roboticexchange.in/Robotics/webservice/GetLapuWiseBal',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'Apimember_id', value: '{Apimember_id}' },
          { key: 'Api_password', value: '{Api_password}' },
          { key: 'Operator_code', value: '{OPCODE}' }
        ]
      },
      operatorBalance: {
        url: 'https://api.roboticexchange.in/Robotics/webservice/OperatorBalance',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'Apimember_id', value: '{Apimember_id}' },
          { key: 'Api_password', value: '{Api_password}' }
        ]
      },
      operatorCodes: {
        AIRTEL: 'AT',
        AT: 'AT',
        VODAFONEIDEA: 'VI',
        VI: 'VI',
        IDEA: 'VI',
        VODAFONE: 'VI',
        JIO: 'JO',
        JO: 'JO',
        RELIANCE: 'JO',
        'RELIANCE JIO': 'JO',
        BSNL: 'BS',
        BS: 'BS',
        SUN: 'SD',
        'SUN TV': 'SD',
        SD: 'SD',
        'AIRTEL DTH': 'AD',
        AD: 'AD',
        'DISH TV': 'DT',
        DT: 'DT',
        TATASKY: 'TS',
        'TATA SKY': 'TS',
        'TATA PLAY': 'TS',
        TS: 'TS',
        VIDEOCON: 'VD',
        'VIDEOCON D2H': 'VD',
        VD: 'VD',
        MYJIO: 'MJ',
        MJ: 'MJ'
      },
      circleCodes: {
        DELHI: '10',
        'UP WEST': '97',
        'UP (WEST)': '97',
        PUNJAB: '02',
        HIMACHALPRADESH: '03',
        'HIMACHAL PRADESH': '03',
        HARYANA: '96',
        'J&K': '55',
        'JAMMU & KASHMIR': '55',
        'UP EAST': '54',
        'UP (EAST)': '54',
        MUMBAI: '92',
        MAHARASHTRA: '90',
        'MAHARASHTRA & GOA': '90',
        GUJARAT: '98',
        'MADHYA PRADESH': '93',
        'MADHYA PRADESH & CHHATTISGARH': '93',
        RAJASTHAN: '70',
        KOLKATTA: '31',
        KOLKATA: '31',
        'WEST BENGAL': '51',
        ORISSA: '53',
        ODISHA: '53',
        ASSAM: '56',
        NESA: '16',
        'NORTH EAST': '16',
        BIHAR: '52',
        'BIHAR & JHARKHAND': '52',
        KARNATAKA: '06',
        CHENNAI: '40',
        'TAMIL NADU': '94',
        KERALA: '95',
        'ANDHRA PRADESH': '49',
        'ANDHRA PRADESH & TELANGANA': '49',
        All: '50',
        ALL: '50',
        JHARKHAND: '20',
        CHHATTISGARH: '22'
      }
    }
  },
  {
    name: 'M robo',
    developer_name: 'MRobotics',
    service_type: 'Mobile Recharge',
    description: 'MRobotics Mobile & DTH Recharge Automation API. Supports POST & GET Recharge, Operator Balance, and Order ID Status Check.',
    is_active: true,
    required_parameters: [
      {
        key: 'api_token',
        label: 'API Token',
        type: 'text',
        required: true,
        placeholder: 'e.g. 12345678-1234-1234-1234-123456789012',
        description: 'Your MRobotics API Token'
      }
    ],
    config: {
      balance: {
        url: 'https://mrobotics.in/api/operator_balance',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'api_token', value: '{api_token}' }
        ],
        balanceKey: 'data'
      },
      recharge: {
        url: 'https://mrobotics.in/api/recharge',
        requestType: 'POST',
        responseType: 'JSON',
        parameters: [
          { key: 'api_token', value: '{api_token}' },
          { key: 'mobile_no', value: '{NUMBER}' },
          { key: 'amount', value: '{AMOUNT}' },
          { key: 'company_id', value: '{OPCODE}' },
          { key: 'order_id', value: '{TXNID}' },
          { key: 'is_stv', value: 'false' }
        ],
        statusKey: 'status',
        successCodes: 'success',
        pendingCodes: 'pending',
        failedCodes: 'failure,failed',
        supplierIdKey: 'id',
        operatorIdKey: 'tnx_id',
        memberReqIdKey: 'order_id',
        messageKey: 'response'
      },
      statusCheck: {
        url: 'https://mrobotics.in/api/order_id_status',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'api_token', value: '{api_token}' },
          { key: 'order_id', value: '{ORDERID}' }
        ],
        statusKey: 'status',
        successCodes: 'success',
        pendingCodes: 'pending',
        failedCodes: 'failure,failed',
        supplierIdKey: 'id',
        operatorIdKey: 'tnx_id'
      },
      lapuBalance: {
        url: 'https://mrobotics.in/api/lapu_balance',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'api_token', value: '{api_token}' },
          { key: 'lapu_id', value: '1' }
        ]
      },
      operatorCodes: {
        AIRTEL: '2',
        AT: '2',
        'AIRTEL INDIA': '2',
        VODAFONEIDEA: '1',
        VI: '1',
        IDEA: '3',
        VODAFONE: '1',
        'VODAFONE IDEA': '1',
        JIO: '5',
        JO: '5',
        RELIANCE: '5',
        'RELIANCE JIO': '5',
        BSNL: '4',
        BS: '4',
        DISHTV: '6',
        'DISH TV': '6',
        DT: '6',
        TATASKY: '7',
        'TATA SKY': '7',
        'TATA PLAY': '7',
        TS: '7',
        'TATA DOCOMO': '10',
        DOCOMO: '10',
        SUNDIRECT: '12',
        'SUN DIRECT': '12',
        'SUN TV': '12',
        SD: '12',
        'AIRTEL DTH': '24',
        'AIRTEL MITRA DTH': '24',
        AD: '24',
        VIDEOCON: '28',
        'VIDEOCON D2H': '28',
        D2H: '28',
        'D2H PAY': '28',
        VD: '28'
      }
    }
  },
  {
    name: 'real robo',
    developer_name: 'RealRobo',
    service_type: 'Mobile Recharge',
    description: 'RealRobo Premium Automation Provider. Supports Mobile & DTH Recharge, Balance Check, Status Check, and Raise Complaint.',
    is_active: true,
    required_parameters: [
      {
        key: 'api_token',
        label: 'API Token',
        type: 'text',
        required: true,
        placeholder: 'e.g. 12345678-1234-1234-1234-123456789012',
        description: 'Your RealRobo API Token'
      }
    ],
    config: {
      balance: {
        url: 'https://realrobo.in/api/balance',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'api_token', value: '{api_token}' }
        ],
        balanceKey: 'data.balance'
      },
      recharge: {
        url: 'https://realrobo.in/api/recharge',
        requestType: 'POST',
        responseType: 'JSON',
        parameters: [
          { key: 'api_token', value: '{api_token}' },
          { key: 'number', value: '{NUMBER}' },
          { key: 'amount', value: '{AMOUNT}' },
          { key: 'operator_id', value: '{OPCODE}' },
          { key: 'req_id', value: '{TXNID}' }
        ],
        statusKey: 'status',
        successCodes: 'success',
        pendingCodes: 'pending',
        failedCodes: 'failure,failed',
        supplierIdKey: 'recharge_id',
        operatorIdKey: 'txid',
        memberReqIdKey: 'req_id',
        messageKey: 'message'
      },
      statusCheck: {
        url: 'https://realrobo.in/api/status_check',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'api_token', value: '{api_token}' },
          { key: 'req_id', value: '{TXNID}' }
        ],
        statusKey: 'status',
        successCodes: 'success',
        pendingCodes: 'pending',
        failedCodes: 'failure,failed',
        supplierIdKey: 'recharge_id',
        operatorIdKey: 'txid'
      },
      dispute: {
        url: 'https://realrobo.in/api/raise_complaint',
        requestType: 'POST',
        responseType: 'JSON',
        parameters: [
          { key: 'api_token', value: '{api_token}' },
          { key: 'req_id', value: '{TXNID}' },
          { key: 'recharge_id', value: '{ORDERID}' },
          { key: 'client_message', value: '{REASON}' }
        ],
        statusKey: 'status',
        successCodes: 'true,1,SUCCESS'
      },
      operatorBalance: {
        url: 'https://realrobo.in/api/operator_balance',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'api_token', value: '{api_token}' }
        ],
        balanceKey: 'data'
      },
      lapuBalance: {
        url: 'https://realrobo.in/api/lapu_balance',
        requestType: 'GET',
        responseType: 'JSON',
        parameters: [
          { key: 'api_token', value: '{api_token}' },
          { key: 'lapu_id', value: '1' }
        ]
      },
      operatorCodes: {
        AIRTEL: '1',
        AT: '1',
        'AIRTEL INDIA': '1',
        BSNL: '2',
        BS: '2',
        JIO: '3',
        JO: '3',
        RELIANCE: '3',
        'RELIANCE JIO': '3',
        VODAFONEIDEA: '4',
        VI: '4',
        VODAFONE: '4',
        IDEA: '4',
        'VODAFONE IDEA': '4',
        'AIRTEL DTH': '5',
        'AIRTEL DIGITAL TV': '5',
        AD: '5',
        DISHTV: '6',
        'DISH TV': '6',
        DT: '6',
        SUNDIRECT: '7',
        'SUN DIRECT': '7',
        'SUN TV': '7',
        SD: '7',
        TATASKY: '8',
        'TATA SKY': '8',
        'TATA PLAY': '8',
        TS: '8',
        VIDEOCON: '9',
        'VIDEOCON D2H': '9',
        D2H: '9',
        VD: '9'
      },
      circleCodes: {
        'ANDHRA PRADESH': '1',
        ASSAM: '2',
        BIHAR: '3',
        'BIHAR & JHARKHAND': '3',
        'BIHAR / JHARKHAND': '3',
        CHENNAI: '4',
        DELHI: '5',
        'DELHI / NCR': '5',
        'DELHI NCR': '5',
        GUJARAT: '6',
        HARYANA: '7',
        'HIMACHAL PRADESH': '8',
        HIMACHALPRADESH: '8',
        'JAMMU & KASHMIR': '9',
        'JAMMU AND KASHMIR': '9',
        'J&K': '9',
        KARNATAKA: '10',
        KERALA: '11',
        KOLKATA: '12',
        KOLKATTA: '12',
        MAHARASHTRA: '13',
        'MAHARASHTRA & GOA': '13',
        'MADHYA PRADESH': '14',
        'MP / CHATTISGARH': '14',
        'MADHYA PRADESH & CHHATTISGARH': '14',
        MUMBAI: '15',
        'NORTH EAST': '16',
        NESA: '16',
        ORISSA: '17',
        ODISHA: '17',
        PUNJAB: '18',
        RAJASTHAN: '19',
        'TAMIL NADU': '20',
        'UP EAST': '21',
        'UP (EAST)': '21',
        'UP WEST': '22',
        'UP (WEST)': '22',
        UTTARAKHAND: '22',
        'WEST BENGAL': '23',
        CHHATTISGARH: '24',
        JHARKHAND: '25',
        All: '0',
        ALL: '0'
      }
    }
  },
  {
    name: 'Ivan',
    developer_name: 'Ivan Infotech',
    service_type: 'Mobile Recharge',
    description: 'Ivan Multi-Recharge ASMX Web Service API. Supports custom domain per provider, XML Response, Balance Check, Status Check, and Register Complaint.',
    is_active: true,
    required_parameters: [
      {
        key: 'domain',
        label: 'API Domain / Host URL',
        type: 'text',
        required: true,
        placeholder: 'e.g. www.wonpay.in or yourdomain.com',
        description: 'Your Ivan software provider domain name (without https://)'
      },
      {
        key: 'apiToken',
        label: 'API Token',
        type: 'text',
        required: true,
        placeholder: 'Enter your Ivan API Token',
        description: 'Your Ivan API Token generated from API TOKEN page'
      }
    ],
    config: {
      balance: {
        url: 'https://{domain}/apiservice.asmx/GetBalanceNew',
        requestType: 'GET',
        responseType: 'XML',
        parameters: [
          { key: 'apiToken', value: '{apiToken}' }
        ],
        balanceKey: 'balance'
      },
      recharge: {
        url: 'https://{domain}/apiservice.asmx/Recharge',
        requestType: 'GET',
        responseType: 'XML',
        parameters: [
          { key: 'apiToken', value: '{apiToken}' },
          { key: 'mn', value: '{NUMBER}' },
          { key: 'op', value: '{OPCODE}' },
          { key: 'amt', value: '{AMOUNT}' },
          { key: 'reqid', value: '{TXNID}' },
          { key: 'field1', value: '' },
          { key: 'field2', value: '' }
        ],
        statusKey: 'status',
        successCodes: 'SUCCESS,1000,1017,REFUND DECLINED',
        pendingCodes: 'PENDING,1018,1010,RECHARGE ACCEPTED,RECHARGE PENDING',
        failedCodes: 'FAILED,FREQUENT,REFUND,CLAIM REFUND,1002,1003,1004,1005,1006,1007,1008,1009,1011,1013,1014,1015,1016,1019',
        supplierIdKey: 'field1',
        operatorIdKey: 'field1',
        memberReqIdKey: 'reqid',
        messageKey: 'remark'
      },
      statusCheck: {
        url: 'https://{domain}/apiservice.asmx/GetRechargeStatus',
        requestType: 'GET',
        responseType: 'XML',
        parameters: [
          { key: 'apiToken', value: '{apiToken}' },
          { key: 'reqid', value: '{TXNID}' }
        ],
        statusKey: 'status',
        successCodes: 'SUCCESS,1000,1017,REFUND DECLINED',
        pendingCodes: 'PENDING,1018,1010,RECHARGE ACCEPTED,RECHARGE PENDING',
        failedCodes: 'FAILED,FREQUENT,REFUND,CLAIM REFUND,1002,1003,1004,1005,1006,1007,1008,1009,1011,1013,1014,1015,1016,1019',
        supplierIdKey: 'field1',
        operatorIdKey: 'field1'
      },
      dispute: {
        url: 'https://{domain}/apiservice.asmx/RegisterComplaint',
        requestType: 'GET',
        responseType: 'XML',
        parameters: [
          { key: 'apiToken', value: '{apiToken}' },
          { key: 'reqid', value: '{TXNID}' }
        ],
        statusKey: 'status',
        successCodes: 'SUCCESS,1000,true,1'
      },
      operatorLookup: {
        url: 'https://{domain}/apiservice.asmx/GetOperator',
        requestType: 'GET',
        responseType: 'XML',
        parameters: [
          { key: 'mn', value: '{NUMBER}' }
        ]
      },
      operatorCodes: {
        AIRTEL: '1',
        AT: '1',
        'AIRTEL INDIA': '1',
        BSNL: '2',
        BS: '2',
        JIO: '12',
        JO: '12',
        RELIANCE: '12',
        'RELIANCE JIO': '12',
        VODAFONEIDEA: '5',
        VI: '5',
        VODAFONE: '5',
        'VODAFONE INDIA': '5',
        IDEA: '4',
        'VODAFONE IDEA': '5',
        'AIRTEL DTH': '6',
        AD: '6',
        DISHTV: '7',
        'DISH TV': '7',
        DT: '7',
        TATASKY: '8',
        'TATA SKY': '8',
        'TATA PLAY': '8',
        TS: '8',
        SUNDIRECT: '9',
        'SUN DIRECT': '9',
        'SUN TV': '9',
        SD: '9',
        VIDEOCON: '10',
        'VIDEOCON D2H': '10',
        D2H: '10',
        VD: '10'
      }
    }
  }
];

/**
 * Seed Default Developer APIs into the database if missing
 */
async function seedDeveloperApiTemplates(dbClient) {
  for (const preset of DEFAULT_DEVELOPER_APIS) {
    try {
      const res = await dbClient.query('SELECT id FROM developer_api_templates WHERE name = $1', [preset.name]);
      if (res.rowCount === 0) {
        await dbClient.query(
          `INSERT INTO developer_api_templates (name, developer_name, service_type, description, is_active, required_parameters, config)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            preset.name,
            preset.developer_name,
            preset.service_type,
            preset.description,
            preset.is_active,
            JSON.stringify(preset.required_parameters),
            JSON.stringify(preset.config)
          ]
        );
        console.log(`[Developer API Presets] Seeded "${preset.name}" successfully.`);
      } else {
        await dbClient.query(
          `UPDATE developer_api_templates
           SET required_parameters = $1, config = $2, developer_name = $3, description = $4, updated_at = now()
           WHERE name = $5`,
          [
            JSON.stringify(preset.required_parameters),
            JSON.stringify(preset.config),
            preset.developer_name,
            preset.description,
            preset.name
          ]
        );
      }
    } catch (err) {
      console.warn(`[Developer API Presets] Warning seeding "${preset.name}":`, err.message);
    }
  }
}

/**
 * Substitutes credential values into template strings / objects
 */
function substituteCredential(val, credentials) {
  if (typeof val !== 'string') return val;
  let res = val;
  for (const [k, v] of Object.entries(credentials)) {
    if (v !== undefined && v !== null) {
      res = res.replaceAll(`{${k}}`, String(v)).replaceAll(`[${k}]`, String(v));
    }
  }
  return res;
}

/**
 * Build a full seller API configuration using a Developer API Template and User Credentials
 */
function applyTemplateCredentials(template, credentials, customName = '') {
  const tplConf = template.config || {};
  const creds = { ...credentials };

  if (creds.domain) {
    creds.domain = String(creds.domain).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }

  const name = String(customName || creds.apiName || template.name).trim();

  // 1. Balance Config
  const balTpl = tplConf.balance || {};
  const balParams = (balTpl.parameters || []).map(p => ({
    key: substituteCredential(p.key, creds),
    value: substituteCredential(p.value, creds)
  }));
  let balUrl = substituteCredential(balTpl.url || '', creds);

  // If GET and params not in query string, append them
  if (balUrl && (balTpl.requestType || 'GET').toUpperCase() === 'GET' && balParams.length > 0) {
    try {
      const parsed = new URL(balUrl);
      for (const p of balParams) {
        if (!parsed.searchParams.has(p.key)) {
          parsed.searchParams.set(p.key, p.value);
        }
      }
      balUrl = parsed.toString();
    } catch (_) {}
  }

  // 2. Recharge Config
  const rechTpl = tplConf.recharge || {};
  const rechParams = (rechTpl.parameters || []).map(p => ({
    key: substituteCredential(p.key, creds),
    value: substituteCredential(p.value, creds)
  }));

  // Append optional parameters if provided in credentials (e.g. Route, Mode, Group_Id)
  if (creds.Route && !rechParams.some(p => p.key.toLowerCase() === 'route')) {
    rechParams.push({ key: 'Route', value: String(creds.Route) });
  }
  if (creds.Mode && !rechParams.some(p => p.key.toLowerCase() === 'mode')) {
    rechParams.push({ key: 'Mode', value: String(creds.Mode) });
  }
  if (creds.Group_Id && !rechParams.some(p => p.key.toLowerCase() === 'group_id')) {
    rechParams.push({ key: 'Group_Id', value: String(creds.Group_Id) });
  }

  const recharge = {
    url: substituteCredential(rechTpl.url || '', creds),
    requestType: rechTpl.requestType || 'GET',
    responseType: rechTpl.responseType || 'JSON',
    parameters: rechParams,
    statusKey: rechTpl.statusKey || 'STATUS',
    successCodes: rechTpl.successCodes || '1',
    pendingCodes: rechTpl.pendingCodes || '2',
    failedCodes: rechTpl.failedCodes || '3',
    supplierIdKey: rechTpl.supplierIdKey || 'ORDERID',
    operatorIdKey: rechTpl.operatorIdKey || 'OPTRANSID',
    memberReqIdKey: rechTpl.memberReqIdKey || 'MEMBERREQID',
    messageKey: rechTpl.messageKey || 'MESSAGE',
    updatedAt: new Date().toISOString()
  };

  // 3. Status Check Config
  const stTpl = tplConf.statusCheck || {};
  const stParams = (stTpl.parameters || []).map(p => ({
    key: substituteCredential(p.key, creds),
    value: substituteCredential(p.value, creds)
  }));
  if (creds.Mode && !stParams.some(p => p.key.toLowerCase() === 'mode')) {
    stParams.push({ key: 'mode', value: String(creds.Mode) });
  }

  const statusCheck = {
    url: substituteCredential(stTpl.url || '', creds),
    requestType: stTpl.requestType || 'GET',
    responseType: stTpl.responseType || 'JSON',
    parameters: stParams,
    statusKey: stTpl.statusKey || 'STATUS',
    successCodes: stTpl.successCodes || '1',
    pendingCodes: stTpl.pendingCodes || '2',
    failedCodes: stTpl.failedCodes || '3',
    supplierIdKey: stTpl.supplierIdKey || 'ORDERID',
    operatorIdKey: stTpl.operatorIdKey || 'OPTRANSID',
    updatedAt: new Date().toISOString()
  };

  // 4. Dispute Config
  const dispTpl = tplConf.dispute || {};
  const dispParams = (dispTpl.parameters || []).map(p => ({
    key: substituteCredential(p.key, creds),
    value: substituteCredential(p.value, creds)
  }));
  if (creds.Mode && !dispParams.some(p => p.key.toLowerCase() === 'mode')) {
    dispParams.push({ key: 'mode', value: String(creds.Mode) });
  }

  const dispute = {
    url: substituteCredential(dispTpl.url || '', creds),
    requestType: dispTpl.requestType || 'GET',
    responseType: dispTpl.responseType || 'JSON',
    parameters: dispParams,
    statusKey: dispTpl.statusKey || 'STATUS',
    successCodes: dispTpl.successCodes || '1',
    updatedAt: new Date().toISOString()
  };

  return {
    name,
    templateId: template.id,
    templateName: template.name,
    urlType: 'Balance URL',
    requestType: balTpl.requestType || 'GET',
    responseType: balTpl.responseType || 'JSON',
    url: balUrl,
    parameters: balParams,
    balanceKey: balTpl.balanceKey || 'SellerWalletBalance',
    recharge,
    statusCheck,
    dispute,
    operatorCodes: tplConf.operatorCodes || {},
    circleCodes: tplConf.circleCodes || {},
    credentials: creds
  };
}

module.exports = {
  DEFAULT_DEVELOPER_APIS,
  seedDeveloperApiTemplates,
  applyTemplateCredentials,
  substituteCredential
};
