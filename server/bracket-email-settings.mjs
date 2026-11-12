export async function saveAutomaticEmailSetting(connection, bracketId, disabled) {
  if (disabled === undefined) return;
  if (typeof disabled !== 'boolean') throw Object.assign(new Error('Choose whether to disable automatic emails.'), {status:400});
  await connection.execute(`UPDATE brackets SET
    automatic_emails_enabled_at=CASE WHEN automatic_emails_disabled=TRUE AND ?=FALSE THEN NOW(6) ELSE automatic_emails_enabled_at END,
    automatic_emails_disabled=? WHERE bracket_id=?`, [disabled, disabled, bracketId]);
}
