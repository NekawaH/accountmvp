import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: email,
    subject: 'Verify your email – Pseudocode IDE',
    text: `Verify your email address\n\nClick the link below to confirm your account. This link expires in 24 hours.\n\n${url}\n\nIf you did not create an account, you can ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#111">
        <h2 style="margin-bottom:8px">Verify your email address</h2>
        <p style="color:#374151">Click the button below to confirm your account. This link expires in 24 hours.</p>
        <a href="${url}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          Verify Email
        </a>
        <p style="color:#6b7280;font-size:13px">Or copy this link into your browser:<br>${url}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#9ca3af;font-size:12px">If you did not create an account, you can safely ignore this email.</p>
      </div>
    `,
  })
}
