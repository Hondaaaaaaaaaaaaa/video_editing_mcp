# Motion vocabulary — how we name caption animations

Written 2026-08-19, to settle terms between the user and the assistant after
"pop out" and "fade out as a sentence" turned out to mean different things to
each of us. **Use these names in briefs, in prop names, and in template
comments.** If a look does not fit, add a row here rather than inventing a word
in one file.

Every animation name is built from three parts:

```
   <UNIT>        <PROPERTY>      <PHASE>
   per-word        fade            in
```

Say all three. "Fade in" alone is ambiguous — a whole sentence fading in and
each word fading in on its own cue look nothing alike.

---

## 1. PHASE — when it happens

| term | meaning |
| --- | --- |
| **in** / **entrance** | the animation that brings text ON screen |
| **out** / **exit** | the animation that takes text OFF screen |

`entrance` and `exit` are the two phases. `in` and `out` are their short forms.
So it is **fade in / fade out**, **pop in / pop out**, **slide in / slide out**.
There is no such thing as "entrance out" — that pairs a phase with a phase.
Where a prop needs one word, use `entrance` and `exit`
(`entranceMs`, `exitMs`, `exitStaggerMs`).

## 2. PROPERTY — what actually changes

The property is the thing being animated. This is where "pop" and "fade" get
confused: they are independent, and a look can use both at once.

| term | property animated | what you see |
| --- | --- | --- |
| **fade** | opacity | text gets more/less transparent. Nothing moves, nothing resizes. |
| **pop** | scale | text grows or shrinks about its own centre. A pop *in* usually starts below 1 and often overshoots past 1 before settling. |
| **slide** | position | text translates — in from the left, up from below, etc. Always say the direction: "slide in from below". |
| **wipe** | a mask edge | a hard or soft edge travels across the text, revealing or hiding it progressively. The glyphs themselves do not move, resize, or change opacity — they are simply covered. |
| **blur** | blur radius | text resolves out of / dissolves into softness. |
| **highlight** | colour | the word changes colour on its cue (karaoke). No opacity or geometry change. |

Combinations are written with `+`: **fade+pop in** = opacity and scale animate
together over the same window.

**The distinction that cost us time:** a *fade* is opacity, a *pop* is scale.
If text vanishes without changing size, it is a fade, never a pop — no matter
how snappy it feels. And a *wipe* is not a fade: under a wipe, a letter is
either covered or not; under a fade, every letter dims at once.

## 3. UNIT — what the animation applies to

| term | meaning |
| --- | --- |
| **per-letter** | each glyph animates on its own clock, usually staggered |
| **per-word** | each word animates as one, all its letters together |
| **per-line** | each line animates as one |
| **per-caption** (or **whole-sentence**) | the entire caption animates as one, every word at the same opacity at every instant |

A unit that repeats needs a **stagger** — the delay between one unit starting
and the next. Zero stagger means they all move together, which is the same as
animating the larger unit.

## 4. Modifiers

| term | meaning |
| --- | --- |
| **duration** | how long one unit takes, in ms |
| **stagger** | delay between consecutive units, in ms |
| **hold** | how long text stays fully on before its exit starts |
| **easing** | the shape of the curve: `linear`, `ease-out`, `ease-in`, `smooth`, `bouncy`. **Linear is a real answer** — several of these references measure linear. |

## 5. Worked examples from this repo

| template | entrance | exit |
| --- | --- | --- |
| Edits (v1) | per-word fade+pop in, 133 ms, ease-out, centre-anchored so the line re-centres as each word lands | none — hard cut |
| Speed | per-word fade in, 133 ms, ease-out (plus a pop set by eye) | hard cut |
| Classic 2 | per-word reveal in place, hard cut by default | — |
| **Edits 2** | **per-word fade in**, ~250 ms, **linear**, no pop, no slide — the caption is laid out for its full text up front so words appear in their final slots and nothing re-centres | **per-caption fade out with a per-word stagger** — the words leave in the order they arrived, but close enough together that it reads as the sentence going as one |

## 6. How to describe a look you want

Say it in this order and it is unambiguous:

> "per-word fade in, 250 ms, linear — then whole-sentence fade out after a 2 s
> hold, with a small per-word stagger, no pop"

If you are describing something you have SEEN and are not sure of the property,
describe the observation instead and let the measurement name it: "the words go
away one after another, starting from the left" is a perfectly good brief. What
the mechanism is called is the assistant's job to determine from the pixels.
