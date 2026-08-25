'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Menu,
  X,
  ClipboardCheck,
  Route,
  Zap,
  Activity,
  GraduationCap,
  FlaskConical,
  ClipboardList,
  Shield,
  Check,
  Users,
  Trophy,
  Star,
  BookOpen,
  Mail,
  Lock,
  Eye,
  EyeOff,
  MessageSquare,
  Briefcase,
  Camera,
  Video,
  ChevronRight,
  ArrowRight,
  Sparkles
} from 'lucide-react';

import NeuralNetworkBg from '../../components/landing/neural-network-bg';

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

const NAV_LINKS = [
  { href: '#home', label: 'Home' },
  { href: '#product', label: 'Product' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#about', label: 'About' },
  { href: '#testimonials', label: 'Testimonials' }
] as const;

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: 'Diagnostic Assessment',
    description: 'A quick adaptive calibration quiz pinpoints each learner\'s starting level across every topic — no guessing, no wasted time.',
    color: 'bg-sys-blue/10 text-sys-blue'
  },
  {
    icon: Route,
    title: 'Personalised Learning Path',
    description: 'The AI builds a prerequisite-aware roadmap unique to you, sequencing concepts so each lesson builds naturally on the last.',
    color: 'bg-sys-green/10 text-sys-green'
  },
  {
    icon: Zap,
    title: 'Real-Time AI Tutoring',
    description: 'Socratic questioning, worked examples, and instant feedback — all streamed live and tailored to the learner\'s current understanding.',
    color: 'bg-sys-orange/10 text-sys-orange'
  },
  {
    icon: Activity,
    title: 'Progress Analytics',
    description: 'Mastery scores, spaced-repetition scheduling, and decay tracking give learners and educators a clear view of real knowledge retention.',
    color: 'bg-sys-purple/10 text-sys-purple'
  }
];

const COMPARISON = [
  { traditional: 'One-size-fits-all pace', adaptive: 'Learns at your speed, every concept' },
  { traditional: 'Generic textbook content', adaptive: 'AI-generated lessons from official syllabi' },
  { traditional: 'Delayed feedback (days)', adaptive: 'Instant, personalised feedback' },
  { traditional: 'No retention tracking', adaptive: 'Spaced repetition with Ebbinghaus decay' },
  { traditional: 'Passive reading / watching', adaptive: 'Active Socratic inquiry & practice' }
];

const PRICING_PLANS = [
  {
    name: 'Free',
    price: { monthly: 0, annual: 0 },
    description: 'Get started with core adaptive learning',
    cta: 'Start Free',
    featured: false,
    features: [
      '1 subject',
      '5 lessons per week',
      'Basic diagnostics',
      'Progress tracking',
      'Community support'
    ]
  },
  {
    name: 'Pro',
    price: { monthly: 12, annual: 9 },
    description: 'Full access for serious learners',
    cta: 'Start Free Trial',
    featured: true,
    badge: 'Most Popular',
    features: [
      'Unlimited subjects',
      'Unlimited lessons',
      'Advanced diagnostics',
      'Syllabus-aligned content',
      'Spaced repetition engine',
      'Detailed analytics',
      'Priority support'
    ]
  },
  {
    name: 'Team',
    price: { monthly: 29, annual: 24 },
    description: 'For schools and tutoring centres',
    cta: 'Contact Sales',
    featured: false,
    features: [
      'Everything in Pro',
      'Up to 30 learners',
      'Educator dashboard',
      'Cohort analytics',
      'Topic locking',
      'SSO integration',
      'Dedicated account manager'
    ]
  }
];

const TESTIMONIALS = [
  {
    name: 'Sarah Chen',
    role: 'GCSE Student',
    avatar: 'SC',
    quote: 'My maths grade went from a 4 to a 7 in just two terms. The AI figured out exactly where my gaps were and filled them one by one.',
    metric: 'Grade 4 → 7',
    color: 'bg-sys-blue'
  },
  {
    name: 'James Okonkwo',
    role: 'Parent',
    avatar: 'JO',
    quote: 'My daughter actually wants to study now. The lessons feel like a conversation, not a textbook. Best investment in her education we\'ve made.',
    metric: '3x more study time',
    color: 'bg-sys-green'
  },
  {
    name: 'Dr. Emily Hart',
    role: 'Head of Maths, Westfield Academy',
    avatar: 'EH',
    quote: 'We piloted LearnOS with 120 Year 10 students. The adaptive path meant every learner was challenged at exactly the right level.',
    metric: '92% engagement rate',
    color: 'bg-sys-purple'
  },
  {
    name: 'Aisha Patel',
    role: 'A-Level Student',
    avatar: 'AP',
    quote: 'The Socratic coaching is brilliant — it doesn\'t just give you the answer, it makes you think. My confidence in physics has completely transformed.',
    metric: 'A* in Physics',
    color: 'bg-sys-orange'
  },
  {
    name: 'Mark Thompson',
    role: 'Tutor, Kumon',
    avatar: 'MT',
    quote: 'I use LearnOS alongside my sessions. The diagnostics save me hours of assessment time and the personalised roadmaps are spot-on.',
    metric: '60% less prep time',
    color: 'bg-sys-teal'
  },
  {
    name: 'Priya Sharma',
    role: 'GCSE Student',
    avatar: 'PS',
    quote: 'I used to dread revision. LearnOS makes it feel like a game — I can see my mastery scores go up after every session.',
    metric: '85% avg. mastery',
    color: 'bg-sys-indigo'
  }
];

const STATS = [
  { value: '50K+', label: 'Learners', icon: Users },
  { value: '95%', label: 'Completion rate', icon: Trophy },
  { value: '4.9', label: 'App rating', icon: Star },
  { value: '2M+', label: 'Lessons delivered', icon: BookOpen }
];

const VALUES = [
  { title: 'Learner-First', description: 'Every design decision starts with one question: does this help the learner understand better?', icon: GraduationCap },
  { title: 'Evidence-Based', description: 'Our engine is built on spaced repetition, the testing effect, and cognitive load theory — not hunches.', icon: FlaskConical },
  { title: 'Syllabus-Accurate', description: 'Content is grounded in official DfE syllabi. Lessons stay within specification, every time.', icon: ClipboardList },
  { title: 'Privacy by Design', description: 'Parental consent gates, PII scrubbing, and encryption mean learner data is always protected.', icon: Shield }
];

/* -------------------------------------------------------------------------- */
/*  Landing Page                                                              */
/* -------------------------------------------------------------------------- */

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null);
  const [annualBilling, setAnnualBilling] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      const sections = ['home', 'product', 'pricing', 'about', 'testimonials'];
      for (const id of [...sections].reverse()) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) {
          setActiveSection(id);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const locked = mobileMenuOpen || authModal !== null;
    document.body.style.overflow = locked ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen, authModal]);

  return (
    <div className="min-h-screen bg-window">
      {/* ------------------------------------------------------------------ */}
      {/*  Navigation                                                         */}
      {/* ------------------------------------------------------------------ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'material-chrome border-b border-separator shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 focus-halo rounded-control">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sys-blue text-[13px] font-bold text-white">
              L
            </div>
            <span className="text-headline font-semibold tracking-tight">LearnOS</span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`focus-halo rounded-control px-3 py-1.5 text-callout font-medium transition-colors ${
                  activeSection === link.href.slice(1)
                    ? 'text-sys-blue'
                    : 'text-secondary-label hover:text-label'
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={() => setAuthModal('signin')}
              className="focus-halo rounded-control px-3 py-1.5 text-callout font-medium text-secondary-label hover:text-label transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthModal('signup')}
              className="focus-halo rounded-control bg-sys-blue px-4 py-2 text-callout font-medium text-white hover:opacity-90 transition-opacity"
            >
              Get Started
            </button>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="focus-halo rounded-control p-2 text-label md:hidden"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="fixed inset-0 top-16 z-40 bg-window/95 backdrop-blur-sm md:hidden">
            <div className="flex flex-col gap-1 p-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="focus-halo rounded-control px-4 py-3 text-headline font-medium text-label hover:bg-gray5 transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <hr className="my-2 border-separator" />
              <button
                onClick={() => { setMobileMenuOpen(false); setAuthModal('signin'); }}
                className="focus-halo rounded-control px-4 py-3 text-headline font-medium text-label hover:bg-gray5 text-left transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); setAuthModal('signup'); }}
                className="focus-halo rounded-control bg-sys-blue px-4 py-3 text-headline font-medium text-white hover:opacity-90 transition-opacity"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/*  Hero                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section id="home" className="relative isolate overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
        <NeuralNetworkBg />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sys-blue/20 bg-sys-blue/5 px-3 py-1 text-caption-1 font-medium text-sys-blue">
              <Sparkles className="h-3.5 w-3.5" />
              Now supporting GCSE syllabi from the DfE
            </div>

            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-label">
              Learning that adapts{' '}
              <span className="bg-gradient-to-r from-sys-blue to-sys-indigo bg-clip-text text-transparent">
                to you
              </span>
            </h1>

            <p className="mt-5 text-[clamp(1rem,2.5vw,1.25rem)] leading-relaxed text-secondary-label max-w-2xl mx-auto">
              An AI tutor that calibrates to your level, builds a personalised path through the syllabus, and adjusts every lesson in real time — so you learn faster and remember longer.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setAuthModal('signup')}
                className="focus-halo rounded-[14px] bg-sys-blue px-7 py-3.5 text-headline font-semibold text-white hover:opacity-90 transition-all hover:shadow-lg hover:shadow-sys-blue/20 inline-flex items-center gap-2"
              >
                Start Learning Free
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#product"
                className="focus-halo rounded-[14px] border border-separator bg-text-background px-7 py-3.5 text-headline font-semibold text-label hover:bg-gray5 transition-colors inline-flex items-center gap-2"
              >
                See How It Works
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Dashboard mockup */}
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="rounded-card overflow-hidden border border-separator bg-text-background shadow-xl shadow-black/5">
              <div className="flex items-center gap-2 border-b border-separator bg-gray6/50 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-sys-red/80" />
                <div className="h-3 w-3 rounded-full bg-sys-yellow/80" />
                <div className="h-3 w-3 rounded-full bg-sys-green/80" />
                <div className="ml-4 h-2.5 w-32 rounded-full bg-gray5" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3">
                <div className="hidden border-r border-separator bg-gray6/30 p-4 sm:block">
                  <div className="mb-3 h-2 w-16 rounded bg-gray4" />
                  {['Today', 'Plan', 'Review', 'Badges'].map((item, i) => (
                    <div key={item} className={`mb-2 flex items-center gap-2 rounded-lg px-3 py-2 ${i === 0 ? 'bg-sys-blue/10' : ''}`}>
                      <div className={`h-2 w-2 rounded-full ${i === 0 ? 'bg-sys-blue' : 'bg-gray4'}`} />
                      <div className={`h-2 rounded ${i === 0 ? 'w-14 bg-sys-blue/40' : 'w-12 bg-gray4'}`} />
                    </div>
                  ))}
                </div>
                <div className="col-span-2 p-6">
                  <div className="mb-4 h-3 w-48 rounded bg-label/10" />
                  <div className="mb-2 h-2 w-full rounded bg-label/5" />
                  <div className="mb-2 h-2 w-4/5 rounded bg-label/5" />
                  <div className="mb-6 h-2 w-3/5 rounded bg-label/5" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-separator bg-gray6/30 p-4">
                      <div className="mb-2 h-2 w-20 rounded bg-sys-blue/30" />
                      <div className="h-2 w-12 rounded bg-sys-blue/10" />
                    </div>
                    <div className="rounded-xl border border-separator bg-gray6/30 p-4">
                      <div className="mb-2 h-2 w-20 rounded bg-sys-green/30" />
                      <div className="h-2 w-12 rounded bg-sys-green/10" />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <div className="h-8 w-24 rounded-lg bg-sys-blue/20" />
                    <div className="h-8 w-24 rounded-lg bg-gray5" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mx-auto mt-12 flex max-w-2xl flex-wrap items-center justify-center gap-8 sm:gap-12">
            {STATS.map((stat) => (
              <div key={stat.label} className="flex items-center gap-2 text-center">
                <stat.icon className="h-5 w-5 text-sys-blue" />
                <div>
                  <p className="text-title-1 font-bold text-label">{stat.value}</p>
                  <p className="text-caption-1 text-tertiary-label">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Product                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section id="product" className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-caption-1 font-semibold uppercase tracking-wider text-sys-blue">How it works</p>
            <h2 className="mt-2 text-[clamp(1.5rem,4vw,2.5rem)] font-bold tracking-tight text-label">
              Four steps to personalised mastery
            </h2>
            <p className="mt-3 text-body text-secondary-label">
              Our adaptive engine combines diagnostic assessment, curriculum-aligned content, and real-time AI tutoring into a seamless learning experience.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group rounded-card border border-separator bg-text-background p-6 transition-all hover:shadow-lg hover:shadow-black/5 hover:-translate-y-1"
                >
                  <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="mb-2 text-caption-1 font-medium text-tertiary-label">Step {i + 1}</div>
                  <h3 className="text-headline font-semibold text-label">{feature.title}</h3>
                  <p className="mt-2 text-callout leading-relaxed text-secondary-label">{feature.description}</p>
                </div>
              );
            })}
          </div>

          <div className="mx-auto mt-20 max-w-3xl">
            <h3 className="mb-8 text-center text-title-2 font-bold text-label">
              Why adaptive beats traditional
            </h3>
            <div className="overflow-hidden rounded-card border border-separator bg-text-background">
              <div className="grid grid-cols-2 border-b border-separator bg-gray6/30">
                <div className="px-5 py-3 text-footnote font-semibold uppercase tracking-wider text-tertiary-label">Traditional</div>
                <div className="px-5 py-3 text-footnote font-semibold uppercase tracking-wider text-sys-blue">Adaptive with LearnOS</div>
              </div>
              {COMPARISON.map((row, i) => (
                <div key={i} className={`grid grid-cols-2 ${i < COMPARISON.length - 1 ? 'border-b border-separator' : ''}`}>
                  <div className="flex items-center gap-3 px-5 py-3.5 text-callout text-secondary-label">
                    <X className="h-4 w-4 shrink-0 text-tertiary-label" />
                    {row.traditional}
                  </div>
                  <div className="flex items-center gap-3 px-5 py-3.5 text-callout font-medium text-label">
                    <Check className="h-4 w-4 shrink-0 text-sys-green" />
                    {row.adaptive}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Pricing                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section id="pricing" className="py-20 sm:py-28 bg-gray6/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-caption-1 font-semibold uppercase tracking-wider text-sys-blue">Pricing</p>
            <h2 className="mt-2 text-[clamp(1.5rem,4vw,2.5rem)] font-bold tracking-tight text-label">
              Simple, transparent pricing
            </h2>
            <p className="mt-3 text-body text-secondary-label">
              Start free. Upgrade when you need more. No hidden fees.
            </p>
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            <span className={`text-callout font-medium ${!annualBilling ? 'text-label' : 'text-tertiary-label'}`}>Monthly</span>
            <button
              onClick={() => setAnnualBilling(!annualBilling)}
              className={`focus-halo relative h-7 w-12 rounded-full transition-colors ${annualBilling ? 'bg-sys-blue' : 'bg-gray4'}`}
              aria-label="Toggle annual billing"
            >
              <div
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${annualBilling ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
            <span className={`text-callout font-medium ${annualBilling ? 'text-label' : 'text-tertiary-label'}`}>
              Annual
            </span>
            {annualBilling && (
              <span className="rounded-full bg-sys-green/10 px-2 py-0.5 text-caption-2 font-semibold text-sys-green">
                Save 25%
              </span>
            )}
          </div>

          <div className="mx-auto mt-10 grid max-w-4xl gap-5 lg:grid-cols-3">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-card border bg-text-background p-6 transition-all ${
                  plan.featured
                    ? 'border-sys-blue shadow-lg shadow-sys-blue/10 scale-[1.02] lg:scale-105 z-10'
                    : 'border-separator hover:shadow-md'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-sys-blue px-3 py-0.5 text-caption-2 font-semibold text-white">
                    {plan.badge}
                  </div>
                )}

                <h3 className="text-headline font-semibold text-label">{plan.name}</h3>
                <p className="mt-1 text-caption-1 text-secondary-label">{plan.description}</p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[2rem] font-bold tracking-tight text-label">
                    £{annualBilling ? plan.price.annual : plan.price.monthly}
                  </span>
                  {plan.price.monthly > 0 && (
                    <span className="text-callout text-tertiary-label">/month</span>
                  )}
                </div>
                {annualBilling && plan.price.annual > 0 && (
                  <p className="text-caption-2 text-tertiary-label">
                    Billed £{plan.price.annual * 12}/year
                  </p>
                )}

                <button
                  onClick={() => setAuthModal('signup')}
                  className={`focus-halo mt-6 rounded-[12px] py-3 text-callout font-semibold transition-all ${
                    plan.featured
                      ? 'bg-sys-blue text-white hover:opacity-90'
                      : 'border border-separator bg-text-background text-label hover:bg-gray5'
                  }`}
                >
                  {plan.cta}
                </button>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-callout text-secondary-label">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-sys-green" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  About                                                              */}
      {/* ------------------------------------------------------------------ */}
      <section id="about" className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-caption-1 font-semibold uppercase tracking-wider text-sys-blue">About LearnOS</p>
              <h2 className="mt-2 text-[clamp(1.5rem,4vw,2.5rem)] font-bold tracking-tight text-label">
                Every learner deserves a tutor that{' '}
                <span className="text-sys-blue">understands them</span>
              </h2>
              <p className="mt-4 text-body leading-relaxed text-secondary-label">
                LearnOS was built on a simple belief: no two learners are the same, so why should their lessons be?
                Our AI tutor calibrates to each student&apos;s ability in real time, draws from official GCSE and A-Level syllabi,
                and uses proven learning science — spaced repetition, Socratic inquiry, and adaptive difficulty — to deliver
                results that traditional methods can&apos;t match.
              </p>
              <p className="mt-4 text-body leading-relaxed text-secondary-label">
                We&apos;re a team of educators, engineers, and learning scientists building the future of personalised education.
                Our platform is already helping thousands of students across the UK achieve their potential.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {VALUES.map((v) => {
                const Icon = v.icon;
                return (
                  <div key={v.title} className="rounded-card border border-separator bg-text-background p-5 transition-all hover:shadow-md">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sys-blue/10 text-sys-blue">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-headline font-semibold text-label">{v.title}</h3>
                    <p className="mt-1.5 text-caption-1 leading-relaxed text-secondary-label">{v.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Testimonials                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section id="testimonials" className="py-20 sm:py-28 bg-gray6/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-caption-1 font-semibold uppercase tracking-wider text-sys-blue">Testimonials</p>
            <h2 className="mt-2 text-[clamp(1.5rem,4vw,2.5rem)] font-bold tracking-tight text-label">
              Trusted by learners and educators
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="flex flex-col rounded-card border border-separator bg-text-background p-6 transition-all hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${t.color} text-[13px] font-bold text-white`}>
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-callout font-semibold text-label">{t.name}</p>
                    <p className="text-caption-1 text-tertiary-label">{t.role}</p>
                  </div>
                </div>

                <blockquote className="mt-4 flex-1 text-callout leading-relaxed text-secondary-label">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>

                <div className="mt-4 flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="h-3.5 w-3.5 fill-sys-yellow text-sys-yellow" />
                    ))}
                  </div>
                  <span className="rounded-full bg-sys-green/10 px-2 py-0.5 text-caption-2 font-semibold text-sys-green">
                    {t.metric}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  CTA band                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
          <div className="rounded-[24px] bg-gradient-to-br from-sys-blue to-sys-indigo p-10 sm:p-14">
            <h2 className="text-[clamp(1.5rem,4vw,2.25rem)] font-bold text-white">
              Ready to learn smarter?
            </h2>
            <p className="mt-3 text-body text-white/70 max-w-xl mx-auto">
              Join 50,000+ learners already using LearnOS to reach their potential. Start for free — no credit card required.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setAuthModal('signup')}
                className="focus-halo rounded-[14px] bg-white px-7 py-3.5 text-headline font-semibold text-sys-blue hover:bg-white/90 transition-colors inline-flex items-center gap-2"
              >
                Start Learning Free
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#product"
                className="focus-halo rounded-[14px] border border-white/30 px-7 py-3.5 text-headline font-semibold text-white hover:bg-white/10 transition-colors inline-flex items-center gap-2"
              >
                Explore Features
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Footer                                                             */}
      {/* ------------------------------------------------------------------ */}
      <footer className="border-t border-separator bg-gray6/30 py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sys-blue text-[13px] font-bold text-white">L</div>
                <span className="text-headline font-semibold">LearnOS</span>
              </div>
              <p className="mt-3 max-w-xs text-callout leading-relaxed text-secondary-label">
                The adaptive AI tutor that personalises every lesson to the learner.
              </p>
              <div className="mt-4 flex gap-3">
                {[
                  { icon: MessageSquare, label: 'Twitter' },
                  { icon: Briefcase, label: 'LinkedIn' },
                  { icon: Camera, label: 'Instagram' },
                  { icon: Video, label: 'YouTube' }
                ].map((s) => (
                  <a
                    key={s.label}
                    href="#"
                    className="focus-halo flex h-8 w-8 items-center justify-center rounded-full bg-gray5 text-secondary-label hover:bg-gray4 transition-colors"
                    aria-label={s.label}
                  >
                    <s.icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-footnote font-semibold uppercase tracking-wider text-tertiary-label">Product</h4>
              <ul className="mt-3 space-y-2">
                {['Features', 'Pricing', 'For Schools', 'Syllabus Library', 'API'].map((l) => (
                  <li key={l}>
                    <a href="#" className="text-callout text-secondary-label hover:text-label transition-colors">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-footnote font-semibold uppercase tracking-wider text-tertiary-label">Company</h4>
              <ul className="mt-3 space-y-2">
                {['About', 'Careers', 'Blog', 'Contact', 'Press'].map((l) => (
                  <li key={l}>
                    <a href="#" className="text-callout text-secondary-label hover:text-label transition-colors">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-footnote font-semibold uppercase tracking-wider text-tertiary-label">Legal</h4>
              <ul className="mt-3 space-y-2">
                {['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Accessibility'].map((l) => (
                  <li key={l}>
                    <a href="#" className="text-callout text-secondary-label hover:text-label transition-colors">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-separator pt-6 sm:flex-row">
            <p className="text-caption-1 text-tertiary-label">
              &copy; {new Date().getFullYear()} LearnOS. All rights reserved.
            </p>
            <p className="text-caption-1 text-tertiary-label">
              Built with AI, grounded in learning science.
            </p>
          </div>
        </div>
      </footer>

      {/* ------------------------------------------------------------------ */}
      {/*  Auth Modal                                                         */}
      {/* ------------------------------------------------------------------ */}
      {authModal && <AuthModal type={authModal} onClose={() => setAuthModal(null)} onSwitch={(t) => setAuthModal(t)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Auth Modal                                                                */
/* -------------------------------------------------------------------------- */

function AuthModal({
  type,
  onClose,
  onSwitch
}: {
  type: 'signin' | 'signup';
  onClose: () => void;
  onSwitch: (t: 'signin' | 'signup') => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const isSignIn = type === 'signin';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={isSignIn ? 'Sign in' : 'Sign up'}
    >
      <div
        ref={modalRef}
        className="w-full max-w-sm rounded-[20px] border border-separator bg-text-background p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <button
          onClick={onClose}
          className="focus-halo absolute right-4 top-4 rounded-full p-1.5 text-tertiary-label hover:text-label hover:bg-gray5 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sys-blue text-sm font-bold text-white">
            L
          </div>
          <h2 className="text-title-2 font-bold text-label">
            {isSignIn ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 text-caption-1 text-secondary-label">
            {isSignIn ? 'Sign in to continue learning' : 'Start your learning journey today'}
          </p>
        </div>

        <button className="focus-halo flex w-full items-center justify-center gap-3 rounded-[12px] border border-separator bg-text-background px-4 py-2.5 text-callout font-medium text-label hover:bg-gray5 transition-colors">
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="var(--google-blue)" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="var(--google-green)" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="var(--google-yellow)" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="var(--google-red)" />
          </svg>
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-separator" />
          <span className="text-caption-2 text-tertiary-label">or</span>
          <div className="h-px flex-1 bg-separator" />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-3">
          <div>
            <label className="text-caption-1 font-medium text-secondary-label">Email</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary-label" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-[12px] border border-separator bg-text-background pl-10 pr-3.5 py-2.5 text-callout text-label placeholder:text-tertiary-label focus:border-sys-blue focus:outline-none focus:ring-2 focus:ring-sys-blue/20 transition-colors"
                required
              />
            </div>
          </div>
          <div>
            <label className="text-caption-1 font-medium text-secondary-label">Password</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary-label" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-[12px] border border-separator bg-text-background pl-10 pr-10 py-2.5 text-callout text-label placeholder:text-tertiary-label focus:border-sys-blue focus:outline-none focus:ring-2 focus:ring-sys-blue/20 transition-colors"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary-label hover:text-secondary-label transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {isSignIn && (
            <div className="text-right">
              <a href="#" className="text-caption-1 font-medium text-sys-blue hover:underline">
                Forgot password?
              </a>
            </div>
          )}

          <button
            type="submit"
            className="focus-halo w-full rounded-[12px] bg-sys-blue py-3 text-callout font-semibold text-white hover:opacity-90 transition-opacity"
          >
            {isSignIn ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="mt-5 text-center text-caption-1 text-secondary-label">
          {isSignIn ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => onSwitch(isSignIn ? 'signup' : 'signin')}
            className="font-medium text-sys-blue hover:underline"
          >
            {isSignIn ? 'Sign up free' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
