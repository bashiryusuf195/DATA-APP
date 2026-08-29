export function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-background text-ink">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <div className="space-y-3 mb-10">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Delete Your Hive Data Account
          </h1>

          <p className="text-sm text-ink-muted">
            Hive Data account and data deletion request
          </p>
        </div>

        <div className="bg-surface-1 border border-border rounded-2xl p-7 space-y-8">

          <section className="space-y-3">
            <h2 className="text-lg font-bold">How to request account deletion</h2>

            <p className="text-sm text-ink-muted leading-relaxed">
              You can request deletion of your Hive Data account and associated
              personal data by contacting our support team.
            </p>

            <p className="text-sm text-ink-muted leading-relaxed">
              Send an email to:
            </p>

            <a
              href="mailto:customercare@hivedata.ng?subject=Account%20Deletion%20Request"
              className="text-brand-600 dark:text-brand-400 font-medium hover:underline"
            >
              customercare@hivedata.ng
            </a>

            <p className="text-sm text-ink-muted leading-relaxed">
              Please include the email address or phone number associated with
              your Hive Data account so that we can identify and verify the
              account before processing the request.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">What will be deleted</h2>

            <ul className="list-disc list-inside space-y-2 text-sm text-ink-muted">
              <li>Your Hive Data account and login credentials.</li>
              <li>Your profile and contact information.</li>
              <li>Other personal information associated with your account, where deletion is legally permitted.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Data that may be retained</h2>

            <p className="text-sm text-ink-muted leading-relaxed">
              Certain information, including transaction records, financial
              records, identity verification records, or other information
              required by applicable laws and regulatory obligations, may be
              retained for the required period even after your account has been
              deleted.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Processing your request</h2>

            <p className="text-sm text-ink-muted leading-relaxed">
              We may need to verify your identity before processing an account
              deletion request. Once verified, we will process the request in
              accordance with our legal and regulatory obligations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Privacy Policy</h2>

            <p className="text-sm text-ink-muted leading-relaxed">
              For more information about how Hive Data collects, uses, stores,
              and protects personal information, please see our{' '}
              <a
                href="/privacy-policy"
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                Privacy Policy
              </a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}