import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Norr.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 pt-6 pb-16">
      <Link
        href="/"
        className="text-faint hover:text-text mb-6 inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft size={18} /> Back
      </Link>
      <h1 className="text-2xl font-bold">Terms of Service</h1>
      <p className="text-faint mt-1 text-sm">Last updated: June 19, 2026</p>

      <div className="text-muted mt-6 flex flex-col gap-5 text-[15px] leading-relaxed">
        <p>
          Norr is an 18+ platform for paid, premium content. By creating an
          account or using the service you confirm that you are at least 18 years
          old and agree to these terms.
        </p>
        <section>
          <h2 className="text-text mb-1 text-base font-semibold">
            Accounts &amp; eligibility
          </h2>
          <p>
            You are responsible for activity on your account and for keeping your
            credentials secure. Accounts found to belong to minors will be
            removed.
          </p>
        </section>
        <section>
          <h2 className="text-text mb-1 text-base font-semibold">
            Payments &amp; unlocks
          </h2>
          <p>
            Purchases unlock access to specific content. Charges are drawn from
            your in-app balance and are generally non-refundable except where
            required by law.
          </p>
        </section>
        <section>
          <h2 className="text-text mb-1 text-base font-semibold">
            Acceptable use
          </h2>
          <p>
            Do not upload content you do not own the rights to, content depicting
            minors, or content that is illegal in your jurisdiction.
          </p>
        </section>
        <p className="text-faint text-[13px]">
          This is a placeholder summary and is not legal advice. Replace it with
          your reviewed Terms of Service before launch.
        </p>
      </div>
    </main>
  );
}
