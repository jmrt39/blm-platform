import { Link } from "wouter";
import { Monogram } from "../components/monogram";
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY, LEGAL_MAILING_ADDRESS, LEGAL_STATE, LEGAL_VERSION } from "../../shared/legal";

type Section = { h: string; p: (string | string[])[] };

const effective = new Date(`${LEGAL_VERSION}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const PRIVACY: Section[] = [
  {
    h: "Who we are",
    p: [
      `The Platform is run by ${LEGAL_ENTITY}, a ${LEGAL_STATE} limited liability company ("BLM", "we", "us"). This policy explains what the platform collects, why, who can see it, and the choices you have.`,
      "Restaurants and restaurant groups (our clients) use The Platform to run front of house: checklists, line ups, shift reports, training, rewards, conduct records and guest feedback. For information about a restaurant's own team and guests, the restaurant decides what goes in and how it is used, and we handle it on their behalf and on their instructions.",
    ],
  },
  {
    h: "What we collect",
    p: [
      [
        "Account details: name, email address, password (stored only as a secure hash), and the mobile number used for security codes.",
        "Team records a restaurant enters: names, roles, store, hire date, contact details, PINs, schedules, shift sales figures, spend per ticket, training and certification records, quiz results, reward awards and payouts, conduct records, write ups, performance plans and signatures.",
        "Guest feedback a restaurant adds or imports: review text, star ratings, the reviewer name as published, and which team members it mentions.",
        "Sales history a restaurant loads or connects from its point of sale system: daily and per shift totals.",
        "Technical data: sign in sessions, IP address and browser details, and a log of who opened private records and when.",
      ],
    ],
  },
  {
    h: "How we use it",
    p: [
      [
        "To provide the platform to the restaurant that holds the account, including reports, ratings and reward standings.",
        "To send the messages the platform needs to send: invitations, password resets and security codes.",
        "To keep the service secure, investigate misuse, and keep encrypted backups so a restaurant's records can be restored.",
        "To support and improve the service for our clients.",
      ],
      "We do not sell personal information, and we do not use it for advertising.",
    ],
  },
  {
    h: "Who can see what",
    p: [
      "Inside a restaurant group, access follows role. Staff see their own record. Managers see what they need to run a shift. Conduct records, write ups and plans, staff contact details, pay and reward payouts, and guest reviews that name staff are private: only the owner and the general manager can open them, after confirming their password and a code sent to their phone, for thirty minutes at a time. Every opening is logged and the owner can review the log.",
      "BLM staff can see a client's records when the client has engaged us to set up or support their program.",
    ],
  },
  {
    h: "Service providers",
    p: [
      "We use a small number of providers to run the platform, each bound to use the data only to provide their service to us: application hosting and database hosting, file storage, email delivery, text message delivery for security codes, and Google sign in for people who choose it. A restaurant that connects its point of sale system authorizes that system to send sales data to us.",
      "We may disclose information if the law requires it, or to protect the rights, safety or property of our clients, their teams, or BLM.",
    ],
  },
  {
    h: "Security",
    p: [
      "Data is sent over encrypted connections. Passwords are hashed. Nightly backups are encrypted and kept for thirty days. Private records sit behind a second step, as described above, and opening them is logged. No system is perfectly secure; if we learn of a breach affecting your information, we will notify the affected client, and you where the law requires, without undue delay.",
    ],
  },
  {
    h: "How long we keep it",
    p: [
      "We keep a restaurant's records for as long as it holds an account with us. When a client leaves, we delete or return its records within ninety days of a written request, apart from encrypted backups, which age out within thirty days, and anything the law requires us to keep.",
    ],
  },
  {
    h: "Your choices and rights",
    p: [
      "If you work at a restaurant that uses The Platform, ask your employer first: they control your team record and can correct or remove it. You can also write to us and we will pass your request to them or help directly.",
      `Depending on where you live, including under the Colorado Privacy Act, you may have the right to access, correct, delete or get a copy of your personal information, and to opt out of certain uses. To make a request, email ${LEGAL_CONTACT_EMAIL}. We will confirm your identity and answer within the time the law allows. If we decline, you may appeal by replying to our answer.`,
    ],
  },
  {
    h: "Children",
    p: ["The Platform is a workplace tool and is not directed at children under 13. Team members under 18 are added by their employer, who is responsible for any consent the law requires."],
  },
  {
    h: "Changes",
    p: ["If we change this policy in a way that matters, we will update the date below and let account holders know in the platform before the change takes effect."],
  },
  {
    h: "Contact",
    p: [`${LEGAL_ENTITY} · ${LEGAL_MAILING_ADDRESS} · ${LEGAL_CONTACT_EMAIL}`],
  },
];

const TERMS: Section[] = [
  {
    h: "The agreement",
    p: [
      `These terms are an agreement between ${LEGAL_ENTITY}, a ${LEGAL_STATE} limited liability company ("BLM", "we", "us"), and the restaurant or restaurant group that holds an account ("Client"), and they also apply to everyone who signs in under that account ("users"). If a signed services agreement between BLM and the Client says something different, the signed agreement wins.`,
    ],
  },
  {
    h: "Accounts and access",
    p: [
      [
        "Keep passwords, PINs and security codes to yourself. You are responsible for what happens under your sign in.",
        "The Client decides who gets access and at what level, and should remove access promptly when someone leaves.",
        "Store PINs are for use at the store only. Private records may only be opened by the owner or general manager for a legitimate business reason.",
      ],
    ],
  },
  {
    h: "Client data",
    p: [
      "Everything the Client and its users put into the platform remains the Client's. The Client grants BLM permission to host, process, back up and display it in order to provide the service and support the Client's program. We handle it as described in the Privacy Policy.",
      "The Client confirms it has the right to enter the information it adds, including team and guest information, and that it has given any notices and obtained any consents the law requires.",
    ],
  },
  {
    h: "Employment decisions stay with the Client",
    p: [
      "Ratings, strikes, write ups, plans and reward standings are tools that apply the standards the Client sets. They do not replace the Client's own judgment, policies or legal advice. The Client is solely responsible for its employment decisions, wage and tip practices, scheduling, breaks and compliance with employment law.",
    ],
  },
  {
    h: "Acceptable use",
    p: [
      [
        "No unlawful, harassing or discriminatory content.",
        "No attempts to get around the privacy controls, reach another client's data, or disrupt the service.",
        "No reselling or copying the platform or its program content without our written permission.",
      ],
    ],
  },
  {
    h: "Fees",
    p: ["Fees, if any, are set out in the Client's proposal or services agreement. Unpaid fees may lead to suspension after notice."],
  },
  {
    h: "Our materials",
    p: [
      "The platform, its design and the BLM program materials (training, checklists, standards and templates) belong to BLM. The Client may use them for its own restaurants while it holds an account. Program content written specifically for the Client from the Client's own materials remains the Client's.",
    ],
  },
  {
    h: "Availability and changes",
    p: [
      "We work to keep the platform available and to restore it quickly when something goes wrong, and we keep encrypted nightly backups. We may improve or change features over time; we will not remove a core feature the Client relies on without reasonable notice.",
    ],
  },
  {
    h: "Disclaimers",
    p: [
      'Apart from what these terms expressly promise, the platform is provided "as is". We do not promise that it will be error free or uninterrupted, or that using it will produce any particular sales or business result.',
    ],
  },
  {
    h: "Limits on liability",
    p: [
      "To the extent the law allows, neither side is liable for indirect, incidental or consequential losses, or lost profits. BLM's total liability under these terms is limited to the fees the Client paid BLM for the platform in the twelve months before the claim.",
    ],
  },
  {
    h: "Ending the account",
    p: [
      "The Client can stop using the platform at any time. Either side may end the account if the other materially breaches these terms and does not fix it within thirty days of notice. When an account ends, the Client may ask for an export of its records within ninety days, after which we delete them as described in the Privacy Policy.",
    ],
  },
  {
    h: "General",
    p: [
      `These terms are governed by the laws of the State of ${LEGAL_STATE}, and disputes belong in the state or federal courts located in ${LEGAL_STATE}. If part of these terms cannot be enforced, the rest still applies. We may update these terms; we will post the new date below and tell account holders before material changes take effect.`,
    ],
  },
  {
    h: "Contact",
    p: [`${LEGAL_ENTITY} · ${LEGAL_MAILING_ADDRESS} · ${LEGAL_CONTACT_EMAIL}`],
  },
];

function LegalPage({ title, sections }: { title: string; sections: Section[] }) {
  return (
    <div className="noir-frame grain on-noir min-h-screen px-3 py-8 md:py-14">
      <div className="mx-auto max-w-[820px]">
        <a href="/" className="mb-6 flex items-center gap-3 text-ivory">
          <Monogram size={34} />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.3em] text-gold">The Platform</span>
        </a>
        <article className="sheet px-5 py-8 md:px-12 md:py-12">
          <div className="relative">
            <div className="eyebrow mb-2">{LEGAL_ENTITY}</div>
            <h1 className="font-display text-[34px] leading-tight text-ink md:text-[44px]">{title}</h1>
            <div className="mt-2 text-[13px] text-ink-soft">Effective {effective}</div>
            <div className="mt-8 space-y-7 border-t rule pt-7">
              {sections.map((s) => (
                <section key={s.h}>
                  <h2 className="mb-2 font-display text-[21px] text-ink">{s.h}</h2>
                  <div className="space-y-3 text-[14.5px] leading-relaxed text-ink">
                    {s.p.map((x, i) =>
                      Array.isArray(x) ? (
                        <ul key={i} className="list-disc space-y-1.5 pl-5">
                          {x.map((li) => (
                            <li key={li}>{li}</li>
                          ))}
                        </ul>
                      ) : (
                        <p key={i}>{x}</p>
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-10 flex gap-5 border-t rule pt-5 text-[13px]">
              <Link href="/privacy" className="font-semibold text-gold-deep hover:underline">
                Privacy Policy
              </Link>
              <Link href="/terms" className="font-semibold text-gold-deep hover:underline">
                Terms of Service
              </Link>
              <a href="/" className="ml-auto font-semibold text-gold-deep hover:underline">
                Back to The Platform
              </a>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

export function PrivacyPolicy() {
  return <LegalPage title="Privacy Policy" sections={PRIVACY} />;
}
export function TermsOfService() {
  return <LegalPage title="Terms of Service" sections={TERMS} />;
}
