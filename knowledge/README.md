# Greenlit Knowledge Base

This directory is the canonical record of Greenlit's customer discovery, market
learning, and strategic decisions. It is designed to preserve source evidence
while allowing conclusions to change as new conversations arrive.

## Start here

- [Current strategy](decisions/2026-07-29-product-framing.md)
- [Regulatory workflow synthesis](insights/regulatory-workflow.md)
- [Hypothesis register](hypotheses/README.md)
- [People index](people/README.md)
- [Conversation index](conversations/README.md)
- [Pilot candidates](opportunities/pilot-candidates.md)

## Knowledge model

| Layer | Purpose | Rule |
| --- | --- | --- |
| `inbox/` | Unprocessed transcripts and notes | Temporary; process promptly |
| `sources/` | Verbatim transcripts and primary evidence | Preserve; private by default |
| `conversations/` | What a specific person said | Preserve evidence and attribution |
| `people/` | Relationship context and follow-ups | Do not turn inference into biography |
| `organizations/` | Relevant company context | Record only what matters to Greenlit |
| `insights/` | Synthesis across multiple sources | Include contradictions and confidence |
| `hypotheses/` | Testable beliefs | Define falsification criteria |
| `decisions/` | Choices made and why | Link the evidence available at the time |
| `opportunities/` | Pilots, introductions, and next actions | Assign a status and next step |
| `templates/` | Standard record formats | Improve the template when repetition appears |

## After every conversation

1. Put the raw transcript or notes in `inbox/` with the date and participant.
2. Create a conversation record using `templates/conversation.md`.
3. Preserve the verbatim source in `sources/` and link it from the record.
4. Update the participant and organization records.
5. Add evidence for or against existing hypotheses.
6. Update relevant insight pages, including contradictions.
7. Record follow-ups in the conversation and opportunity records.
8. Review the changes as a diff before accepting the synthesis.

Suggested instruction to Codex:

> Process the new transcript in `knowledge/inbox/`. Preserve the source, create
> a conversation record, update people and organizations, revise relevant
> hypotheses and insight pages, surface contradictions, and propose the
> highest-information questions for the next interviews. Do not treat a single
> interviewee's opinion as established fact.

## Review rhythm

After roughly every five interviews, produce a synthesis covering:

- what changed in our beliefs;
- strongest and weakest hypotheses;
- contradictory evidence;
- repeated customer language;
- missing stakeholder perspectives;
- product implications supported by evidence; and
- the next highest-information conversations or experiments.

## Evidence and privacy rules

- Label information `public`, `private`, or `background`.
- Keep this repository private.
- Do not publish attributed statements without permission.
- Distinguish direct observations from interpretation.
- Link every material strategic conclusion to its supporting conversations.
- Never commit credentials, personal contact details, or unnecessary sensitive data.
