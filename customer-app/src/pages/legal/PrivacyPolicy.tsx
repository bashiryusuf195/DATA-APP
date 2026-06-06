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

export function PrivacyPolicyPage() {
  return (
    <div className="space-y-10">

      <div className="space-y-3 pt-4">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-ink">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-400 dark:text-white/40">Effective: {EFFECTIVE_DATE}</p>
        <p className="text-base text-ink-muted leading-relaxed max-w-xl">
          Hive Data ("we", "us", "our") is committed to protecting your personal information.
          This policy explains what we collect, why we collect it, and how we use it.
        </p>
      </div>

      <div className="bg-surface-1 border border-border rounded-2xl p-7 space-y-8">

        <Section title="1. Information we collect">
          <p>We collect the following categories of information when you use Hive Data:</p>
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li><span className="font-medium text-gray-700 dark:text-white/80">Account information</span> — your name, email address, phone number, username and password.</li>
            <li><span className="font-medium text-gray-700 dark:text-white/80">Profile data</span> — date of birth, residential address and gender, collected to enable certain services (such as virtual bank account creation).</li>
            <li><span className="font-medium text-gray-700 dark:text-white/80">Identity data (BVN / NIN)</span> — collected only where required for identity verification or to activate a dedicated virtual account (DVA). BVN and NIN are encrypted at rest and are never displayed in plain text after submission.</li>
            <li><span className="font-medium text-gray-700 dark:text-white/80">Wallet and transaction data</span> — your wallet balance, funding history and all service transactions (airtime, data, electricity, cable TV, exam PINs, identity checks).</li>
            <li><span className="font-medium text-gray-700 dark:text-white/80">Device and usage data</span> — IP address, browser type, and general usage patterns, collected to maintain security and improve the platform.</li>
          </ul>
        </Section>

        <Section title="2. How we use your information">
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li>To create and manage your account.</li>
            <li>To process wallet funding and service purchases.</li>
            <li>To activate and manage your dedicated virtual bank account, where applicable.</li>
            <li>To verify your identity and comply with regulatory Know-Your-Customer (KYC) requirements.</li>
            <li>To detect and prevent fraud, abuse and unauthorised access.</li>
            <li>To communicate important service updates, transaction confirmations and support responses.</li>
            <li>To improve and develop platform features.</li>
          </ul>
        </Section>

        <Section title="3. Sharing of your information">
          <p>
            We do not sell, rent or trade your personal data to third parties for marketing purposes.
          </p>
          <p>We may share your data only in the following limited circumstances:</p>
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li><span className="font-medium text-gray-700 dark:text-white/80">Service providers</span> — for example, telecom operators receive a phone number to deliver airtime or data; electricity DISCOs receive a meter number to issue a token. Only the minimum data required for that transaction is shared.</li>
            <li><span className="font-medium text-gray-700 dark:text-white/80">Payment processors</span> — for wallet funding and virtual account creation, data is shared with our licensed payment partners (such as Paystack or Squad) under their own privacy policies and regulatory obligations.</li>
            <li><span className="font-medium text-gray-700 dark:text-white/80">Legal obligations</span> — we may disclose data if required by a court order, regulatory authority or applicable Nigerian law.</li>
          </ul>
        </Section>

        <Section title="4. Identity data (BVN and NIN)">
          <p>
            Bank Verification Numbers (BVN) and National Identification Numbers (NIN) are collected
            only where strictly necessary:
          </p>
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li>BVN is required to activate a dedicated virtual bank account through our payment partners. It is encrypted before storage and forwarded only to the relevant licensed payment institution.</li>
            <li>NIN is collected for identity verification services and Tier 2 KYC compliance only.</li>
            <li>Neither BVN nor NIN is ever displayed in plain text once submitted, sold to third parties, or used for any purpose other than the above.</li>
          </ul>
        </Section>

        <Section title="5. Data retention">
          <p>
            We retain your account and transaction data for as long as your account is active and
            for a reasonable period thereafter to comply with legal, tax and audit obligations.
            You may request deletion of your account by contacting us at{' '}
            <a href="mailto:customercare@hivedata.ng" className="text-brand-600 dark:text-brand-400 hover:underline">
              customercare@hivedata.ng
            </a>
            . Note that transaction records may be retained beyond account closure where required by law.
          </p>
        </Section>

        <Section title="6. Security">
          <p>
            We use industry-standard security measures including TLS encryption in transit,
            AES-256 encryption for sensitive fields at rest, and transaction PIN verification
            for all service purchases. While we take security seriously, no system is completely
            infallible — please keep your password and transaction PIN confidential.
          </p>
        </Section>

        <Section title="7. Your rights">
          <p>You have the right to:</p>
          <ul className="space-y-2 list-disc list-inside marker:text-brand-500">
            <li>Access the personal data we hold about you.</li>
            <li>Correct inaccurate profile information from within the app or by contacting support.</li>
            <li>Request deletion of your account and associated personal data (subject to legal retention requirements).</li>
          </ul>
          <p>
            To exercise these rights, email{' '}
            <a href="mailto:customercare@hivedata.ng" className="text-brand-600 dark:text-brand-400 hover:underline">
              customercare@hivedata.ng
            </a>.
          </p>
        </Section>

        <Section title="8. Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. When we do, we will update the
            effective date at the top of this page. Continued use of the platform after changes
            are published constitutes acceptance of the updated policy.
          </p>
        </Section>

      </div>
    </div>
  )
}
