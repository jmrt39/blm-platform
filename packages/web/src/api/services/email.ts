/**
 * Outgoing mail through Resend. Until RESEND_API_KEY is set nothing is sent and callers fall back
 * to showing the link on screen for a manager to copy.
 */
export function emailReady() {
  return !!process.env.RESEND_API_KEY;
}

type Mail = { to: string; subject: string; text: string; html?: string; replyTo?: string };

export async function sendEmail(m: Mail): Promise<{ sent: boolean; error?: string }> {
  if (!emailReady()) return { sent: false, error: "Email is not connected yet." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "BLM Platform <platform@bottomlinemultiplied.com>",
        to: [m.to],
        subject: m.subject,
        text: m.text,
        html: m.html,
        reply_to: m.replyTo || process.env.EMAIL_REPLY_TO || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Resend error", res.status, body);
      return { sent: false, error: `Email could not be sent (${res.status}).` };
    }
    return { sent: true };
  } catch (e) {
    console.error("Resend error", e);
    return { sent: false, error: "Email could not be sent." };
  }
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A plain, branded message with one button. */
export function letter(o: { heading: string; lines: string[]; button: string; url: string; foot?: string }) {
  const text = [o.heading, "", ...o.lines, "", `${o.button}: ${o.url}`, "", o.foot ?? "", "", "Bottom Line Multiplied · The Platform"].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:Georgia,serif;color:#1b1814">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdf8;border:1px solid #e3d9c6">
<tr><td style="background:#14120f;padding:20px 28px;color:#c9a45c;font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase">BLM · The Platform</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font:400 26px/1.2 Georgia,serif">${esc(o.heading)}</h1>
${o.lines.map((l) => `<p style="margin:0 0 12px;font:15px/1.55 Helvetica,Arial,sans-serif;color:#3d372f">${esc(l)}</p>`).join("")}
<p style="margin:24px 0"><a href="${esc(o.url)}" style="display:inline-block;background:#14120f;color:#f4efe6;padding:12px 22px;text-decoration:none;font:600 14px Helvetica,Arial,sans-serif">${esc(o.button)}</a></p>
<p style="margin:0;font:12px/1.5 Helvetica,Arial,sans-serif;color:#7a7266">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(o.url)}</span></p>
${o.foot ? `<p style="margin:18px 0 0;font:12px/1.5 Helvetica,Arial,sans-serif;color:#7a7266">${esc(o.foot)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e3d9c6;font:11px/1.5 Helvetica,Arial,sans-serif;color:#7a7266">Bottom Line Multiplied LLC · Colorado</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}
