import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Compliance — DMCA & §2257",
  description: "Designated agent and records custodian notices.",
};

export const dynamic = "force-dynamic";

/**
 * The two notices a US adult platform is expected to publish: a DMCA designated
 * agent, and a §2257 custodian of records.
 *
 * Driven entirely by env, because inventing these would be worse than omitting
 * them — a DMCA agent must be a real person or entity registered with the
 * Copyright Office, and a §2257 custodian is a named individual at a physical
 * address. Unset means the page says so plainly rather than printing a
 * convincing-looking lie; `mainnet:preflight` blocks on it.
 */
function agent() {
  return {
    name: process.env.DMCA_AGENT_NAME?.trim(),
    email: process.env.DMCA_AGENT_EMAIL?.trim(),
    address: process.env.DMCA_AGENT_ADDRESS?.trim(),
  };
}

function custodian() {
  return {
    name: process.env.RECORDS_CUSTODIAN_NAME?.trim(),
    address: process.env.RECORDS_CUSTODIAN_ADDRESS?.trim(),
  };
}

function NotConfigured({ what }: { what: string }) {
  return (
    <p className="mt-3 rounded-md border border-danger/35 bg-danger/10 px-4 py-3 text-[14px] leading-[1.6]">
      <strong>Not configured.</strong> This deployment has not published {what}. It
      must be set before the site accepts user-uploaded content.
    </p>
  );
}

export default function CompliancePage() {
  const dmca = agent();
  const rec = custodian();

  return (
    <main className="bg-bg text-text min-h-dvh">
      <div className="mx-auto w-full max-w-2xl px-[18px] py-12">
        <h1 className="text-[28px] font-bold">Compliance</h1>
        <p className="text-muted mt-2 text-[15px] leading-[1.7]">
          Notices required of a platform hosting user-uploaded adult content.
        </p>

        {/* ── DMCA ── */}
        <section className="mt-10">
          <h2 className="text-[20px] font-bold">DMCA — designated agent</h2>
          <p className="text-muted mt-2 text-[14.5px] leading-[1.7]">
            If you believe content here infringes your copyright, send a notice to
            our designated agent under 17 U.S.C. §512(c). Include: your signature,
            identification of the work, the URL of the material, your contact
            details, a statement of good-faith belief, and a statement under
            penalty of perjury that you are authorised to act.
          </p>

          {dmca.name && dmca.email ? (
            <div className="bg-surface-2 border-hairline mt-4 rounded-md border px-4 py-4 text-[14.5px] leading-[1.8]">
              <div>
                <span className="text-faint">Agent:</span> {dmca.name}
              </div>
              <div>
                <span className="text-faint">Email:</span>{" "}
                <a href={`mailto:${dmca.email}`} className="text-primary">
                  {dmca.email}
                </a>
              </div>
              {dmca.address && (
                <div className="whitespace-pre-line">
                  <span className="text-faint">Address:</span> {dmca.address}
                </div>
              )}
            </div>
          ) : (
            <NotConfigured what="a DMCA designated agent" />
          )}

          <p className="text-faint mt-3 text-[13px] leading-[1.7]">
            You can also report infringing content from any post — choose
            &ldquo;copyright&rdquo;. That reaches our moderation queue, but a formal
            §512(c) notice must go to the agent above.
          </p>
        </section>

        {/* ── 2257 ── */}
        <section className="mt-10">
          <h2 className="text-[20px] font-bold">18 U.S.C. §2257 — records</h2>
          <p className="text-muted mt-2 text-[14.5px] leading-[1.7]">
            All models, performers and persons appearing in visual depictions on
            this site were at least 18 years old at the time of creation. Records
            required by 18 U.S.C. §2257 and 28 C.F.R. 75 are kept by the custodian
            below.
          </p>

          {rec.name ? (
            <div className="bg-surface-2 border-hairline mt-4 rounded-md border px-4 py-4 text-[14.5px] leading-[1.8]">
              <div>
                <span className="text-faint">Custodian of records:</span> {rec.name}
              </div>
              {rec.address && (
                <div className="whitespace-pre-line">
                  <span className="text-faint">Address:</span> {rec.address}
                </div>
              )}
            </div>
          ) : (
            <NotConfigured what="a §2257 custodian of records" />
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-[20px] font-bold">Reporting</h2>
          <p className="text-muted mt-2 text-[14.5px] leading-[1.7]">
            Report any content that is non-consensual, involves a minor, or
            otherwise violates our{" "}
            <Link href="/terms" className="text-primary">
              Terms
            </Link>
            . Reports do not require an account and are reviewed by a human.
            Content involving minors is removed and escalated immediately.
          </p>
        </section>

        <p className="text-faint mt-12 text-[13px] leading-[1.7]">
          This page states where notices go. It is not legal advice, and publishing
          it does not by itself make a deployment compliant — see{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
