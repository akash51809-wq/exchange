'use strict';

/**
 * Utility functions and business logic for GST Invoices (Seller & Buyer)
 */

const MONTHS = [
  { value: '01', name: 'January' },
  { value: '02', name: 'February' },
  { value: '03', name: 'March' },
  { value: '04', name: 'April' },
  { value: '05', name: 'May' },
  { value: '06', name: 'June' },
  { value: '07', name: 'July' },
  { value: '08', name: 'August' },
  { value: '09', name: 'September' },
  { value: '10', name: 'October' },
  { value: '11', name: 'November' },
  { value: '12', name: 'December' },
];

/**
 * Returns last month and year based on Asia/Kolkata current date
 */
function getLastMonthYear() {
  const now = new Date();
  const kolkataStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const kDate = new Date(kolkataStr);
  let year = kDate.getFullYear();
  let month = kDate.getMonth(); // 0 = Jan, 9 = Oct. So if current is Oct (9), last month is 9 (September)
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  const monthStr = String(month).padStart(2, '0');
  return {
    year: String(year),
    month: monthStr,
    monthYear: `${year}-${monthStr}`,
  };
}

/**
 * Range for YYYY-MM in Asia/Kolkata timezone
 */
function getMonthRange(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const start = `${y}-${String(m).padStart(2, '0')}-01 00:00:00+05:30`;
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00+05:30`;
  return { start, end };
}

function getMonthName(monthNumber) {
  const m = parseInt(monthNumber, 10);
  if (m >= 1 && m <= 12) {
    return MONTHS[m - 1].name;
  }
  return String(monthNumber);
}

function isSameState(userState, adminState = 'Uttar Pradesh') {
  if (!userState) return false;
  const normalize = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  const u = normalize(userState);
  const a = normalize(adminState);
  if (!u || !a) return false;
  if (u === a) return true;
  if ((u === 'up' || u === 'uttarpradesh') && (a === 'up' || a === 'uttarpradesh')) return true;
  return false;
}

/**
 * Calculate GST amounts according to requirements:
 * Example: Total redeem / topup = Rs. 1,18,000/-
 * Taxable amount = 118000 / 1.18 = Rs. 1,00,000/-
 * Total tax (18%) = Rs. 18,000/-
 * If same state (e.g. UP):
 *   CGST = Rs. 9,000/- (9%)
 *   SGST = Rs. 9,000/- (9%)
 *   IGST = Rs. 0/-
 * Else (other states):
 *   CGST = Rs. 0/-
 *   SGST = Rs. 0/-
 *   IGST = Rs. 18,000/- (18%)
 */
function calculateGstAmounts(totalAmountMinor, userState, adminState = 'Uttar Pradesh') {
  const totalMinor = BigInt(totalAmountMinor || 0);
  if (totalMinor <= 0n) {
    return {
      taxableMinor: 0n,
      cgstMinor: 0n,
      sgstMinor: 0n,
      igstMinor: 0n,
      totalMinor: 0n,
      isSameState: false,
    };
  }

  const totalNum = Number(totalMinor);
  const taxableNum = Math.round(totalNum / 1.18);
  const totalTaxNum = totalNum - taxableNum;

  const sameState = isSameState(userState, adminState);

  let cgstNum = 0;
  let sgstNum = 0;
  let igstNum = 0;

  if (sameState) {
    cgstNum = Math.round(totalTaxNum / 2);
    sgstNum = totalTaxNum - cgstNum;
  } else {
    igstNum = totalTaxNum;
  }

  return {
    taxableMinor: BigInt(taxableNum),
    cgstMinor: BigInt(cgstNum),
    sgstMinor: BigInt(sgstNum),
    igstMinor: BigInt(igstNum),
    totalMinor,
    isSameState: sameState,
  };
}

/**
 * Sync / generate invoices for given monthYear
 */
async function syncMonthlyInvoices(db, year, month, adminState = 'Uttar Pradesh') {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const monthYear = `${y}-${String(m).padStart(2, '0')}`;
  const { start, end } = getMonthRange(y, m);

  // 1. Sync Seller Invoices from successful payout_requests
  const sellerPayouts = await db.query(
    `SELECT u.id AS user_id, u.state,
            COALESCE(SUM(p.amount_minor), 0) AS total_redeem_minor
     FROM users u
     JOIN payout_requests p ON p.user_id = u.id AND p.status = 'success'
     WHERE p.created_at >= $1 AND p.created_at < $2
       AND u.deleted_at IS NULL
     GROUP BY u.id, u.state
     HAVING COALESCE(SUM(p.amount_minor), 0) > 0`,
    [start, end]
  );

  for (const row of sellerPayouts.rows) {
    const totalMinor = BigInt(row.total_redeem_minor);
    const gst = calculateGstAmounts(totalMinor, row.state, adminState);

    await db.query(
      `INSERT INTO seller_gst_invoices (
         user_id, month_year, redeem_amount_minor, taxable_amount_minor,
         cgst_amount_minor, sgst_amount_minor, igst_amount_minor, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       ON CONFLICT (user_id, month_year) DO UPDATE SET
         redeem_amount_minor = EXCLUDED.redeem_amount_minor,
         taxable_amount_minor = EXCLUDED.taxable_amount_minor,
         cgst_amount_minor = EXCLUDED.cgst_amount_minor,
         sgst_amount_minor = EXCLUDED.sgst_amount_minor,
         igst_amount_minor = EXCLUDED.igst_amount_minor
       WHERE seller_gst_invoices.status = 'pending'`,
      [
        row.user_id,
        monthYear,
        gst.totalMinor.toString(),
        gst.taxableMinor.toString(),
        gst.cgstMinor.toString(),
        gst.sgstMinor.toString(),
        gst.igstMinor.toString(),
      ]
    );
  }

  // 2. Sync Buyer Invoices from approved wallet_fund_requests
  const buyerTopups = await db.query(
    `SELECT u.id AS user_id, u.state,
            COALESCE(SUM(w.amount_minor), 0) AS total_topup_minor
     FROM users u
     JOIN wallet_fund_requests w ON w.user_id = u.id AND w.status = 'approved'
     WHERE w.created_at >= $1 AND w.created_at < $2
       AND u.deleted_at IS NULL
     GROUP BY u.id, u.state
     HAVING COALESCE(SUM(w.amount_minor), 0) > 0`,
    [start, end]
  );

  for (const row of buyerTopups.rows) {
    const totalMinor = BigInt(row.total_topup_minor);
    const gst = calculateGstAmounts(totalMinor, row.state, adminState);

    await db.query(
      `INSERT INTO buyer_gst_invoices (
         user_id, month_year, topup_amount_minor, taxable_amount_minor,
         cgst_amount_minor, sgst_amount_minor, igst_amount_minor, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       ON CONFLICT (user_id, month_year) DO UPDATE SET
         topup_amount_minor = EXCLUDED.topup_amount_minor,
         taxable_amount_minor = EXCLUDED.taxable_amount_minor,
         cgst_amount_minor = EXCLUDED.cgst_amount_minor,
         sgst_amount_minor = EXCLUDED.sgst_amount_minor,
         igst_amount_minor = EXCLUDED.igst_amount_minor
       WHERE buyer_gst_invoices.status = 'pending'`,
      [
        row.user_id,
        monthYear,
        gst.totalMinor.toString(),
        gst.taxableMinor.toString(),
        gst.cgstMinor.toString(),
        gst.sgstMinor.toString(),
        gst.igstMinor.toString(),
      ]
    );
  }
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

module.exports = {
  MONTHS,
  getLastMonthYear,
  getMonthRange,
  getMonthName,
  isSameState,
  calculateGstAmounts,
  syncMonthlyInvoices,
  formatDisplayDate,
};
