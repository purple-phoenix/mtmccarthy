---
title: "Using AI to Actually Compare Health Plans (Not Just Google Them)"
date: "2026-04-06"
category: "AI & Automation"
excerpt: "I gave Claude a one-sentence brief about health insurance and got back a structured analysis that would have taken me a weekend. Here's what the workflow looked like."
read_time: "8"
---

Health insurance is one of those problems that's specifically designed to resist understanding. You've got tiers, deductibles, coinsurance, out-of-pocket maximums, HSA eligibility, network restrictions, state mandates — and the information is spread across a dozen carrier websites, each with its own terminology and PDF maze.

I needed to figure out whether my employer's health plan was actually good, or just conveniently default. So I did what I'd do with any complex research problem: I handed it to Claude and let it work.

## The Setup

My employer offers a high-deductible health plan (HDHP) through United. The basic numbers: around $400/month in premiums for family coverage, a $4,000 family deductible, $8,000 out-of-pocket max, HSA eligible with an employer contribution. Not bad on paper. But "not bad on paper" isn't the same as "best available option."

The question was simple: should I stay on this plan, or would a marketplace plan be better?

## What I Actually Did

I started with a one-line brief: *"Compare my employer health plan against marketplace alternatives."* That's it. No spreadsheet template, no list of carriers to check, no analysis framework.

From there, the workflow broke into three phases — not because I planned it that way, but because that's how the problem naturally decomposed.

### Phase 1: Research

Claude gathered context I hadn't thought to provide. What state we're in (affects which marketplace exchange to use and which mandates apply). Whether specific hospitals needed to be in-network. HSA contribution limits and tax implications. The current status of federal premium subsidies.

This is the part that would have taken me hours of Googling. Not because any single fact is hard to find, but because you need to assemble about 30 facts from different sources before you can even frame the comparison correctly. Claude did this in a few minutes and presented it as a structured document with sources.

### Phase 2: Market Survey

This is where it got genuinely useful. Claude surveyed every carrier available on the state marketplace, checked which ones included our required hospitals in-network (three carriers were immediately eliminated), and mapped out the standardized plan tiers.

Here's something I didn't know: my state mandates standardized cost-sharing within each tier. A Bronze plan from Carrier A has the same deductible and OOP max as a Bronze plan from Carrier B — only premiums differ. That's a huge simplification that I would have discovered eventually, but Claude surfaced it immediately because it understood the regulatory context.

### Phase 3: Scenario Modeling

This was the most valuable part. Instead of just comparing premiums and deductibles, Claude modeled three scenarios:

**Healthy year** — just preventive care and routine visits. The employer plan costs about $6,400 total. The cheapest marketplace alternative: about $11,600.

**Moderate utilization** — add some specialist visits and a procedure. Employer plan: roughly $9,000. Cheapest marketplace: around $14,600.

**Worst case** — hit the out-of-pocket maximum. Employer plan: about $13,000. Best marketplace option: around $22,800.

The employer plan won every scenario by a wide margin. And that's before accounting for the tax advantages — pre-tax premiums, employer HSA contribution, and HSA tax savings add up to about $5,000/year in benefits that marketplace plans simply can't offer.

## The One Exception

Claude didn't just confirm my bias and call it a day. It flagged an edge case I hadn't considered: state-level fertility mandates.

Marketplace plans in my state are required to cover fertility treatments like IVF — no statutory cycle limit. But employer plans that are self-insured are exempt from state mandates under federal law (ERISA). So if my employer's plan is self-insured and excludes fertility coverage, a marketplace plan might be worth the ~$10,000/year premium gap for someone who needs that coverage.

That's the kind of nuance that justifies using a tool like this. I wouldn't have known to ask about ERISA preemption. Claude surfaced it because it understood the regulatory landscape, not just the numbers.

## What Worked About This Approach

**Structure before spreadsheets.** I didn't start with a comparison table and try to fill it in. I started with a question and let the research phase determine what dimensions mattered. Network constraints eliminated half the options before I ever looked at a premium.

**Scenario modeling over snapshot comparisons.** A plan with a $0 deductible and $1,900/month premium looks great until you realize that in a healthy year, you're paying $22,800 for insurance you barely use. The scenario approach makes the tradeoffs concrete.

**Regulatory context.** State mandates, ERISA exemptions, HSA eligibility rules, subsidy thresholds — this stuff materially affects the analysis but lives in a completely different information domain than carrier websites. Having a model that can synthesize across domains is where AI adds the most value over a Google search.

**Tax math.** The pre-tax premium savings alone shift the effective cost of the employer plan by about 30%. Most comparison tools ignore this entirely.

## What Didn't Work

**Exact premium quotes.** Claude estimated marketplace premiums based on published benchmarks and age curves, but the actual quotes can only come from the marketplace website. The estimates were directionally correct and useful for comparison, but I wouldn't make a final decision without verifying the real numbers.

**Provider network verification at the margins.** For the major carriers, Claude could confirm network inclusion for large hospital systems. For smaller carriers or specific individual providers, the only reliable source is the carrier's own provider directory. Claude was upfront about this, which is the right behavior — but it means you still have some manual verification to do.

## The Takeaway

This is one of those tasks where AI doesn't replace your judgment — it replaces the grunt work that prevents you from exercising your judgment. I spent about 20 minutes total on something that would have taken a weekend of comparing PDFs and building spreadsheets. And the output was more structured, more thorough, and caught edge cases I would have missed.

The employer plan was the clear winner. But the point isn't the answer — it's that I actually understood the full landscape before making the decision. That's the difference between defaulting to your employer plan because it's easy, and choosing it because you've seen the alternatives.

Health insurance is just one example. Any decision that involves synthesizing information across multiple domains, applying regulatory or tax rules, and modeling scenarios — that's where this workflow shines. The AI handles the assembly; you handle the judgment.
