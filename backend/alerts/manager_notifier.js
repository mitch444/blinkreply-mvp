/**
 * Manager notifier stub (SMS/Slack/email planned).
 */

function sendManagerAlert(message, channel = "sms") {
  console.log("[Manager Notifier]", { channel, message });
  return { ok: true };
}

module.exports = {
  sendManagerAlert
};
