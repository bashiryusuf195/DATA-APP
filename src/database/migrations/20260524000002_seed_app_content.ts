import type { Knex } from 'knex'

const DEFAULT_CONTENT = {
  landing: {
    app_name: 'Hive Data',
    hero_title: 'All Your VTU Services in One Place',
    hero_subtitle:
      'Top up airtime, buy data, pay electricity and cable TV bills instantly. Fast, secure, and always available.',
    hero_cta_primary: 'Get Started Free',
    hero_cta_secondary: 'Login',
    features: [
      { icon: 'Phone',   title: 'Airtime Top-up',    description: 'Instant airtime for MTN, Airtel, Glo and 9mobile at the best rates.' },
      { icon: 'Wifi',    title: 'Data Bundles',       description: 'Affordable data plans for all networks — daily, weekly or monthly.' },
      { icon: 'Zap',     title: 'Electricity Bills',  description: 'Pay EEDC, EKEDC, IKEDC and all DISCOs with a meter token in seconds.' },
      { icon: 'Tv',      title: 'Cable TV',           description: 'Renew DSTV, GOTV and Startimes subscriptions without leaving the app.' },
      { icon: 'Shield',  title: 'Exam PINs',          description: 'Scratch cards for WAEC, NECO, JAMB and other examinations.' },
      { icon: 'Wallet',  title: 'Secure Wallet',      description: 'Fund your wallet once and transact anywhere, anytime, instantly.' },
    ],
    how_it_works: [
      { step: 1, title: 'Create an account', description: 'Sign up in under 2 minutes with just your email address.' },
      { step: 2, title: 'Fund your wallet',  description: 'Transfer to your dedicated bank account or pay with a card.' },
      { step: 3, title: 'Enjoy services',    description: 'Purchase any VTU service instantly at competitive rates.' },
    ],
  },
  support: {
    hero_subtitle: 'Our support team is available Monday – Saturday, 8 am – 8 pm.',
    contacts: [
      { type: 'whatsapp', label: 'WhatsApp', value: 'Chat with us',           href: 'https://wa.me/2348000000000' },
      { type: 'email',    label: 'Email',    value: 'support@hivedata.com', href: 'mailto:support@hivedata.com' },
      { type: 'phone',    label: 'Phone',    value: '0800 000 0000',          href: 'tel:08000000000' },
    ],
    faqs: [
      { q: 'How long does airtime top-up take?',    a: 'Airtime is delivered instantly after a successful transaction.' },
      { q: "My electricity token hasn't arrived?",  a: 'Tokens are sent via SMS and shown in your transaction history. If missing after 5 minutes, contact us.' },
      { q: 'Can I reverse a failed transaction?',   a: 'Failed transactions are auto-reversed to your wallet within 24 hours.' },
      { q: 'How do I fund my wallet?',              a: 'Go to Wallet → Add Money and follow the bank transfer instructions.' },
      { q: 'What is KYC and why do I need it?',     a: 'KYC verification increases your daily transaction limits and unlocks all features.' },
    ],
  },
  onboarding: [
    {
      title: 'All Your VTU Services',
      description:
        'Manage your wallet, track transactions and enjoy reliable VTU services for data, airtime, cable and electricity all in one app.',
      icon: 'Wallet',
      gradient: ['#3535D9', '#6366F1'],
    },
    {
      title: 'Pay Cable & Electricity Bills',
      description:
        'Renew your DSTV, GOTV, Startimes and pay electricity bills in a few taps, with fast and secure payments.',
      icon: 'Zap',
      gradient: ['#7C3AED', '#A78BFA'],
    },
    {
      title: 'Buy Data & Airtime',
      description:
        'Top up your data and airtime instantly on all major networks at the best rates, anytime, anywhere.',
      icon: 'Wifi',
      gradient: ['#059669', '#34D399'],
    },
  ],
}

export async function up(knex: Knex): Promise<void> {
  await knex('admin_settings')
    .insert({
      key:         'app_content',
      value:       JSON.stringify(DEFAULT_CONTENT),
      value_type:  'json',
      label:       'App Content',
      description: 'Landing page, onboarding slides, and support page content',
      category:    'appearance',
      is_secret:   false,
      updated_by:  null,
      updated_at:  knex.fn.now(),
    })
    .onConflict('key')
    .ignore()
}

export async function down(knex: Knex): Promise<void> {
  await knex('admin_settings').where({ key: 'app_content' }).delete()
}
