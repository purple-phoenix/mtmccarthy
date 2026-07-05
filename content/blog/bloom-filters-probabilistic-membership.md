---
title: "Bloom Filters: Fast Set Membership in Almost No Space"
date: "2026-07-05"
category: "Algorithms"
excerpt: "A Bloom filter answers \"have I seen this before?\" using a tiny bit array and a handful of hash functions. It can be wrong — but only in one direction. Here's the mechanism, the math, and an interactive filter you can poke at."
read_time: "11"
---

Suppose you're building a web crawler and you want to avoid re-fetching URLs you've already visited. The obvious answer is a hash set: store every URL you've seen, check membership before each fetch. That works until the set grows to hundreds of millions of URLs and no longer fits in memory. Now you're paying for a database round-trip on every single link — just to answer a yes/no question.

Bloom filters exist for exactly this situation. A Bloom filter answers "is this element in the set?" using a fixed, tiny amount of memory — often just a few bits per element — no matter how long the elements themselves are. The catch is that it's a *probabilistic* data structure: it can tell you an element is present when it isn't. What it will *never* do is tell you an element is absent when it's actually present. That one-sided error is the whole trick, and for a huge class of problems it's exactly the trade you want.

## The Problem It Solves

Exact set membership costs you storage proportional to the data you store. If you keep 100 million 60-byte URLs in a hash set, you're spending gigabytes — most of it on the URL strings themselves, plus pointer and bucket overhead. But often you don't actually need to *retrieve* the elements. You only need to answer one question: **have I seen this before?**

A Bloom filter throws away the elements entirely. It keeps no copy of anything you insert. Instead it records a *fingerprint* of each element in a shared bit array. Because it never stores the elements, its size is decoupled from their size — a Bloom filter for 100 million items might be a few hundred megabytes regardless of whether the items are short integers or long URLs.

The price of that compression is precision. Since many elements share the same bits, the filter can be fooled into a false "yes." The beautiful part is that you get to *dial in* exactly how often that happens.

## The Mechanism

A Bloom filter is two things:

1. A **bit array** of `m` bits, all initially `0`.
2. A set of **`k` independent hash functions**, each of which maps any element to one of the `m` positions.

**To insert an element**, run it through all `k` hash functions to get `k` positions, and set the bit at each of those positions to `1`. That's it — no comparison, no storage of the element itself.

```
insert(x):
    for i in 1..k:
        position = hash_i(x) mod m
        bits[position] = 1
```

**To query an element**, run it through the same `k` hash functions and check all `k` positions:

- If **any** of those bits is `0`, the element is *definitely not* in the set. (If you'd ever inserted it, all `k` bits would have been set.)
- If **all** of those bits are `1`, the element is *probably* in the set.

```
query(x):
    for i in 1..k:
        position = hash_i(x) mod m
        if bits[position] == 0:
            return "definitely not present"
    return "possibly present"
```

That asymmetry is the heart of it. A `0` anywhere is proof of absence. All `1`s is merely *suggestive* of presence — because those bits could have been set to `1` by other elements you inserted earlier.

## Why False Positives, but Never False Negatives

Setting a bit is a one-way street: inserts only ever turn bits from `0` to `1`, and there's no plain `delete` that turns them back. So once an element's `k` bits are set, they stay set. A later query for that same element will always find all `k` bits at `1` and correctly report "possibly present." **A genuinely-inserted element can never be reported absent** — hence no false negatives.

A false positive happens when an element you *never* inserted just happens to hash to `k` positions that were all set to `1` by *other* elements. The more crowded the bit array gets, the more likely this collision becomes. When the array is nearly all `1`s, almost every query returns "possibly present" — the filter has become useless, but never *wrong* in the false-negative direction.

## The Space / Accuracy / Hash-Count Trade-off

Three numbers govern a Bloom filter: the bit-array size `m`, the number of inserted elements `n`, and the number of hash functions `k`. They trade off against each other in a way that has a clean closed form.

After inserting `n` elements into `m` bits using `k` hash functions, the probability that any given bit is still `0` is approximately:

```
P(bit is 0) ≈ (1 - 1/m)^(kn) ≈ e^(-kn/m)
```

A false positive requires all `k` of a query's bits to be `1`, so the false-positive probability is approximately:

```
p ≈ (1 - e^(-kn/m))^k
```

Two useful consequences fall out of this:

- **More bits per element means fewer false positives.** Increasing `m` for a fixed `n` shrinks `p`. A common rule of thumb is that roughly 10 bits per element gives about a 1% false-positive rate.
- **There's an optimal `k`.** Too few hash functions and each element leaves too small a fingerprint; too many and you flood the array with `1`s too quickly. Minimizing `p` gives an optimum of `k = (m/n) · ln 2`, at which point roughly half the bits are set. At 10 bits per element that's about 7 hash functions.

Note what's *not* on that list: the size of the elements. Whether you insert 8-byte integers or kilobyte-long strings, the filter's footprint depends only on `m`. That's the property that makes Bloom filters scale.

## Interactive: Build a Bloom Filter

The visualization below is a live Bloom filter with a 32-bit array and 3 hash functions. Insert a few words and watch each one light up 3 bits. Then query words: a match lights its bits green, while a single `0` bit (shown red) is enough to prove absence. Because the array is small, you'll be able to manufacture a **false positive** — a word you never inserted whose 3 bits were all set by other words. The "Find a false positive" button hunts one down for you.

*(Insert several common words first, then try querying words you didn't add — with only 32 bits, collisions come quickly.)*

## Where They're Actually Used

Bloom filters show up anywhere a cheap, memory-resident "probably not" can save an expensive lookup:

- **Databases and storage engines.** LSM-tree stores like Cassandra, RocksDB, and HBase keep a Bloom filter per on-disk table. Before reading a table from disk to look for a key, they check the filter; a "definitely not present" skips the disk read entirely. Since most keys aren't in most tables, this eliminates the vast majority of wasted I/O.
- **Caches and CDNs.** A "one-hit-wonder" filter avoids caching URLs that have only ever been requested once — the filter tracks whether a URL has been seen before, so cache space isn't wasted on content nobody re-requests.
- **Web browsers and security.** Historically, Chrome used a Bloom-filter-style structure for its Safe Browsing malicious-URL list: a local filter gives a fast "definitely safe," and only a "maybe malicious" triggers a network check against the authoritative list.
- **Deduplication.** Crawlers, log pipelines, and analytics systems use them to skip already-seen items (URLs, event IDs) without storing every item exactly.
- **Distributed systems.** They compactly summarize set membership to send across the network — "here's roughly what I have" — so peers can avoid transferring data the other side already holds.

The common thread: a false positive is *cheap* (you do a bit of redundant work — one extra disk read, one extra network check) while the memory savings are *enormous*. When your error is affordable and one-sided, trading a little accuracy for a lot of space is one of the best deals in systems engineering.

## What Bloom Filters Can't Do

The classic Bloom filter has real limitations worth knowing before you reach for one:

- **No deletion.** You can't clear an element's bits, because some of them are probably shared with elements that are still present. (Counting Bloom filters replace each bit with a small counter to support deletes, at the cost of more space.)
- **No enumeration.** The filter can't tell you *what* it contains — it stores fingerprints, not elements.
- **Fixed capacity.** `m` and `k` are chosen up front for a target `n`. Blow past that `n` and your false-positive rate climbs past the design target. (Scalable Bloom filters chain multiple filters to grow gracefully.)

None of these are flaws so much as the shape of the trade. A Bloom filter is what you get when you decide that "have I seen this?" is worth answering approximately, in exchange for answering it in almost no space — and, crucially, never being wrong in the direction that would hurt you.
