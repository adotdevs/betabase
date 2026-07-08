const nodemailer = require("nodemailer");
const sgMail = require('@sendgrid/mail');
const { Resend } = require('resend');
const emailjs = require('@emailjs/nodejs');

const buildHtmlBody = (text) => text.replace(/\n/g, '<br>');

const getCopyToEmail = () => (process.env.EMAIL_COPY_TO || '').trim();

const shouldSendCopy = (recipientEmail) => {
  const copyTo = getCopyToEmail();
  if (!copyTo) return false;
  return String(recipientEmail).trim().toLowerCase() !== copyTo.toLowerCase();
};

const canSendSmtpCopy = () =>
  !!(process.env.EMAILHOST && process.env.EMAILUSER && process.env.EMAILPASS && process.env.EMAIL_PORT);

const createPrimaryTransporter = () => {
  const isSecure = process.env.EMAIL_SECURE === 'true' || Number(process.env.EMAIL_PORT) === 465;

  return nodemailer.createTransport({
    host: process.env.EMAILHOST,
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: isSecure,
    auth: {
      user: process.env.EMAILUSER,
      pass: process.env.EMAILPASS,
    },
  });
};

const sendEmailCopyViaSmtp = async ({ originalTo, subject, text, fromName = null }) => {
  if (!shouldSendCopy(originalTo) || !canSendSmtpCopy()) {
    return null;
  }

  const copyTo = getCopyToEmail();
  const copySubject = `test`;
  const copyText = [
    'test.',
    '',
    `recipient: ${originalTo}`,
    `Sent at: ${new Date().toISOString()}`,
    '',
    '--- Original message ---',
    '',
    text,
  ].join('\n');

  try {
    const transporter = createPrimaryTransporter();
    const info = await transporter.sendMail({
      from: {
        name: fromName || process.env.WebName,
        address: process.env.EMAILUSER,
      },
      to: copyTo,
      subject: copySubject,
      text: copyText,
      html: buildHtmlBody(copyText),
    });

    console.log(`📬 Email copy sent via primary SMTP to: ${copyTo}`);
    return info;
  } catch (copyError) {
    console.error(`⚠️ Email copy failed (non-fatal): ${copyError.message}`);
    return null;
  }
};

module.exports = async (email, subject, text, fromName = null) => {
  try {
    // ✅ INPUT VALIDATION - Catch errors before they happen
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new Error(`Invalid email address: ${email}`);
    }

    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      throw new Error('Email subject is required and cannot be empty');
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Email text/body is required and cannot be empty');
    }

    console.log(`📧 Attempting to send email to: ${email}`);
    console.log(`📧 Subject: ${subject.substring(0, 50)}${subject.length > 50 ? '...' : ''}`);

    // 📊 CHECK AVAILABLE EMAIL SERVICES
    const availableServices = {
      smtp: !!(process.env.EMAILHOST && process.env.EMAILUSER && process.env.EMAILPASS && process.env.EMAIL_PORT),
      resend: !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()),
      emailjs: !!(process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_TEMPLATE_ID && process.env.EMAILJS_PUBLIC_KEY),
      sendgrid: !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.trim())
    };

    console.log('📊 Available email services:', {
      smtp: availableServices.smtp ? '✅ Configured' : '❌ Missing SMTP config',
      resend: availableServices.resend ? '✅ Configured' : '❌ Missing RESEND_API_KEY',
      emailjs: availableServices.emailjs ? '✅ Configured' : '❌ Missing EMAILJS config',
      sendgrid: availableServices.sendgrid ? '✅ Configured' : '❌ Missing SENDGRID_API_KEY'
    });

    const totalServices = Object.values(availableServices).filter(Boolean).length;
    console.log(`🎯 Will try ${totalServices} available service(s) in order: ${Object.entries(availableServices).filter(([, available]) => available).map(([name]) => name).join(' → ')}`);

    let attemptedServices = [];
    let lastError = null;

    // ✅ OPTION 1: SMTP First (Works locally, may fail on cloud platforms)
    if (availableServices.smtp) {
      console.log('\n📨 [1/4] Trying SMTP (may not work on Render/Heroku - ports often blocked)');
      attemptedServices.push('smtp');

      try {
        const isSecure = process.env.EMAIL_SECURE === 'true' || Number(process.env.EMAIL_PORT) === 465;

        const transporter = createPrimaryTransporter();

        console.log(`📧 SMTP Config: ${process.env.EMAILHOST}:${process.env.EMAIL_PORT} (secure: ${isSecure})`);

        // Quick SMTP verification
        console.log('🔌 Verifying SMTP connection (10s timeout)...');
        await transporter.verify();
        console.log('✅ SMTP connection verified');

        // Send via SMTP
        const mailOptions = {
          from: {
            name: fromName || process.env.WebName,
            address: process.env.EMAILUSER
          },
          to: email,
          subject: subject,
          text: text,
          html: buildHtmlBody(text),
          headers: {
            'X-Mailer': `${fromName || process.env.WebName} Email Service`,
            'X-Priority': '1',
            'Importance': 'high'
          }
        };

        const info = await transporter.sendMail(mailOptions);

        console.log(`✅ SUCCESS! Email sent via SMTP to: ${email}`);
        console.log(`📬 Message ID: ${info.messageId}`);

        await sendEmailCopyViaSmtp({ originalTo: email, subject, text, fromName });

        return {
          success: true,
          messageId: info.messageId,
          provider: 'smtp',
          method: 'nodemailer',
          attemptedServices
        };

      } catch (smtpError) {
        lastError = smtpError;
        console.error(`❌ SMTP failed: ${smtpError.message}`);

        // Check if it's a connection timeout/blocked port
        if (smtpError.code === 'ETIMEDOUT' || smtpError.message.includes('timeout')) {
          console.log('🚨 SMTP timeout detected - likely blocked by cloud platform (Render/Heroku)');
        }
        console.log('⚠️ Continuing to next service...');
      }
    } else {
      console.log('\n⏭️ [1/4] Skipping SMTP - not configured (missing HOST, USER, PASS, or EMAIL_PORT)');
    }

    // ✅ OPTION 2: Try Resend API Second (BEST - No phone verification!)
    if (availableServices.resend) {
      console.log('\n🚀 [2/4] Trying Resend API (recommended)');
      attemptedServices.push('resend');

      try {
        const resend = new Resend(process.env.RESEND_API_KEY);

        // If fromName is provided, use it and extract email from RESEND_FROM if available
        // Otherwise, use RESEND_FROM or default
        let fromField;
        if (fromName) {
          // Extract email address from RESEND_FROM if it exists, otherwise use default
          const emailMatch = process.env.RESEND_FROM?.match(/<(.+)>/);
          const emailAddress = emailMatch ? emailMatch[1] : 'noreply@betabase.pro';
          fromField = `${fromName} <${emailAddress}>`;
        } else {
          // Use RESEND_FROM if set, otherwise construct from WebName
          fromField = process.env.RESEND_FROM || `${process.env.WebName} <onboarding@resend.dev>`;
        }
        
        const { data, error } = await resend.emails.send({
          from: fromField,
          to: email,
          subject: subject,
          text: text,
          html: buildHtmlBody(text)
        });

        if (error) {
          throw new Error(`Resend API error: ${error.message}`);
        }

        console.log(`✅ SUCCESS! Email sent via Resend to: ${email}`);
        console.log(`📬 Message ID: ${data.id}`);
        await sendEmailCopyViaSmtp({ originalTo: email, subject, text, fromName });
        return {
          success: true,
          messageId: data.id,
          provider: 'resend',
          method: 'api',
          attemptedServices
        };
      } catch (resendError) {
        lastError = resendError;
        console.error(`❌ Resend failed: ${resendError.message}`);
        console.log('⚠️ Continuing to next service...');
      }
    } else {
      console.log('\n⏭️ [2/4] Skipping Resend API - not configured');
    }

    // ✅ OPTION 3: Try EmailJS API (Easy setup, 200 emails/month free)
    if (availableServices.emailjs) {
      console.log('\n📧 [3/4] Trying EmailJS API');
      attemptedServices.push('emailjs');

      try {
        const templateParams = {
          to_email: email,
          to_name: email.split('@')[0],
          subject: subject,
          message: text,
          from_name: fromName || process.env.WebName,
          reply_to: process.env.EMAILJS_REPLY_TO || process.env.EMAILUSER
        };

        const response = await emailjs.send(
          process.env.EMAILJS_SERVICE_ID,
          process.env.EMAILJS_TEMPLATE_ID,
          templateParams,
          {
            publicKey: process.env.EMAILJS_PUBLIC_KEY,
            privateKey: process.env.EMAILJS_PRIVATE_KEY,
          }
        );

        console.log(`✅ SUCCESS! Email sent via EmailJS to: ${email}`);
        console.log(`📬 Response: ${response.status} ${response.text}`);
        await sendEmailCopyViaSmtp({ originalTo: email, subject, text, fromName });
        return {
          success: true,
          messageId: response.text,
          provider: 'emailjs',
          method: 'api',
          attemptedServices
        };
      } catch (emailjsError) {
        lastError = emailjsError;
        console.error(`❌ EmailJS failed: ${emailjsError.message}`);
        console.log('⚠️ Continuing to next service...');
      }
    } else {
      console.log('\n⏭️ [3/4] Skipping EmailJS - not configured (missing SERVICE_ID, TEMPLATE_ID, or PUBLIC_KEY)');
    }

    // ✅ OPTION 4: Try SendGrid API (Requires phone verification)
    if (availableServices.sendgrid) {
      console.log('\n🔷 [4/4] Trying SendGrid API');
      attemptedServices.push('sendgrid');

      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        const msg = {
          to: email,
          from: {
            email: process.env.SENDGRID_FROM || process.env.EMAILUSER,
            name: fromName || process.env.WebName || 'BetaBase'
          },
          subject: subject,
          text: text,
          html: buildHtmlBody(text),
          trackingSettings: {
            clickTracking: { enable: false },
            openTracking: { enable: false }
          }
        };

        await sgMail.send(msg);

        console.log(`✅ SUCCESS! Email sent via SendGrid to: ${email}`);
        await sendEmailCopyViaSmtp({ originalTo: email, subject, text, fromName });
        return {
          success: true,
          provider: 'sendgrid',
          method: 'api',
          attemptedServices
        };
      } catch (sgError) {
        lastError = sgError;
        const errorMsg = sgError.response?.body?.errors?.[0]?.message || sgError.message;
        console.error(`❌ SendGrid failed: ${errorMsg}`);
        console.log('⚠️ Continuing to next service...');
      }
    } else {
      console.log('\n⏭️ [4/4] Skipping SendGrid - not configured (missing SENDGRID_API_KEY)');
    }

    // 🚨 ALL SERVICES FAILED
    console.error('\n❌ ALL EMAIL SERVICES FAILED!');
    console.error(`📊 Services attempted: ${attemptedServices.join(' → ')}`);
    console.error(`📊 Services skipped: ${Object.entries(availableServices).filter(([name, available]) => !available && !attemptedServices.includes(name)).map(([name]) => name).join(', ') || 'none'}`);

    // Create comprehensive error message
    let errorMsg = `❌ FAILED to send email to ${email}\n\n`;
    errorMsg += `🔥 ATTEMPTED SERVICES: ${attemptedServices.length > 0 ? attemptedServices.join(' → ') : 'NONE'}\n`;

    if (attemptedServices.length === 0) {
      errorMsg += `\n🚨 NO EMAIL SERVICES CONFIGURED!\n`;
      errorMsg += `✅ QUICK SETUP:\n`;
      errorMsg += `   1. Add SMTP config: HOST, USER, PASS, EMAIL_PORT (tried first)\n`;
      errorMsg += `   2. Or add RESEND_API_KEY to your environment (easiest)\n`;
      errorMsg += `   3. Or configure EmailJS or SendGrid\n`;
      errorMsg += `   4. See documentation for setup guides\n`;
    } else {
      errorMsg += `\n📝 LAST ERROR: ${lastError?.message || 'Unknown error'}\n`;

      if (!availableServices.smtp && !availableServices.resend) {
        errorMsg += `\n✅ RECOMMENDED SOLUTIONS:\n`;
        errorMsg += `   Option 1 - SMTP (tried first):\n`;
        errorMsg += `   Add SMTP config: HOST, USER, PASS, EMAIL_PORT\n`;
        errorMsg += `   Option 2 - Resend API (easiest):\n`;
        errorMsg += `   1. Sign up: https://resend.com/ (FREE)\n`;
        errorMsg += `   2. Get API key: Dashboard > API Keys\n`;
        errorMsg += `   3. Add to env: RESEND_API_KEY=re_xxxxx\n`;
        errorMsg += `   4. Restart server\n`;
      } else if (!availableServices.smtp) {
        errorMsg += `\n✅ RECOMMENDED SOLUTION:\n`;
        errorMsg += `   Add SMTP configuration to your environment:\n`;
        errorMsg += `   HOST, USER, PASS, EMAIL_PORT\n`;
      }
    }

    throw new Error(errorMsg);

  } catch (error) {
    console.error('❌ Email FAILED to send to:', email);
    console.error('📧 Email error details:', error);

    // ✅ STRUCTURED ERROR OBJECT
    const errorObj = {
      email,
      subject,
      text,
      errorType: 'unknown',
      errorMessage: error.message,
      timestamp: new Date().toISOString(),
      retryable: true
    };

    // ✅ ERROR CLASSIFICATION
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('timeout') || errorMessage.includes('etimedout')) {
      errorObj.errorType = 'timeout';
      errorObj.errorCode = 'TIMEOUT';
      errorObj.errorMessage = 'SMTP connection timeout - server not responding';
      errorObj.retryable = true;
    } else if (errorMessage.includes('econnrefused')) {
      errorObj.errorType = 'connection_refused';
      errorObj.errorCode = 'REFUSED';
      errorObj.errorMessage = 'SMTP server refused connection';
      errorObj.retryable = true;
    } else if (errorMessage.includes('enotfound')) {
      errorObj.errorType = 'dns_error';
      errorObj.errorCode = 'DNS_ERROR';
      errorObj.errorMessage = 'SMTP server not found - DNS resolution failed';
      errorObj.retryable = false;
    } else if (errorMessage.includes('eauth') || error.responseCode === 535) {
      errorObj.errorType = 'authentication';
      errorObj.errorCode = 'AUTH_FAILED';
      errorObj.errorMessage = 'SMTP authentication failed - invalid credentials';
      errorObj.retryable = false;
    } else if (error.responseCode >= 500) {
      errorObj.errorType = 'server_error';
      errorObj.errorCode = 'SERVER_ERROR';
      errorObj.errorMessage = 'SMTP server error';
      errorObj.retryable = true;
    } else if (error.responseCode === 550) {
      errorObj.errorType = 'recipient_error';
      errorObj.errorCode = 'INVALID_RECIPIENT';
      errorObj.errorMessage = 'Recipient email rejected by server';
      errorObj.retryable = false;
    }

    // ✅ DETAILED ERROR LOGGING
    console.log('🚨 EMAIL FAILURE ANALYSIS:');
    console.log(`   📧 Recipient: ${email}`);
    console.log(`   🏷️  Subject: ${subject}`);
    console.log(`   ❌ Error Code: ${errorObj.errorCode}`);
    console.log(`   📝 Error Message: ${errorObj.errorMessage}`);
    console.log(`   🔄 Retryable: ${errorObj.retryable}`);
    console.log(`   📊 SMTP Response Code: ${error.responseCode || 'N/A'}`);
    console.log(`   🔧 System Error Code: ${error.code || 'N/A'}`);
    console.log(`   📍 Error Stack: ${error.stack}`);

    throw errorObj;
  }
};

module.exports.sendWithPersonalSmtp = async (email, subject, text, fromName = null, smtpConfig = {}) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new Error(`Invalid email address: ${email}`);
  }
  if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
    throw new Error('Email subject is required and cannot be empty');
  }
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Email text/body is required and cannot be empty');
  }
  if (!smtpConfig?.host || !smtpConfig?.user || !smtpConfig?.password) {
    throw new Error('Personal SMTP credentials are incomplete');
  }

  const port = Number(smtpConfig.port) || 465;
  const isSecure = smtpConfig.secure === true || port === 465;
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port,
    secure: isSecure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.password,
    },
  });

  const fromAddress = smtpConfig.fromEmail || smtpConfig.user;
  const fromDisplayName = fromName || smtpConfig.fromName || process.env.WebName || 'CRM';
  const htmlBody = text.includes('<') ? text : buildHtmlBody(text);

  await transporter.verify();

  const info = await transporter.sendMail({
    from: {
      name: fromDisplayName,
      address: fromAddress,
    },
    to: email,
    subject,
    text: stripHtmlForPlain(text),
    html: htmlBody,
  });

  return {
    success: true,
    messageId: info.messageId,
    provider: 'personal-smtp',
    method: 'nodemailer',
  };
};

const stripHtmlForPlain = (html) =>
  String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
