'use strict';

/**
 * Checks and deactivates users who have had NO buy or sale transactions for `inactiveDays`
 * - Buy txn: recharge_orders.user_id = user.id
 * - Sale txn: recharge_orders.seller_user_id = user.id
 * Users with no buy or sale in the last X days and created more than X days ago are set to status = 'blocked' (Inactive).
 */
async function checkAndDeactivateInactiveUsers({ db, inactiveDays = 30, dryRun = false }) {
  const days = Math.max(1, parseInt(inactiveDays || 30, 10));

  const query = `
    SELECT u.id, u.username, u.name, u.created_at,
           GREATEST(
             (SELECT MAX(created_at) FROM recharge_orders WHERE user_id = u.id),
             (SELECT MAX(created_at) FROM recharge_orders WHERE seller_user_id = u.id)
           ) AS last_txn_at
    FROM users u
    WHERE u.role = 'user'
      AND u.status = 'active'
      AND u.deleted_at IS NULL
      AND u.created_at < now() - ($1 || ' days')::interval
      AND NOT EXISTS (
        SELECT 1 FROM recharge_orders r
        WHERE (r.user_id = u.id OR r.seller_user_id = u.id)
          AND r.created_at >= now() - ($1 || ' days')::interval
      )
  `;

  const result = await db.query(query, [days]);
  const inactiveUsers = result.rows || [];

  const formattedUsers = inactiveUsers.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    lastTxnAt: u.last_txn_at,
    createdAt: u.created_at,
  }));

  if (dryRun || inactiveUsers.length === 0) {
    return {
      ok: true,
      thresholdDays: days,
      count: inactiveUsers.length,
      users: formattedUsers,
      deactivatedUsers: formattedUsers,
    };
  }

  const userIds = inactiveUsers.map((u) => u.id);
  const runner = typeof db.connect === 'function' ? await db.connect() : db;
  const isDedicatedClient = runner !== db;

  try {
    if (isDedicatedClient) await runner.query('BEGIN');
    await runner.query(
      `UPDATE users SET status = 'blocked', updated_at = now() WHERE id = ANY($1::uuid[])`,
      [userIds],
    );
    await runner.query(
      `UPDATE user_sessions SET revoked_at = now() WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL`,
      [userIds],
    );
    for (const u of inactiveUsers) {
      await runner.query(
        `INSERT INTO admin_audit_logs (action, target_type, target_id, details) VALUES ($1, $2, $3, $4)`,
        [
          'user_auto_inactivated',
          'user',
          u.id,
          JSON.stringify({
            reason: `No buy or sale transaction in the last ${days} days`,
            lastTxnAt: u.last_txn_at,
            thresholdDays: days,
          }),
        ],
      );
    }
    if (isDedicatedClient) await runner.query('COMMIT');
  } catch (err) {
    if (isDedicatedClient) await runner.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (isDedicatedClient && typeof runner.release === 'function') {
      runner.release();
    }
  }

  return {
    ok: true,
    thresholdDays: days,
    count: inactiveUsers.length,
    users: formattedUsers,
    deactivatedUsers: formattedUsers,
  };
}

module.exports = {
  checkAndDeactivateInactiveUsers,
};
