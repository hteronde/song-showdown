// Bracket saves include up to 128 songs, streaming URLs, album art URLs,
// and session dates. Keep a bounded limit large enough for that metadata.
export const maxJsonBodyBytes = 4 * 1024 * 1024;

export async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxJsonBodyBytes) {
      const error = new Error('Request body is too large. The maximum size is 4 MB.');
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } catch {
    const error = new Error('Request body must contain valid JSON.');
    error.status = 400;
    throw error;
  }
}
