require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const serverless = require('serverless-http');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.raw({ type: 'application/json' }));
app.use(express.json());

const sendTextMessage = async ({
  message,
  toPhoneNumber,
  apiKey,
  template
}) => {
  if (!message || !toPhoneNumber) {
    return { Status: 'Failed', Details: 'Missing message or phone number' };
  }

  try {
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/${7463923166}/${message}/${template}`;
    const response = await axios.get(url);

    return response.data;
  } catch (error) {
    console.log(error);
    return {
      Status: 'Failed',
      Details: error?.response?.data?.Details || error.message
    };
  }
};

app.post('/send-otp/supabase', async (req, res) => {
  console.log('request arrived');
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

    console.log(apiKey, template, webhookSecret);

    if (!apiKey || !template || !webhookSecret) {
      return res.status(500).json({
        error: `Environment variables not properly set for user_id: ${user_id}`
      });
    }

    const wh = new Webhook(webhookSecret.replace('v1,whsec_', ''));
    const { user, sms } = wh.verify(req.body, req.headers);

    console.log(user, sms);

    const response = await sendTextMessage({
      message: sms.otp,
      toPhoneNumber: user.phone,
      apiKey,
      template
    });

    console.log('response ===>', response);
    if (response.Status !== 'Success') {
      return res.status(400).json({
        error: {
          http_code: 400,
          message: `Failed to send SMS: ${response.Details}`
        }
      });
    }

    return res.status(200).json({
      success: true,
      details: response.Details
    });
  } catch (error) {
    console.log(error);
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
