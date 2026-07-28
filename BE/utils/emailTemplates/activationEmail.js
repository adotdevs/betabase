const fs = require("fs");
const path = require("path");

let cachedLogoDataUri = null;

const getLogoDataUri = () => {
  if (cachedLogoDataUri) return cachedLogoDataUri;

  const envLogoUrl = String(process.env.EMAIL_LOGO_URL || "").trim();
  if (envLogoUrl) return envLogoUrl;

  try {
    const logoPath = path.join(__dirname, "../../assets/email/logo-blue.png");
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      cachedLogoDataUri = `data:image/png;base64,${logoBuffer.toString("base64")}`;
      return cachedLogoDataUri;
    }
  } catch (error) {
    console.warn("Could not load email logo from assets:", error.message);
  }

  const frontendUrl = String(process.env.FRONTEND_URL || "https://www.betabase.pro").replace(/\/$/, "");
  return `${frontendUrl}/static/media/logo-blue.png`;
};

const buildActivationEmail = ({ verifyUrl, firstName }) => {
  const brandName = process.env.WebName || "Betabase";
  const safeName = String(firstName || "").trim();
  const greeting = safeName ? `Hi ${safeName},` : "Hi there,";
  const logoSrc = getLogoDataUri();
  const subject = `Activate your ${brandName} account`;

  const text = `${greeting}

Welcome to ${brandName}! To activate your account, open the link below:

${verifyUrl}

This link expires in 2 hours.

If you did not create an account, you can safely ignore this email.

Best regards,
The ${brandName} Team`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b1220;font-family:Arial,Helvetica,sans-serif;color:#e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0b1220;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:32px 24px 16px;background:linear-gradient(180deg,#111827 0%,#0f172a 100%);">
              <img src="${logoSrc}" alt="${brandName}" width="160" style="display:block;width:160px;max-width:100%;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;">
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:700;color:#f8fafc;text-align:center;">
                Activate your account
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;text-align:center;">
                ${greeting} thanks for registering with ${brandName}.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#94a3b8;text-align:center;">
                Click the button below to verify your email address and activate your account.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 28px;">
              <a href="${verifyUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#4f7df3 0%,#7c5cff 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:10px;">
                Activate Account
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#64748b;text-align:center;">
                This link will expire after <strong style="color:#cbd5e1;">2 hours</strong>.
              </p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;word-break:break-all;">
                If the button does not work, copy and paste this link into your browser:<br />
                <a href="${verifyUrl}" style="color:#93c5fd;text-decoration:none;">${verifyUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #1f2937;background-color:#0f172a;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;">
                If you did not create a ${brandName} account, you can safely ignore this email.
              </p>
              <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#475569;text-align:center;">
                &copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
};

module.exports = { buildActivationEmail, getLogoDataUri };
