const fs = require("fs");
const path = require("path");

const LOGO_CID = "betabase-logo@betabase.pro";
const LOGO_FILENAME = "logo-blue.png";
const DEFAULT_STATIC_LOGO = "/static/media/logo-blue.d335fe486a9e05b34898.png";

const getLogoPath = () => path.join(__dirname, "../../assets/email", LOGO_FILENAME);

const getFrontendBaseUrl = () => {
  const baseUrl = String(process.env.BASE_URL || "").trim().replace(/\/$/, "");
  const frontendUrl = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");

  if (frontendUrl) return frontendUrl;
  if (baseUrl && !baseUrl.includes("/users/") && !baseUrl.includes("api.")) {
    return baseUrl;
  }

  return "https://www.betabase.pro";
};

const getPublicLogoUrl = () => {
  const envLogoUrl = String(process.env.EMAIL_LOGO_URL || "").trim();
  if (envLogoUrl) return envLogoUrl;

  const apiPublicUrl = String(process.env.API_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (apiPublicUrl) {
    return `${apiPublicUrl}/api/v1/email-assets/${LOGO_FILENAME}`;
  }

  const baseUrl = String(process.env.BASE_URL || "").trim().replace(/\/$/, "");
  if (baseUrl.includes("api.")) {
    return `${baseUrl}/api/v1/email-assets/${LOGO_FILENAME}`;
  }

  const frontendUrl = getFrontendBaseUrl();
  return `${frontendUrl}${DEFAULT_STATIC_LOGO}`;
};

const getLogoAttachment = () => {
  const logoPath = getLogoPath();
  if (!fs.existsSync(logoPath)) return null;

  return {
    filename: LOGO_FILENAME,
    content: fs.readFileSync(logoPath),
    cid: LOGO_CID,
    contentType: "image/png",
  };
};

const buildLogoMarkup = (brandName, logoAttachment, publicLogoUrl) => {
  const alt = brandName;
  const imgStyle =
    "display:block;width:160px;max-width:160px;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto;";

  if (logoAttachment) {
    return `<!--[if mso]>
<img src="cid:${LOGO_CID}" alt="${alt}" width="160" border="0" style="${imgStyle}" />
<![endif]-->
<!--[if !mso]><!-->
<img src="${publicLogoUrl}" alt="${alt}" width="160" border="0" style="${imgStyle}" />
<!--<![endif]-->`;
  }

  return `<img src="${publicLogoUrl}" alt="${alt}" width="160" border="0" style="${imgStyle}" />`;
};

const buildActivationEmail = ({ verifyUrl, firstName }) => {
  const brandName = process.env.WebName || "Betabase";
  const safeName = String(firstName || "").trim();
  const greeting = safeName ? `Hi ${safeName},` : "Hi there,";
  const logoAttachment = getLogoAttachment();
  const publicLogoUrl = getPublicLogoUrl();
  const logoMarkup = buildLogoMarkup(brandName, logoAttachment, publicLogoUrl);
  const subject = `Activate your ${brandName} account`;
  const year = new Date().getFullYear();

  const text = `${greeting}

Welcome to ${brandName}! To activate your account, open the link below:

${verifyUrl}

This link expires in 2 hours.

If you did not create an account, you can safely ignore this email.

Best regards,
The ${brandName} Team`;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dbe3ee;">
          <tr>
            <td align="center" bgcolor="#000000" style="padding:24px 20px;background-color:#000000;">
              ${logoMarkup}
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 16px;">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:#0f172a;text-align:center;">
                Activate your account
              </h1>
              <p style="margin:0 0 12px;font-size:16px;line-height:24px;color:#334155;text-align:center;">
                ${greeting}
              </p>
              <p style="margin:0;font-size:15px;line-height:24px;color:#64748b;text-align:center;">
                Thanks for registering with ${brandName}. Confirm your email address to activate your account.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 40px 28px;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" bgcolor="#2563eb" style="background-color:#2563eb;">
                    <a href="${verifyUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;background-color:#2563eb;">
                      Activate Account
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px;">
              <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#64748b;text-align:center;">
                This link expires in <strong style="color:#334155;">2 hours</strong>.
              </p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#94a3b8;text-align:center;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0;font-size:13px;line-height:20px;text-align:center;word-break:break-all;">
                <a href="${verifyUrl}" target="_blank" style="color:#2563eb;text-decoration:underline;">${verifyUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #e2e8f0;background-color:#f8fafc;">
              <p style="margin:0;font-size:13px;line-height:20px;color:#64748b;text-align:center;">
                If you did not create a ${brandName} account, you can safely ignore this email.
              </p>
              <p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#94a3b8;text-align:center;">
                &copy; ${year} ${brandName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    text,
    html,
    attachments: logoAttachment ? [logoAttachment] : [],
  };
};

module.exports = {
  buildActivationEmail,
  getPublicLogoUrl,
  getLogoAttachment,
};
