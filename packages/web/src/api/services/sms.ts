/** Text messages through Twilio. Until the three TWILIO_ values are set, codes are not sent. */
export function smsReady() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

/** Best effort E.164 for US numbers typed any old way. */
export function normalizePhone(raw: string) {
  const d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d.length >= 11 ? d : null;
  const digits = d.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSms(to: string, body: string): Promise<{ sent: boolean; error?: string }> {
  if (!smsReady()) return { sent: false, error: "Text messages are not connected yet." };
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
    });
    if (!res.ok) {
      console.error("Twilio error", res.status, await res.text());
      return { sent: false, error: "The code could not be texted. Check the phone number." };
    }
    return { sent: true };
  } catch (e) {
    console.error("Twilio error", e);
    return { sent: false, error: "The code could not be texted." };
  }
}
