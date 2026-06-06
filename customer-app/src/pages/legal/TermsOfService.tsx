const EFFECTIVE_DATE = 'June 2025'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <div className="text-sm text-ink-muted leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  )
}

export function TermsOfServicePage() {
  return (
    <div className="space-y-10">

      <div className="space-y-3 pt-4">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-ink">
          Terms of Service
        </h1>
        <p className="text-sm text-gray-400 dark:text-white/40">Effective: {EFFECTIVE_DATE}</p>
        <p className="text-base text-ink-muted leading-relaxed max-w-xl">
          Please read these terms carefully before using Hive Data. By creating an account or using
          our services, you agree to be bound by these terms.
        </p>
      </div>

      <div className="bg-surface-1 border border-border rounded-2xl p-7 space-y-8">

        <Section title="1. About Hive Data">
          <p>
            Hive Data is a digital utility payment platform that enables users to purchase airtime,
            data bundles, electricity tokens, cable TV subscriptions, exam PINs, and identity
            verification services, and to fund a wallet for these purposes. Use of the platform
            is subject to these Terms of Service and our Privacy Policy.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li>You must be at least 18 years old to create an account.</li>
            <li>You must provide a valid Nigerian phone number and email address.</li>
            <li>You may hold only one account. Creating multiple accounts to circumvent restrictions is prohibited.</li>
            <li>You are responsible for maintaining the confidentiality of your password and transaction PIN.</li>
          </ul>
        </Section>

        <Section title="3. Accuracy of information">
          <p className="font-medium text-gray-700 dark:text-white/80">
            You are solely responsible for the accuracy of all details you enter when making a purchase.
          </p>
          <p>
            This includes, but is not limited to:
          </p>
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li><span className="font-medium text-gray-700 dark:text-white/80">Phone numbers</span> for airtime and data — entering an incorrect number will cause the service to be delivered to the wrong recipient.</li>
            <li><span className="font-medium text-gray-700 dark:text-white/80">Meter numbers</span> for electricity — an incorrect meter number will cause a token to be issued for the wrong meter.</li>
            <li><span className="font-medium text-gray-700 dark:text-white/80">Smartcard/IUC numbers</span> for cable TV — an incorrect number will renew the wrong subscription.</li>
            <li><span className="font-medium text-gray-700 dark:text-white/80">Exam type and registration details</span> for exam PINs — mismatches may cause an invalid PIN to be issued.</li>
          </ul>
          <p className="text-gray-700 dark:text-white/70 font-medium">
            Once a service has been successfully delivered based on the details you provided,
            it cannot be reversed or refunded. Please double-check all entries before confirming
            any transaction.
          </p>
        </Section>

        <Section title="4. Wallet and payments">
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li>Your Hive Data wallet balance can only be used for purchases on this platform. It is not transferable to other users or withdrawable to a bank account.</li>
            <li>Wallet funding is processed through licensed third-party payment providers. Hive Data is not responsible for delays caused by those providers or your bank.</li>
            <li>All transaction amounts are shown in Nigerian Naira (NGN). Prices are subject to change and are confirmed at the point of purchase.</li>
          </ul>
        </Section>

        <Section title="5. Service delivery">
          <p>
            Hive Data facilitates the purchase of services provided by third-party operators
            (telecom networks, electricity distribution companies, cable TV providers, exam bodies).
            We make every effort to deliver services promptly and reliably, but we do not control
            third-party provider systems or uptime.
          </p>
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li>Most transactions are completed within seconds. In some cases, delivery may be delayed by provider issues.</li>
            <li>If a transaction is confirmed as failed by the provider, the amount will be refunded to your wallet. See our Refund Policy for details.</li>
            <li>Hive Data is not liable for service outages, rate changes or policy changes made by third-party providers.</li>
          </ul>
        </Section>

        <Section title="6. Prohibited activities">
          <p>The following activities are strictly prohibited and may result in immediate account suspension or permanent termination:</p>
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li>Using the platform for fraudulent, deceptive or illegal purposes.</li>
            <li>Attempting to exploit bugs, pricing errors or system vulnerabilities.</li>
            <li>Using automated tools, bots or scripts to interact with the platform without authorisation.</li>
            <li>Sharing your account with others or allowing third parties to transact on your behalf in a way that violates these terms.</li>
            <li>Submitting false identity documents or misrepresenting your identity for KYC purposes.</li>
            <li>Funding your wallet with proceeds from fraud or other illegal activity.</li>
          </ul>
        </Section>

        <Section title="7. Account suspension and termination">
          <p>
            Hive Data reserves the right to suspend or permanently terminate your account
            at any time if we have reasonable grounds to believe you have violated these Terms,
            engaged in fraudulent activity, or pose a risk to other users or the platform.
          </p>
          <p>
            In the event of termination due to policy violations, wallet balances may be
            withheld pending investigation. We will notify you by email where legally permitted.
          </p>
        </Section>

        <Section title="8. Limitation of liability">
          <p>
            To the maximum extent permitted by applicable Nigerian law, Hive Data is not liable for:
          </p>
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li>Loss or damage resulting from incorrect transaction details entered by the user.</li>
            <li>Service disruptions caused by third-party providers, telecoms networks or banking infrastructure.</li>
            <li>Indirect or consequential losses arising from use of the platform.</li>
          </ul>
          <p>
            Our total liability for any claim arising from use of Hive Data shall not exceed
            the value of the transaction in dispute.
          </p>
        </Section>

        <Section title="9. Changes to these terms">
          <p>
            We may update these Terms from time to time. The effective date at the top of this
            page will be updated accordingly. Continued use of the platform after changes are
            published constitutes your acceptance of the revised Terms.
          </p>
          <p>
            For questions, contact us at{' '}
            <a href="mailto:customercare@hivedata.ng" className="text-brand-600 dark:text-brand-400 hover:underline">
              customercare@hivedata.ng
            </a>.
          </p>
        </Section>

      </div>
    </div>
  )
}
