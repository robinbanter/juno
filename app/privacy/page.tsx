import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Norr collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 pt-6 pb-16">
      <Link
        href="/"
        className="text-faint hover:text-text mb-6 inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft size={18} /> Back
      </Link>
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="text-faint mt-1 text-sm">Last updated: June 19, 2026</p>

      <div className="text-muted mt-6 flex flex-col gap-5 text-[15px] leading-relaxed">
        <p>
          This policy explains what we collect, why, and the choices you have.
          We collect only what we need to run Norr.
        </p>
        <section>
          <h2 className="text-text mb-1 text-base font-semibold">
            What we collect
          </h2>
          <p>
            Account details (email, authentication identifiers), content you
            upload, and payment/transaction records needed to process unlocks.
          </p>
        </section>
        <section>
          <h2 className="text-text mb-1 text-base font-semibold">
            How we use it
          </h2>
          <p>
            To authenticate you, deliver and gate content, process payments, and
            keep the platform safe. We do not sell your personal data.
          </p>
        </section>
        <section>
          <h2 className="text-text mb-1 text-base font-semibold">
            Payments are on a public blockchain
          </h2>
          <p>
            Your balance is real USDC in an Algorand wallet, and every deposit,
            unlock, tip and withdrawal is a transaction on a public ledger.
            Anyone can read it, it is permanent, and{" "}
            <strong>we cannot delete or alter it</strong> — not on request, not
            by court order, not ever. Your wallet address is pseudonymous, but
            anything you or others link to it is linkable forever. Please treat
            on-chain activity as public and irreversible.
          </p>
        </section>
        <section>
          <h2 className="text-text mb-1 text-base font-semibold">
            We hold your wallet keys
          </h2>
          <p>
            Your wallet is custodial: its private key is generated for you and
            stored encrypted by us. That means you do not need a seed phrase, and
            it also means you are trusting us with the funds in it. You can move
            your balance out at any time from{" "}
            <Link href="/withdraw" className="text-primary">
              Withdraw
            </Link>
            .
          </p>
        </section>
        <section>
          <h2 className="text-text mb-1 text-base font-semibold">Your rights</h2>
          <p>
            You can delete your account and its data at any time. Three honest
            limits: withdraw your balance first, because deleting destroys the
            only copy of your wallet key and any funds left behind are
            unrecoverable by anyone including us; on-chain transactions cannot be
            deleted, as above; and records we are legally required to keep — such
            as age and consent records under 18 U.S.C. §2257, and moderation
            records concerning reported content — outlive the account they
            relate to.
          </p>
        </section>
        <section>
          <h2 className="text-text mb-1 text-base font-semibold">
            Reporting and moderation
          </h2>
          <p>
            Anyone can report content without an account. Reports are reviewed by
            a person, and what you submit is retained as part of that record. See{" "}
            <Link href="/legal/compliance" className="text-primary">
              Compliance
            </Link>{" "}
            for our DMCA agent and records custodian.
          </p>
        </section>
        <p className="text-faint text-[13px]">
          This summary describes what the software actually does — it is not legal
          advice and it is not a substitute for a Privacy Policy reviewed by a
          lawyer for your jurisdiction. Have one before you take real users.
        </p>
      </div>
    </main>
  );
}
