'use strict';

/**
 * 18 Default Notification Templates with WhatsApp, Email & SMS (160 characters max lock)
 */
const DEFAULT_NOTIFICATION_TEMPLATES = [
  {
    "event_key": "signup_otp",
    "title": "Signup OTP",
    "category": "Authentication",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Hello {{name}}, your OTP for registration on {{app_name}} is {{otp}}. Valid for {{expiry_minutes}} minutes. Please do not share this OTP with anyone.",
    "email_subject": "Your Registration OTP - {{app_name}}",
    "email_template": "Dear {{name}},\n\nYour One Time Password (OTP) to complete your account registration on {{app_name}} is:\n\n{{otp}}\n\nThis OTP is valid for {{expiry_minutes}} minutes. Please do not share this code with anyone.\n\nRegards,\nTeam {{app_name}}",
    "sms_template": "Your registration OTP for {{app_name}} is {{otp}}. Valid for {{expiry_minutes}} minutes. Do not share this OTP.",
    "allowed_keywords": [
      "name",
      "otp",
      "expiry_minutes",
      "app_name"
    ],
    "sort_order": 1
  },
  {
    "event_key": "welcome_msg_signup",
    "title": "Welcome Message After Signup",
    "category": "Authentication",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Welcome to {{app_name}}, {{name}}! Your account has been registered successfully. You can login at {{login_url}} using your username {{username}}.",
    "email_subject": "Welcome to {{app_name}}! Your Account is Ready",
    "email_template": "Dear {{name}},\n\nWelcome to {{app_name}}! We are thrilled to have you onboard.\n\nYour account username is: {{username}}\nYou can access your dashboard anytime at: {{login_url}}\n\nIf you have any questions or require assistance, our support team is always here to help.\n\nBest regards,\nTeam {{app_name}}",
    "sms_template": "Welcome to {{app_name}}, {{name}}! Your account is active. Login at {{login_url}} using User ID: {{username}}.",
    "allowed_keywords": [
      "name",
      "username",
      "login_url",
      "app_name"
    ],
    "sort_order": 2
  },
  {
    "event_key": "reminder_msg_kyc",
    "title": "Reminder Message for KYC",
    "category": "Account & Security",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Dear {{name}}, please complete your KYC verification on {{app_name}} to unlock full trading and wallet limits. Submit documents here: {{kyc_url}}",
    "email_subject": "Reminder: Complete Your KYC Verification - {{app_name}}",
    "email_template": "Dear {{name}},\n\nThis is a friendly reminder to complete your KYC verification for username {{username}} on {{app_name}}.\n\nCompleting KYC ensures seamless wallet topups, instant payouts, and increased limits.\n\nComplete your KYC now at: {{kyc_url}}\n\nRegards,\nCompliance Team, {{app_name}}",
    "sms_template": "Dear {{name}}, please complete your KYC on {{app_name}} to unlock full limits. Submit here: {{kyc_url}}",
    "allowed_keywords": [
      "name",
      "username",
      "kyc_url",
      "app_name"
    ],
    "sort_order": 3
  },
  {
    "event_key": "forgot_password",
    "title": "Forgot Password",
    "category": "Authentication",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Hello {{name}}, your password reset code for {{app_name}} is {{reset_otp}}. Valid for {{expiry_minutes}} minutes. Do not share this code.",
    "email_subject": "Password Reset Request - {{app_name}}",
    "email_template": "Dear {{name}},\n\nWe received a request to reset your password on {{app_name}}.\n\nYour reset OTP is: {{reset_otp}}\nOr reset directly using this link: {{reset_url}}\n\nThis code will expire in {{expiry_minutes}} minutes. If you did not request this, please contact support immediately.\n\nRegards,\nSecurity Team, {{app_name}}",
    "sms_template": "Your password reset code for {{app_name}} is {{reset_otp}}. Valid for {{expiry_minutes}} mins. Do not share this code.",
    "allowed_keywords": [
      "name",
      "reset_otp",
      "reset_url",
      "expiry_minutes",
      "app_name"
    ],
    "sort_order": 4
  },
  {
    "event_key": "change_password",
    "title": "Change Password",
    "category": "Authentication",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Security Alert: Your password for {{app_name}} account {{username}} was successfully changed on {{date_time}}. If you did not make this change, contact support immediately.",
    "email_subject": "Security Alert: Password Changed - {{app_name}}",
    "email_template": "Dear {{name}},\n\nThis email confirms that the password for your {{app_name}} account ({{username}}) was successfully changed on {{date_time}}.\n\nIf you did not authorize this change, please lock your account and contact our support team immediately.\n\nRegards,\nSecurity Team, {{app_name}}",
    "sms_template": "Security Alert: Password for {{app_name}} account {{username}} was changed on {{date_time}}. If not you, contact support.",
    "allowed_keywords": [
      "name",
      "username",
      "date_time",
      "app_name"
    ],
    "sort_order": 5
  },
  {
    "event_key": "login_otp",
    "title": "Login OTP",
    "category": "Authentication",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Hello {{name}}, your login OTP for {{app_name}} is {{otp}}. Valid for {{expiry_minutes}} minutes. Never share this code.",
    "email_subject": "Login Verification OTP - {{app_name}}",
    "email_template": "Dear {{name}},\n\nYour login verification code for {{app_name}} is:\n\n{{otp}}\n\nValid for {{expiry_minutes}} minutes. Do not share this OTP with anyone.\n\nRegards,\nSecurity Team, {{app_name}}",
    "sms_template": "Your login OTP for {{app_name}} is {{otp}}. Valid for {{expiry_minutes}} minutes. Never share this code.",
    "allowed_keywords": [
      "name",
      "otp",
      "expiry_minutes",
      "app_name"
    ],
    "sort_order": 6
  },
  {
    "event_key": "login_info_user",
    "title": "Login Information to User",
    "category": "Authentication",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Security Notice: New login detected on your {{app_name}} account {{username}} from IP {{ip_address}} ({{device}}) on {{date_time}}.",
    "email_subject": "Security Notice: New Login to Your Account - {{app_name}}",
    "email_template": "Dear {{name}},\n\nA successful sign-in was recorded for your {{app_name}} account ({{username}}).\n\nDetails:\n- Date & Time: {{date_time}}\n- IP Address: {{ip_address}}\n- Device/Browser: {{device}}\n\nIf this was not you, please secure your account immediately.\n\nRegards,\nSecurity Team, {{app_name}}",
    "sms_template": "Security Notice: New login on {{app_name}} account {{username}} from IP {{ip_address}} ({{device}}) on {{date_time}}.",
    "allowed_keywords": [
      "name",
      "username",
      "ip_address",
      "device",
      "date_time",
      "app_name"
    ],
    "sort_order": 7
  },
  {
    "event_key": "add_wallet_request_user",
    "title": "Add Wallet Request (User Confirmation)",
    "category": "Wallet & Payments",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Dear {{name}}, your wallet top-up request for Rs {{amount}} with UTR {{utr}} has been received and is pending admin verification. Request ID: {{request_id}}.",
    "email_subject": "Wallet Top-up Request Received - {{app_name}}",
    "email_template": "Dear {{name}},\n\nYour wallet top-up request has been submitted successfully.\n\nDetails:\n- Request ID: {{request_id}}\n- Amount: Rs {{amount}}\n- UTR / Reference: {{utr}}\n- Bank: {{bank_name}}\n- Submitted On: {{date_time}}\n\nOur team is reviewing the transaction. Your balance will be credited upon verification.\n\nRegards,\nBilling Team, {{app_name}}",
    "sms_template": "Dear {{name}}, wallet top-up request for Rs {{amount}} with UTR {{utr}} has been received. Request ID: {{request_id}}.",
    "allowed_keywords": [
      "name",
      "amount",
      "utr",
      "bank_name",
      "request_id",
      "date_time",
      "app_name"
    ],
    "sort_order": 8
  },
  {
    "event_key": "add_wallet_request_admin",
    "title": "Add Wallet Request (Admin Alert)",
    "category": "Wallet & Payments",
    "recipient_type": "admin",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "[ADMIN ALERT] New Wallet Top-up Request #{{request_id}} submitted by {{user_name}} ({{username}}). Amount: Rs {{amount}}, UTR: {{utr}}, Bank: {{bank_name}}. Review: {{admin_url}}",
    "email_subject": "[Admin Alert] New Wallet Top-up Request - Rs {{amount}} from {{username}}",
    "email_template": "Admin Alert,\n\nA new wallet top-up request has been submitted and awaits your approval.\n\n- User: {{user_name}} ({{username}})\n- Request ID: {{request_id}}\n- Amount: Rs {{amount}}\n- UTR: {{utr}}\n- Bank: {{bank_name}}\n\nReview and take action at:\n{{admin_url}}\n\nSystem Bot,\n{{app_name}}",
    "sms_template": "[ADMIN] New Top-up Req #{{request_id}} from {{username}}. Amount: Rs {{amount}}, UTR: {{utr}}. Review: {{admin_url}}",
    "allowed_keywords": [
      "username",
      "user_name",
      "amount",
      "utr",
      "bank_name",
      "request_id",
      "admin_url",
      "app_name"
    ],
    "sort_order": 9
  },
  {
    "event_key": "wallet_approved_rejected_user",
    "title": "Wallet Approved / Rejected (User)",
    "category": "Wallet & Payments",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Dear {{name}}, your wallet top-up request of Rs {{amount}} (UTR: {{utr}}) has been {{status}}. Updated balance: Rs {{current_balance}}. Remark: {{remark}}.",
    "email_subject": "Wallet Top-up Request {{status}} - {{app_name}}",
    "email_template": "Dear {{name}},\n\nYour wallet top-up request for Rs {{amount}} with UTR {{utr}} has been {{status}}.\n\nUpdated Wallet Balance: Rs {{current_balance}}\nAdmin Remark: {{remark}}\n\nIf you have any questions, please reach out to our support team.\n\nRegards,\nFinance Team, {{app_name}}",
    "sms_template": "Dear {{name}}, wallet top-up of Rs {{amount}} (UTR: {{utr}}) is {{status}}. Balance: Rs {{current_balance}}. Remark: {{remark}}",
    "allowed_keywords": [
      "name",
      "status",
      "amount",
      "utr",
      "current_balance",
      "remark",
      "app_name"
    ],
    "sort_order": 10
  },
  {
    "event_key": "redeem_wallet_request_user",
    "title": "Redeem Wallet Request (User Confirmation)",
    "category": "Wallet & Payments",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Dear {{name}}, your wallet payout request of Rs {{amount}} to bank {{bank_name}} (A/C: {{account_number}}) has been submitted successfully. Request ID: {{request_id}}.",
    "email_subject": "Wallet Payout Request Submitted - {{app_name}}",
    "email_template": "Dear {{name}},\n\nYour wallet payout request has been registered and is under processing.\n\nDetails:\n- Request ID: {{request_id}}\n- Amount: Rs {{amount}}\n- Bank: {{bank_name}}\n- Account No: {{account_number}}\n- Date: {{date_time}}\n\nYou will be notified once the payout is processed.\n\nRegards,\nFinance Team, {{app_name}}",
    "sms_template": "Dear {{name}}, wallet payout request of Rs {{amount}} to {{bank_name}} (A/C: {{account_number}}) is submitted. ID: {{request_id}}",
    "allowed_keywords": [
      "name",
      "amount",
      "bank_name",
      "account_number",
      "request_id",
      "date_time",
      "app_name"
    ],
    "sort_order": 11
  },
  {
    "event_key": "redeem_wallet_request_admin",
    "title": "Redeem Wallet Request (Admin Alert)",
    "category": "Wallet & Payments",
    "recipient_type": "admin",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "[ADMIN ALERT] New Wallet Payout Request #{{request_id}} from {{user_name}} ({{username}}). Amount: Rs {{amount}}, Bank: {{bank_name}}, A/C: {{account_number}}. Review: {{admin_url}}",
    "email_subject": "[Admin Alert] New Wallet Payout Request - Rs {{amount}} from {{username}}",
    "email_template": "Admin Alert,\n\nA new wallet payout request has been submitted.\n\n- User: {{user_name}} ({{username}})\n- Request ID: {{request_id}}\n- Amount: Rs {{amount}}\n- Bank: {{bank_name}}\n- Account Number: {{account_number}}\n\nApprove or review at:\n{{admin_url}}\n\nSystem Bot,\n{{app_name}}",
    "sms_template": "[ADMIN] New Payout Req #{{request_id}} from {{username}}. Amount: Rs {{amount}}, Bank: {{bank_name}}. Review: {{admin_url}}",
    "allowed_keywords": [
      "username",
      "user_name",
      "amount",
      "bank_name",
      "account_number",
      "request_id",
      "admin_url",
      "app_name"
    ],
    "sort_order": 12
  },
  {
    "event_key": "redeem_approved_rejected_user",
    "title": "Redeem Approved / Rejected (User)",
    "category": "Wallet & Payments",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Dear {{name}}, your wallet payout request of Rs {{amount}} to {{bank_name}} has been {{status}}. Payout UTR: {{payout_utr}}. Remark: {{remark}}.",
    "email_subject": "Wallet Payout Request {{status}} - {{app_name}}",
    "email_template": "Dear {{name}},\n\nYour wallet payout request for Rs {{amount}} to {{bank_name}} has been {{status}}.\n\n- Status: {{status}}\n- Payout UTR / Ref: {{payout_utr}}\n- Remarks: {{remark}}\n\nThank you for choosing {{app_name}}.\n\nRegards,\nFinance Team, {{app_name}}",
    "sms_template": "Dear {{name}}, your payout of Rs {{amount}} to {{bank_name}} has been {{status}}. UTR: {{payout_utr}}. Remark: {{remark}}",
    "allowed_keywords": [
      "name",
      "status",
      "amount",
      "payout_utr",
      "bank_name",
      "remark",
      "app_name"
    ],
    "sort_order": 13
  },
  {
    "event_key": "pending_recharge_seller",
    "title": "Pending Recharge to Seller",
    "category": "Recharge Operations",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Notice to Seller {{seller_name}}: Recharge order #{{order_id}} for {{operator}} Rs {{amount}} (Mobile: {{mobile_number}}) is currently PENDING. Please check seller terminal.",
    "email_subject": "Pending Recharge Alert - Order #{{order_id}} - {{app_name}}",
    "email_template": "Dear {{seller_name}},\n\nA recharge order routed through your account is currently in PENDING state.\n\n- Order ID: {{order_id}}\n- Operator: {{operator}}\n- Number: {{mobile_number}}\n- Amount: Rs {{amount}}\n- Time: {{created_at}}\n\nPlease verify upstream operator confirmation or update status.\n\nRegards,\nOperations Team, {{app_name}}",
    "sms_template": "Notice to {{seller_name}}: Order #{{order_id}} for {{operator}} Rs {{amount}} ({{mobile_number}}) is PENDING. Clear ASAP.",
    "allowed_keywords": [
      "seller_name",
      "order_id",
      "operator",
      "amount",
      "mobile_number",
      "created_at",
      "app_name"
    ],
    "sort_order": 14
  },
  {
    "event_key": "pending_complaint_seller",
    "title": "Pending Complaint to Seller",
    "category": "Recharge Operations",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Dispute Alert for Seller {{seller_name}}: A complaint (#{{complaint_id}}) has been raised on order #{{order_id}} ({{operator}} Rs {{amount}}). Reason: {{reason}}. Please resolve promptly.",
    "email_subject": "Urgent: Dispute Raised on Order #{{order_id}} - {{app_name}}",
    "email_template": "Dear {{seller_name}},\n\nA dispute has been lodged regarding the following transaction:\n\n- Complaint ID: {{complaint_id}}\n- Order ID: {{order_id}}\n- Operator: {{operator}}\n- Mobile Number: {{mobile_number}}\n- Amount: Rs {{amount}}\n- Issue Description: {{reason}}\n\nPlease investigate and resolve the issue within 24 hours.\n\nRegards,\nDisputes & Resolution Team, {{app_name}}",
    "sms_template": "Dispute Alert {{seller_name}}: Complaint #{{complaint_id}} on order #{{order_id}} (Rs {{amount}}). Reason: {{reason}}",
    "allowed_keywords": [
      "seller_name",
      "complaint_id",
      "order_id",
      "operator",
      "amount",
      "mobile_number",
      "reason",
      "app_name"
    ],
    "sort_order": 15
  },
  {
    "event_key": "api_low_balance_user",
    "title": "API Low Balance to User",
    "category": "Account & Security",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Low Balance Alert: Dear {{name}}, your wallet balance on {{app_name}} is Rs {{current_balance}}, which is below your threshold of Rs {{threshold_amount}}. Please top up at {{topup_url}} to prevent service interruption.",
    "email_subject": "Low Balance Warning - {{app_name}} Account {{username}}",
    "email_template": "Dear {{name}},\n\nYour account wallet balance has dropped below the warning limit.\n\n- Account: {{username}}\n- Current Balance: Rs {{current_balance}}\n- Warning Threshold: Rs {{threshold_amount}}\n\nTo ensure your automated API recharges and transactions continue without interruption, please top up your wallet:\n{{topup_url}}\n\nRegards,\nBilling Department, {{app_name}}",
    "sms_template": "Low Balance: Dear {{name}}, {{app_name}} balance is Rs {{current_balance}} (below Rs {{threshold_amount}}). Top up: {{topup_url}}",
    "allowed_keywords": [
      "name",
      "username",
      "current_balance",
      "threshold_amount",
      "topup_url",
      "app_name"
    ],
    "sort_order": 16
  },
  {
    "event_key": "bank_approved_redeem",
    "title": "Bank Approved for Redeem",
    "category": "Wallet & Payments",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Dear {{name}}, your bank account {{bank_name}} (A/C: {{account_number}}) has been {{status}} for wallet payouts. You can now request withdrawals to this account.",
    "email_subject": "Bank Account Verification {{status}} - {{app_name}}",
    "email_template": "Dear {{name}},\n\nYour bank account submission has been reviewed and {{status}} for wallet payouts.\n\n- Bank: {{bank_name}}\n- Account Number: {{account_number}}\n- IFSC: {{ifsc}}\n- Admin Remark: {{remark}}\n\nYou can now initiate instant payouts directly to this bank account.\n\nRegards,\nVerification Team, {{app_name}}",
    "sms_template": "Dear {{name}}, your bank {{bank_name}} (A/C: {{account_number}}) has been {{status}} for payouts. Remark: {{remark}}",
    "allowed_keywords": [
      "name",
      "bank_name",
      "account_number",
      "ifsc",
      "status",
      "remark",
      "app_name"
    ],
    "sort_order": 17
  },
  {
    "event_key": "seller_api_auto_disabled",
    "title": "Msg to Seller for API Inactive (Pending/Failure)",
    "category": "Developer & API",
    "recipient_type": "user",
    "whatsapp_enabled": true,
    "email_enabled": true,
    "sms_enabled": false,
    "whatsapp_template": "Alert to Seller {{seller_name}}: Your Seller API \"{{api_name}}\" on {{app_name}} has become INACTIVE. Reason: {{reason}}. Date/Time: {{date_time}}. Please check pending/failed transactions.",
    "email_subject": "Alert: Seller API Inactive - {{api_name}} - {{app_name}}",
    "email_template": "Dear {{seller_name}},\n\nYour Seller API \"{{api_name}}\" on {{app_name}} has been marked INACTIVE.\n\nReason: {{reason}}\nDate & Time: {{date_time}}\n\nPlease review your API health, clear pending transactions, or contact support to re-activate it.\n\nRegards,\nOperations Team, {{app_name}}",
    "sms_template": "Alert {{seller_name}}: Your API \"{{api_name}}\" on {{app_name}} is INACTIVE. Reason: {{reason}}. Date: {{date_time}}.",
    "allowed_keywords": [
      "seller_name",
      "api_name",
      "reason",
      "date_time",
      "app_name"
    ],
    "sort_order": 18
  }
];

/**
 * Replaces {{variable}} placeholders with values from params
 */
function renderTemplate(template, params = {}) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return params[key] !== undefined && params[key] !== null ? String(params[key]) : `{{${key}}}`;
  });
}

/**
 * Seeds or updates default templates in admin_notification_templates table
 */
async function seedNotificationTemplates(dbOrClient) {
  for (const t of DEFAULT_NOTIFICATION_TEMPLATES) {
    await dbOrClient.query(
      `INSERT INTO admin_notification_templates (
         event_key, title, category, recipient_type,
         whatsapp_enabled, email_enabled, sms_enabled,
         whatsapp_template, email_subject, email_template, sms_template,
         allowed_keywords, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
       ON CONFLICT (event_key) DO UPDATE SET
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         recipient_type = EXCLUDED.recipient_type,
         allowed_keywords = EXCLUDED.allowed_keywords,
         sort_order = EXCLUDED.sort_order,
         sms_template = CASE WHEN admin_notification_templates.sms_template IS NULL OR admin_notification_templates.sms_template = '' THEN EXCLUDED.sms_template ELSE admin_notification_templates.sms_template END
       WHERE admin_notification_templates.allowed_keywords IS NULL 
          OR admin_notification_templates.allowed_keywords = '[]'::jsonb
          OR admin_notification_templates.sms_template IS NULL
          OR admin_notification_templates.sms_template = ''`,
      [
        t.event_key,
        t.title,
        t.category,
        t.recipient_type,
        t.whatsapp_enabled,
        t.email_enabled,
        t.sms_enabled,
        t.whatsapp_template,
        t.email_subject,
        t.email_template,
        t.sms_template,
        JSON.stringify(t.allowed_keywords),
        t.sort_order,
      ]
    );
  }
}

module.exports = {
  DEFAULT_NOTIFICATION_TEMPLATES,
  renderTemplate,
  seedNotificationTemplates,
};
