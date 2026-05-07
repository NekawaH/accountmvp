import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: email,
    subject: 'Verify your email address',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:40px auto">
        <h2>Confirm your account</h2>
        <p>Click the button below to verify your email address. This link expires in 24 hours.</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          Verify Email
        </a>
        <p style="margin-top:24px;color:#6b7280;font-size:13px">
          Or copy this link: ${url}
        </p>
      </div>
    `,
  })
}
