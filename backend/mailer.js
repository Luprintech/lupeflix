const nodemailer = require('nodemailer');

function appBaseUrl(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendVerificationEmail({ req, email, name, token }) {
  const base = appBaseUrl(req).replace(/\/$/, '');
  const verifyUrl = `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  if (!smtpConfigured()) {
    console.log(`\n[LupeFlix] Verificación de email para ${email}: ${verifyUrl}\n`);
    return { sent: false, verifyUrl };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Verifica tu cuenta de LupeFlix',
    html: `
      <div style="font-family:Inter,Arial,sans-serif;background:#0a0a0f;color:#fff;padding:32px">
        <div style="max-width:520px;margin:auto;background:#141414;padding:28px;border-radius:12px;border:1px solid rgba(255,255,255,.1)">
          <h1 style="color:#e50914;margin:0 0 12px">LUPEFLIX</h1>
          <p>Hola ${name || ''},</p>
          <p>Para activar tu cuenta, confirma tu correo electrónico.</p>
          <p style="margin:28px 0">
            <a href="${verifyUrl}" style="background:#e50914;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Verificar cuenta</a>
          </p>
          <p style="color:#999;font-size:13px">Si no has solicitado esta cuenta, ignora este correo.</p>
        </div>
      </div>
    `,
    text: `Verifica tu cuenta de LupeFlix: ${verifyUrl}`,
  });

  return { sent: true, verifyUrl };
}

module.exports = { sendVerificationEmail, smtpConfigured };
