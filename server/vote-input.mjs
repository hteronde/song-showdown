export function parseVoteInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Request body must be a JSON object.' };
  }

  const { userId, selectedEntryId, comment = null } = value;
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return { error: 'userId must be a positive integer.' };
  }
  if (!Number.isSafeInteger(selectedEntryId) || selectedEntryId < 1) {
    return { error: 'selectedEntryId must be a positive integer.' };
  }
  if (comment !== null && (typeof comment !== 'string' || comment.length > 280)) {
    return { error: 'comment must be a string no longer than 280 characters.' };
  }

  return { value: { userId, selectedEntryId, comment: comment?.trim() || null } };
}
