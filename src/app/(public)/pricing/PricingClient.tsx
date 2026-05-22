"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const plans = [
  {
    id: "SEEDLING" as const,
    anchor: "seedling",
    name: "Seedling",
    price: "$4.99",
    period: "/ month",
    tagline: "Root yourself in wisdom.",
    icon: "🌱",
    color: "var(--color-sage-500)",
    borderClass: "border-[var(--color-sage-200)]",
    badgeClass: "bg-[var(--color-sage-100)] text-[var(--color-sage-700)]",
    ctaClass: "bg-[var(--color-sage-600)] hover:bg-[var(--color-sage-700)] text-white",
    features: [
      "Unlimited access to all premium articles",
      "All 5 niches — Faith, Finance, Psychology, Philosophy, Science & Tech",
      "New posts delivered to your feed as they publish",
      "Support an ad-free, mission-driven publication",
    ],
  },
  {
    id: "DEEP_ROOTS" as const,
    anchor: "deep-roots",
    name: "Deep Roots",
    price: "$9.99",
    period: "/ month",
    tagline: "Go deeper. Live differently.",
    icon: "🌳",
    color: "var(--color-harvest-500)",
    borderClass: "border-[var(--color-harvest-300)] ring-2 ring-[var(--color-harvest-200)]",
    badgeClass: "bg-[var(--color-harvest-100)] text-[var(--color-harvest-700)]",
    ctaClass: "bg-[var(--color-harvest-500)] hover:bg-[var(--color-harvest-600)] text-white",
    featured: true,
    features: [
      "Everything in Seedling",
      "Exclusive Deep Roots posts — published twice a month",
      "AI-powered search — ask anything, surface the exact articles you need",
      "Early access to new features and content",
      "Direct support for future courses and resources",
    ],
  },
];

const freeTier = {
  features: [
    "Access to all free articles",
    "Browse across every niche",
    "No account required to read free content",
  ],
};

export function PricingClient({ trialEligible }: { trialEligible: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function subscribe(planId: "SEEDLING" | "DEEP_ROOTS") {
    setLoading(planId);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planId }),
    });

    if (res.status === 401) {
      router.push(`/register?plan=${planId}`);
      setLoading(null);
      return;
    }

    if (res.status === 403) {
      const data = await res.json();
      router.push(`/verify-email?email=${encodeURIComponent(data.email ?? "")}&plan=${planId}`);
      setLoading(null);
      return;
    }

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error ?? "Something went wrong. Please try again.");
      setLoading(null);
    }
  }

  const ctaLabel = (plan: typeof plans[number]) => {
    if (loading === plan.id) return "Redirecting…";
    return trialEligible ? "Start 7-day free trial" : `Subscribe — ${plan.price}/mo`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
      {/* Header */}
      <div className="text-center mb-14">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-sage-500)] mb-3">
          Membership
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl font-bold text-[var(--foreground)] mb-4">
          Good soil produces good fruit.
        </h1>
        <p className="text-lg text-[var(--text-muted)] max-w-xl mx-auto mb-3">
          Choose the depth that fits your season. Cancel anytime.
        </p>
        {trialEligible && (
          <p className="inline-block text-xs font-semibold uppercase tracking-widest text-[var(--color-harvest-700)] bg-[var(--color-harvest-50)] border border-[var(--color-harvest-200)] rounded-full px-4 py-1.5">
            ✨ 7-day free trial on every plan — no charge until day 8
          </p>
        )}
      </div>

      {/* Paid plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {plans.map((plan) => (
          <div
            id={plan.anchor}
            key={plan.id}
            className={`relative rounded-2xl border bg-[var(--surface)] p-8 ${plan.borderClass} flex flex-col`}
          >
            {plan.featured && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="bg-[var(--color-harvest-500)] text-white text-xs font-semibold uppercase tracking-widest px-4 py-1 rounded-full">
                  Most popular
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{plan.icon}</span>
              <div>
                <span className={`text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${plan.badgeClass}`}>
                  {plan.name}
                </span>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">{plan.tagline}</p>
              </div>
            </div>

            <div className="mb-2">
              <span className="font-serif text-4xl font-bold text-[var(--foreground)]">{plan.price}</span>
              <span className="text-[var(--text-muted)] text-sm ml-1">{plan.period}</span>
            </div>
            {trialEligible ? (
              <p className="text-xs text-[var(--color-sage-700)] font-semibold mb-6">
                🌱 7-day free trial — no charge until day 8
              </p>
            ) : (
              <p className="text-xs text-[var(--text-muted)] mb-6">
                Billed monthly, starting today. Cancel anytime from your account.
              </p>
            )}

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--foreground)]">
                  <span className="text-[var(--color-harvest-500)] mt-0.5 shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => subscribe(plan.id)}
              disabled={!!loading}
              className={`w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 ${plan.ctaClass}`}
            >
              {ctaLabel(plan)}
            </button>
          </div>
        ))}
      </div>

      {/* Free tier */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-6 flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="flex-1">
          <p className="font-semibold text-[var(--foreground)] mb-1">Free — always</p>
          <ul className="space-y-1.5">
            {freeTier.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                <span className="text-[var(--color-sage-400)] mt-0.5 shrink-0">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <Link
          href="/blog"
          className="shrink-0 inline-flex items-center justify-center px-6 py-3 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--color-sage-400)] transition-colors"
        >
          Browse free posts
        </Link>
      </div>

      {/* FAQ / trust */}
      <div className="mt-14 text-center space-y-2 text-sm text-[var(--text-muted)]">
        {trialEligible ? (
          <p>Every paid plan starts with a 7-day free trial. You&apos;re not charged until the trial ends — cancel any time before then at no cost.</p>
        ) : (
          <p>You&apos;ve used your free trial on this email previously. Paid plans bill immediately on subscribe — cancel any time from your account.</p>
        )}
        <p>All plans are billed monthly. Cancel any time from your account.</p>
        <p>
          Questions?{" "}
          <Link href="/contact" className="underline hover:text-[var(--foreground)] transition-colors">
            Get in touch.
          </Link>
        </p>
      </div>
    </div>
  );
}
