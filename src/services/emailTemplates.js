const escapeHtml = (value) => {
    if (value === null || value === undefined) return "";
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
};

const button = (url, label) => {
    const safeUrl = escapeHtml(url);
    const safeLabel = escapeHtml(label);

    return `
        <div style="margin: 20px 0; text-align: center;">
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer"
               style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">
                ${safeLabel}
            </a>
        </div>
    `;
};

const wrapEmail = ({ subject, preheader, contentHtml }) => {
    const safeSubject = escapeHtml(subject || "DevSync");
    const safePreheader = escapeHtml(preheader || subject || "");

    // Table-based layout for broad email client support.
    return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0; padding:0; background:#f3f4f6;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
      ${safePreheader}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6; padding: 24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px; max-width:100%; background:#ffffff; border-radius: 12px; overflow:hidden;">
            <tr>
              <td style="padding: 18px 20px; background:#111827; color:#ffffff; font-family: Arial, Helvetica, sans-serif;">
                <div style="font-size: 16px; font-weight: 700; letter-spacing: 0.2px;">DevSync</div>
                <div style="font-size: 12px; opacity: 0.85; margin-top: 4px;">${safeSubject}</div>
              </td>
            </tr>

            <tr>
              <td style="padding: 22px 20px; font-family: Arial, Helvetica, sans-serif; color:#111827; font-size: 14px; line-height: 1.6;">
                ${contentHtml || ""}
              </td>
            </tr>

            <tr>
              <td style="padding: 16px 20px; background:#f9fafb; font-family: Arial, Helvetica, sans-serif; color:#6b7280; font-size: 12px; line-height: 1.5;">
                <div>You’re receiving this email because it relates to your DevSync account.</div>
                <div style="margin-top: 6px;">If you didn’t expect this, you can ignore this message.</div>
              </td>
            </tr>
          </table>

          <div style="font-family: Arial, Helvetica, sans-serif; color:#9ca3af; font-size: 12px; margin-top: 12px;">© ${new Date().getFullYear()} DevSync</div>
        </td>
      </tr>
    </table>
  </body>
</html>
    `.trim();
};

module.exports = {
    escapeHtml,
    button,
    wrapEmail,
};
