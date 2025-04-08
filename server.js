require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const serverless = require('serverless-http');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const sendTextMessage = async ({
  message,
  toPhoneNumber,
  apiKey,
  template
}) => {
  if (!message || !toPhoneNumber) {
    return { status: 'Failed', details: 'Missing message or phone number' };
  }

  try {
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/${toPhoneNumber}/${message}/${template}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    return {
      status: 'Failed',
      details: error?.response?.data?.details || error.message
    };
  }
};

app.post('/send-otp/supabase', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id in query params' });
    }

    const apiKey = process.env[`TWO_FACTOR_API_KEY_USER_ID_${user_id}`];
    // default otp template if not provided by user in env
    const template =
      process.env[`TWO_FACTOR_SMS_OTP_TEMPLATE_USER_ID_${user_id}`] || 'OTP1';

    const webhookSecret =
      process.env[`SUPABASE_HOOK_SECRET_USER_ID_${user_id}`];

    if (!apiKey || !template || !webhookSecret) {
      return res.status(500).json({
        error: `Environment variables not properly set for user_id: ${user_id}`
      });
    }

    const wh = new Webhook(webhookSecret.replace('v1,whsec_', ''));
    const { user, sms } = wh.verify(req.body, req.headers);

    const response = await sendTextMessage({
      message: sms.otp,
      toPhoneNumber: user.phone,
      apiKey,
      template
    });

    if (response.status !== 'Success') {
      return res.status(400).json({
        error: {
          http_code: 400,
          message: `Failed to send SMS: ${response.details}`
        }
      });
    }

    return res.status(200).json({
      success: true,
      details: response.details
    });
  } catch (error) {
    return res.status(500).json({
      error: {
        http_code: 500,
        message: `Internal server error: ${error.message || error}`
      }
    });
  }
});

// Create serverless handler for AWS Lambda
const handler = serverless(app, { provider: 'aws' });

// Export the handler for AWS Lambda
module.exports.handler = async (event, context) => {
  return await handler(event, context);
};

// Run the server locally if not in AWS Lambda environment
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}
