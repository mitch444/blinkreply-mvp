/**
 * Storage adapter stub (S3/DynamoDB planned).
 * Replace with AWS SDK wiring when ready.
 */

function saveRawPayload(payload, metadata = {}) {
  console.log("[Storage Adapter] saveRawPayload called", {
    bytes: payload ? payload.length : 0,
    metadata
  });
  return { ok: true, id: `payload_${Date.now()}` };
}

function replayPayload(payloadId) {
  console.log("[Storage Adapter] replayPayload called", payloadId);
  return { ok: false, reason: "Not implemented" };
}

module.exports = {
  saveRawPayload,
  replayPayload
};
