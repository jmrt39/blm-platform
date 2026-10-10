// Demo swap screenshots, drawn per swap so the date, start time and names in the
// "text thread" always match the request being reviewed.
import { clock12 } from "../../shared/conduct";

type SwapLike = { businessDate: string; shift: string; startTime: string; fromName: string; toName: string; createdAt: Date };

const THUMB =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="132" height="132"><path fill="#FFDB5E" d="M34.956 17.916c0-.503-.12-.975-.321-1.404-1.341-4.326-7.619-4.01-16.549-4.221-1.493-.035-.639-1.798-.115-5.668.341-2.517-1.282-6.382-4.01-6.382-4.498 0-.171 3.548-4.148 12.322-2.125 4.688-6.875 2.062-6.875 6.771v10.719c0 1.833.18 3.595 2.758 3.885C8.195 34.219 7.633 36 11.238 36h18.044c1.838 0 3.333-1.496 3.333-3.334 0-.762-.267-1.456-.698-2.018 1.02-.571 1.72-1.649 1.72-2.899 0-.76-.266-1.454-.696-2.015 1.023-.57 1.725-1.649 1.725-2.901 0-.909-.368-1.733-.961-2.336.757-.611 1.251-1.535 1.251-2.581z"/><path fill="#EE9547" d="M23.02 21.249h8.604c1.17 0 2.268-.626 2.866-1.633.246-.415.109-.952-.307-1.199-.415-.247-.952-.108-1.199.307-.283.479-.806.775-1.361.775h-8.81c-.873 0-1.583-.71-1.583-1.583s.71-1.583 1.583-1.583H28.7c.483 0 .875-.392.875-.875s-.392-.875-.875-.875h-5.888c-1.838 0-3.333 1.495-3.333 3.333 0 1.025.475 1.932 1.205 2.544-.615.605-.998 1.445-.998 2.373 0 1.028.478 1.938 1.212 2.549-.611.604-.99 1.441-.99 2.367 0 1.12.559 2.108 1.409 2.713-.524.589-.852 1.356-.852 2.204 0 1.838 1.495 3.333 3.333 3.333h5.484c1.17 0 2.269-.625 2.867-1.632.247-.415.11-.952-.305-1.199-.416-.245-.953-.11-1.199.305-.285.479-.808.776-1.363.776h-5.484c-.873 0-1.583-.71-1.583-1.583s.71-1.583 1.583-1.583h6.506c1.17 0 2.27-.626 2.867-1.633.247-.416.11-.953-.305-1.199-.419-.251-.954-.11-1.199.305-.289.487-.799.777-1.363.777h-7.063c-.873 0-1.583-.711-1.583-1.584s.71-1.583 1.583-1.583h8.091c1.17 0 2.269-.625 2.867-1.632.247-.415.11-.952-.305-1.199-.417-.246-.953-.11-1.199.305-.289.486-.799.776-1.363.776H23.02c-.873 0-1.583-.71-1.583-1.583s.709-1.584 1.583-1.584z"/></svg>';

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const first = (n: string) => n.split(" ")[0] ?? n;
const initials = (n: string) =>
  n
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function longDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`);
  const wd = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { wd, md };
}

const W = 750;
const H = 1180;

function phone(contact: string, sentLabel: string, bubbles: string) {
  const html = `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;background:#fff;font-family:-apple-system,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif;color:#111;position:relative;overflow:hidden">
<div style="height:80px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;font-weight:600;font-size:30px">3:52<svg xmlns="http://www.w3.org/2000/svg" width="120" height="26" viewBox="0 0 120 26"><rect x="0" y="16" width="7" height="10" rx="2"/><rect x="11" y="11" width="7" height="15" rx="2"/><rect x="22" y="6" width="7" height="20" rx="2"/><rect x="33" y="1" width="7" height="25" rx="2"/><rect x="62" y="2" width="50" height="22" rx="6" fill="none" stroke="#111" stroke-width="2.5"/><rect x="66" y="6" width="36" height="14" rx="3"/><rect x="114" y="9" width="4" height="8" rx="1"/></svg></div>
<div style="height:170px;background:#f7f7f7;border-bottom:2px solid #dcdce0;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative">
<span style="position:absolute;left:30px;top:44px;font-size:70px;color:#0a84ff;line-height:1">‹</span>
<div style="width:100px;height:100px;border-radius:50%;background:#a0a6b2;color:#fff;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:600">${esc(initials(contact))}</div>
<div style="margin-top:10px;font-size:26px">${esc(contact)} ›</div></div>
<div style="padding:28px 30px;display:flex;flex-direction:column;gap:16px">
<div style="text-align:center;color:#8e8e93;font-size:22px;font-weight:500;margin-bottom:6px">${esc(sentLabel)}</div>
${bubbles}
</div>
<div style="position:absolute;left:0;right:0;bottom:0;height:110px;border-top:2px solid #e6e6e8;display:flex;align-items:center;gap:18px;padding:0 30px">
<div style="width:54px;height:54px;border-radius:50%;background:#e5e5ea;color:#8e8e93;font-size:40px;display:flex;align-items:center;justify-content:center">+</div>
<div style="flex:1;height:58px;border:2px solid #d2d2d6;border-radius:29px;display:flex;align-items:center;padding-left:24px;color:#bebec4;font-size:28px">iMessage</div></div>
</div>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><foreignObject width="${W}" height="${H}">${html}</foreignObject></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const me = (t: string) =>
  `<div style="align-self:flex-end;max-width:470px;background:#0a84ff;color:#fff;font-size:31px;line-height:42px;padding:14px 24px;border-radius:36px">${esc(t)}</div>`;
const them = (t: string) =>
  `<div style="align-self:flex-start;max-width:470px;background:#e9e9eb;color:#111;font-size:31px;line-height:42px;padding:14px 24px;border-radius:36px">${esc(t)}</div>`;
const read = `<div style="align-self:flex-end;margin-top:-8px;color:#8e8e93;font-size:21px;font-weight:500">Read 3:41 PM</div>`;

/** `demo:ok` shows a proper written agreement; `demo:thumbs` is the classic 👍 non-answer. */
export function demoShot(kind: string, sw: SwapLike) {
  const { wd, md } = longDate(sw.businessDate);
  const sent = sw.createdAt.toLocaleDateString("en-US", { weekday: "long" }) + " 3:38 PM";
  const shift = sw.shift === "lunch" ? "lunch" : "dinner";
  const call = clock12(sw.startTime).toUpperCase();
  const short = clock12(sw.startTime).replace(":00", "").replace(" ", "");
  if (kind === "thumbs") {
    return phone(sw.toName, sent, me("can u grab my shift?") + `<div style="align-self:flex-start;margin-left:20px">${THUMB}</div>`);
  }
  return phone(
    sw.toName,
    sent,
    me(`Hey ${first(sw.toName)} — any chance you can take my ${shift} shift on ${wd}, ${md}? Call time is ${call}.`) +
      them(`Yes, I'll take your ${wd} ${shift} ${short}. I'll be there.`) +
      me("Thank you!! Putting the request in now") +
      read,
  );
}
