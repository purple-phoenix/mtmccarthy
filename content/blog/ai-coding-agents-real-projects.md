---
title: "Using AI Coding Agents in Real Projects: What Works and What Doesn't"
date: "2025-11-10"
category: "AI & Machine Learning"
excerpt: "An honest take on Claude Code, Codex, and agent orchestration after using them heavily in production work. Not a sales pitch."
read_time: "7"
image_url: "/static/images/openai-api-feature.png"
---

I've been using AI coding tools heavily — Claude Code, Codex, and a few others — long enough now to have opinions that aren't just vibes. This isn't a comparison post or a tutorial. It's more of a field report from someone who's integrated these tools into real work and had to figure out what they're actually good for.

## The Short Version

AI coding agents are genuinely useful. They're also genuinely capable of wasting your time in ways that feel productive while you're in them. The difference usually comes down to task size and whether you stay in the loop.

## What Works Well

**Boilerplate and scaffolding.** If I need to stand up a new Flask route with standard error handling, wire up a new TypeScript component, or write the initial skeleton of a test file — agents are fast and accurate. This is probably 30-40% of the keyboard work on any codebase, and getting it generated while I think about the actual problem is a real productivity gain.

**Refactoring with clear constraints.** "Rename this function everywhere and update all the call sites" or "convert this class to use dataclasses" — tasks with a clear before-and-after that the model can verify — work well. The agent can diff what changed, you can review it, done.

**Writing tests for code I already understand.** This is underrated. Once I know what the function is supposed to do and what the edge cases are, generating the test file is mechanical. Agents handle mechanical well. I've found that asking for tests *after* I've written the code — rather than TDD-style alongside it — gets better results because the model has the full implementation context.

**First drafts of documentation and commit messages.** I still edit these, but starting from a generated draft is faster than starting from a blank text box.

## What Doesn't Work Well

**Debugging complex system-level issues.** When something subtle is wrong — a race condition, a memory leak, unexpected behavior under load — agents are hit or miss, and the misses waste time. The model will confidently suggest a fix that doesn't address the root cause, you'll try it, it won't work, and now you've spent 20 minutes. For hard debugging I still want to think it through myself, maybe use the agent to explain an unfamiliar API or look something up, but not to drive the investigation.

**Large-scale architecture changes.** Asking an agent to "refactor the auth system to use JWTs" across a 50-file codebase usually ends with something that technically compiles but has subtle issues you'll spend days tracking down. The bigger the surface area, the more careful you have to be. I've had better results breaking these into smaller well-scoped tasks and reviewing each step before moving on.

**Anything where the requirements aren't clear.** Agents are pattern-matching on what you give them. If you're vague, they fill in the gaps with reasonable-sounding guesses. Sometimes those guesses are fine. Sometimes they're not, and you won't notice until later. The quality of what you get out is tightly coupled to the quality of what you put in.

## On Agent Orchestration Specifically

I've experimented with multi-agent setups — using Claude Code as an orchestrator that spins up sub-agents for specific tasks. It works, but the overhead is real. You need clear handoff contracts between agents, you need to think carefully about what state gets passed where, and when something goes wrong it's harder to diagnose than a single-agent failure.

For most of my projects, single-agent workflows with good prompts have been more reliable than multi-agent architectures. The complexity is only worth it at a certain scale or for certain task types.

## The Meta-Point

The most important thing I've learned is that these tools amplify your existing engineering judgment, they don't replace it. If you have a clear mental model of what you're building and why, agents help you build it faster. If you don't have that model, they'll confidently help you build the wrong thing faster.

Stay in the loop. Review the diffs. Understand what's being generated before you run it. The agents that are most useful to me are the ones where I feel like I'm directing a fast, knowledgeable collaborator — not the ones where I hand off a task and come back later hoping it worked.

That's still a pretty good deal. It's just a different deal than the hype suggests.
