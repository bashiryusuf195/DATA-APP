import type { Knex } from "knex";

const PAGES: Array<{ slug: string; title: string; content: string }> = [
  {
    slug: "about",
    title: "About Hive Data",
    content: `<h2>Who we are</h2>
<p>Hive Data is a Nigerian digital utility payment platform that lets you top up airtime, buy data bundles, pay electricity bills, renew cable TV subscriptions, purchase exam PINs, and verify identity — all in one place.</p>
<h2>Our mission</h2>
<p>We make everyday utility payments fast, affordable, and reliable for every Nigerian, wherever they are.</p>
<h2>Contact</h2>
<p>Email: <a href="mailto:customercare@hivedata.ng">customercare@hivedata.ng</a></p>`,
  },
  {
    slug: "contact",
    title: "Contact Us",
    content: `<h2>Get in touch</h2>
<p>Our support team is available Monday – Friday, 8 am – 6 pm WAT.</p>
<ul>
  <li><strong>Email:</strong> <a href="mailto:customercare@hivedata.ng">customercare@hivedata.ng</a></li>
  <li><strong>Response time:</strong> within 24 hours on business days</li>
</ul>
<h2>Transaction disputes</h2>
<p>To report a failed or disputed transaction, include your transaction reference number in your message.</p>`,
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    content: `<p><em>Effective: June 2025</em></p>
<p>Hive Data ("we", "us", "our") is committed to protecting your personal information. This policy explains what we collect, why we collect it, and how we use it.</p>
<h2>1. Information we collect</h2>
<ul>
  <li><strong>Account information</strong> — your name, email address, phone number, username and password.</li>
  <li><strong>Identity data (BVN / NIN)</strong> — encrypted at rest, used only for KYC and virtual account creation.</li>
  <li><strong>Wallet and transaction data</strong> — your balance, funding history, and all service transactions.</li>
  <li><strong>Device and usage data</strong> — IP address and browser type, used for security and platform improvement.</li>
</ul>
<h2>2. How we use your information</h2>
<p>We use your data to operate your account, process transactions, comply with KYC regulations, detect fraud, and communicate service updates.</p>
<h2>3. Sharing of your information</h2>
<p>We do not sell your data. We share the minimum required information with service providers (telecom operators, electricity DISCOs, payment processors) only to fulfill your transactions.</p>
<h2>4. Your rights</h2>
<p>You have the right to access, correct, or request deletion of your personal data. Email <a href="mailto:customercare@hivedata.ng">customercare@hivedata.ng</a> to exercise these rights.</p>`,
  },
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    content: `<p><em>Effective: June 2025</em></p>
<p>Please read these terms carefully before using Hive Data. By creating an account or using our services, you agree to be bound by these terms.</p>
<h2>1. Eligibility</h2>
<p>You must be at least 18 years old and provide a valid Nigerian phone number and email address. You may hold only one account.</p>
<h2>2. Accuracy of information</h2>
<p>You are solely responsible for the accuracy of all details you enter when making a purchase, including phone numbers, meter numbers, smartcard numbers, and exam details. Successfully delivered services are not refundable due to incorrect details.</p>
<h2>3. Wallet and payments</h2>
<p>Your Hive Data wallet balance can only be used for purchases on this platform. It is not transferable to other users or withdrawable to a bank account.</p>
<h2>4. Prohibited activities</h2>
<p>Using the platform for fraudulent or illegal purposes, exploiting bugs, or submitting false identity documents is strictly prohibited and may result in immediate account suspension.</p>
<h2>5. Limitation of liability</h2>
<p>Hive Data is not liable for loss resulting from incorrect transaction details entered by the user, or for service disruptions caused by third-party providers. Our total liability shall not exceed the value of the transaction in dispute.</p>`,
  },
  {
    slug: "refund-policy",
    title: "Refund Policy",
    content: `<p><em>Effective: June 2025</em></p>
<p>We strive to deliver every service successfully. When something goes wrong, this policy explains when and how you are entitled to a refund.</p>
<h2>Successfully delivered services — not refundable</h2>
<p>If a service has been successfully delivered to the details you provided, the transaction is considered complete and is not eligible for a refund. This applies even if you entered incorrect details.</p>
<h2>Failed transactions — wallet credit</h2>
<p>If a transaction is debited from your wallet but the service is confirmed as undelivered or failed by the service provider, the full amount will be credited back to your Hive Data wallet within 24 hours.</p>
<h2>Disputed transactions — manual review</h2>
<p>In cases where a provider reports success but the service was not received, contact us at <a href="mailto:customercare@hivedata.ng">customercare@hivedata.ng</a> with your transaction reference. We will respond within 2–5 business days.</p>
<h2>Pending transactions</h2>
<p>If a transaction remains pending for more than 30 minutes, contact our support team with the transaction reference number.</p>`,
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex("site_pages")
    .insert(
      PAGES.map((p) => ({
        slug:         p.slug,
        title:        p.title,
        content:      p.content,
        is_published: true,
        version:      1,
        created_by:   null,
        updated_by:   null,
      })),
    )
    .onConflict("slug")
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex("site_pages")
    .whereIn("slug", PAGES.map((p) => p.slug))
    .delete();
}
