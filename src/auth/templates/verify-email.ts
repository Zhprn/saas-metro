export const verifyEmailHtml = (
  name: string | null | undefined,
  link: string,
) => `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <h2>Verify your email${name ? `, ${name}` : ''}</h2>
    <p>Click the button below to verify your email address.</p>
    <p><a href="${link}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">
      Verify Email
    </a></p>
    <p>If the button doesn’t work, copy and paste this link:<br>${link}</p>
    <p style="color:#6b7280;font-size:12px">This link expires in ${process.env.VERIFY_TOKEN_TTL_MIN ?? 30} minutes.</p>
  </div>
`;
