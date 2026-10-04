'use strict';

const TABLE_BY_SIDE = Object.freeze({ buy: 'buyer_margin_settings', sell: 'seller_margin_settings' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function positiveInteger(value, field, { allowZero = false } = {}) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,12}$/.test(text)) throw Object.assign(new Error(`${field} सही नहीं है।`), { statusCode: 400 });
  const parsed = BigInt(text);
  if ((!allowZero && parsed < 1n) || parsed > 10_000_000_000_000n) {
    throw Object.assign(new Error(`${field} की सीमा सही नहीं है।`), { statusCode: 400 });
  }
  return parsed;
}

function minorCommission(amountMinor, percent) {
  const match = String(percent).match(/^(\d{1,3})(?:\.(\d{1,4}))?$/);
  if (!match) throw new Error('Stored commission value is invalid.');
  const percentageUnits = BigInt(match[1]) * 10_000n + BigInt((match[2] || '').padEnd(4, '0'));
  // amountMinor × percentage / 100, rounded to the nearest paise.
  const numerator = amountMinor * percentageUnits;
  const denominator = 1_000_000n;
  return (numerator + denominator / 2n) / denominator;
}

async function calculateTransactionMargin(db, userId, input) {
  const side = String(input.side || '').trim().toLowerCase();
  const table = TABLE_BY_SIDE[side];
  if (!table) throw Object.assign(new Error('Transaction side buy या sell होना चाहिए।'), { statusCode: 400 });
  const operatorId = String(input.operatorId || '').trim();
  if (!UUID.test(operatorId)) throw Object.assign(new Error('ऑपरेटर चुनना आवश्यक है।'), { statusCode: 400 });
  const amountMinor = positiveInteger(input.amountMinor, 'Transaction amount');
  const circleName = String(input.circleName || '').trim();
  if (!circleName || circleName.length > 80) throw Object.assign(new Error('सर्कल का नाम सही नहीं है।'), { statusCode: 400 });
  const roffer = input.roffer === true;
  const rofferAmount = input.rofferAmountMinor == null || input.rofferAmountMinor === ''
    ? 0n : positiveInteger(input.rofferAmountMinor, 'Roffer amount', { allowZero: true });
  const result = await db.query(
    `SELECT id, commission_percent, with_gst, required_min_roffer_minor
     FROM ${table}
     WHERE user_id=$1 AND operator_id=$2 AND circle_name IN ($3, 'All')
       AND EXISTS (SELECT 1 FROM operator_definitions o WHERE o.id=$2 AND o.status='active' AND o.deleted_at IS NULL)
       AND is_active=true AND deleted_at IS NULL
       AND (amount_type='all'
         OR (amount_type='fixed' AND amount_min_minor=$4)
         OR (amount_type='range' AND amount_min_minor <= $4 AND amount_max_minor >= $4))
       AND (is_roffer='all' OR (is_roffer='roffer_only' AND $5=true) OR (is_roffer='no_roffer' AND $5=false))
       AND required_min_roffer_minor <= $6
     ORDER BY (circle_name=$3) DESC,
              CASE amount_type WHEN 'fixed' THEN 0 WHEN 'range' THEN 1 ELSE 2 END,
              created_at DESC
     LIMIT 1`,
    [userId, operatorId, circleName, amountMinor.toString(), roffer, rofferAmount.toString()],
  );
  if (!result.rowCount) {
    return { side, settingId: null, baseAmountMinor: amountMinor.toString(), commissionMinor: '0', commissionPercent: '0', withGst: false };
  }
  const setting = result.rows[0];
  return {
    side,
    settingId: setting.id,
    baseAmountMinor: amountMinor.toString(),
    commissionMinor: minorCommission(amountMinor, setting.commission_percent).toString(),
    commissionPercent: String(setting.commission_percent),
    withGst: setting.with_gst,
  };
}

module.exports = { calculateTransactionMargin };
