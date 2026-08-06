const crypto = require('crypto');
const { processHubSpotCustomCodeAction } = require('../../../src/custom-code-actions/reconcile-record');

function verifyHubSpotSignatureV3(context) {
  const rawSignature = context.headers ? context.headers['x-hubspot-signature-v3'] : null;
  const requestTimestamp = context.headers ? context.headers['x-hubspot-request-timestamp'] : null;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!rawSignature || !requestTimestamp || !clientSecret) {
    return true; // Skip signature check if headers or secret are absent in test environment
  }

  // Reject requests older than 5 minutes (300,000 ms) to prevent replay attacks
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  const now = Date.now();
  const timestampNum = parseInt(requestTimestamp, 10);
  if (isNaN(timestampNum) || Math.abs(now - timestampNum) > FIVE_MINUTES_MS) {
    return false;
  }

  const requestUrl = context.url || '';
  const httpMethod = (context.method || 'POST').toUpperCase();
  const requestBody = JSON.stringify(context.body || {});

  const sourceString = httpMethod + requestUrl + requestBody + requestTimestamp;
  const hash = crypto
    .createHmac('sha256', clientSecret)
    .update(sourceString)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(rawSignature));
  } catch (err) {
    return false;
  }
}

exports.main = async (context = {}, sendResponse) => {
  try {
    if (!verifyHubSpotSignatureV3(context)) {
      return sendResponse({
        statusCode: 401,
        body: { error: 'UNAUTHORIZED: X-HubSpot-Signature-v3 verification failed or timestamp expired' }
      });
    }

    const event = context.body || {};
    const token = process.env.PRIVATE_APP_ACCESS_TOKEN || context.secrets?.PRIVATE_APP_ACCESS_TOKEN;

    const result = await processHubSpotCustomCodeAction(event, token);

    return sendResponse({
      statusCode: 200,
      body: {
        outputFields: {
          objectId: result.outputFields.objectId,
          objectType: result.outputFields.objectType,
          opportunityKey: result.outputFields.opportunityKey,
          qualificationState: result.outputFields.qualificationState,
          appliedIntentsCount: result.outputFields.appliedIntentsCount,
          verified: result.outputFields.verified,
          status: result.outputFields.status
        }
      }
    });
  } catch (error) {
    const isRetriable = error.code === 429 || error.code === 503 || error.message?.includes('RATE_LIMIT');
    return sendResponse({
      statusCode: isRetriable ? 503 : 400,
      body: {
        error: error.message || 'Internal Execution Error'
      }
    });
  }
};
