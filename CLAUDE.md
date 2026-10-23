# Kidraw — notes for Claude Code

This app runs on **Homeroom**. The platform conventions are the single
source of truth for platform-wide behavior (auth model, `USERNODE_ENV`,
public/private tables, "don't `git push`", etc.):

**Platform conventions (authoritative, always current):**
https://app.onhomeroom.com/claude.md

**Inside Homeroom** (its dev chat, and Homeroom bot's builds), do not
fetch that URL: what applies to your change is already in your
instructions, and the `homeroom` MCP server's
`get_platform_conventions` reads any one section of the conventions
when you need it. The two sections below are for working outside
Homeroom; skip them there.

**Anywhere else** (Claude Code run against this repo locally, or another
harness), fetch it at the start of each session. The hosted copy is
updated in place when platform rules change, so fetching it gives you
today's rules, not a stale snapshot.

## Connector permission prompts (outside Homeroom)

This repo ships `.claude/settings.json`, which allows the **read-only**
Homeroom connector calls (`mcp__homeroom__get_*`,
`…__list_*`, `…__whoami`) once you accept the workspace trust dialog.
See `.claude/README.md` for the whole story, including what to do if you
are still being prompted.

## Check that this checkout is current

You may be working in a fork of this app whose `main` is behind the app's
canonical repository, and nothing in the checkout says so: `git fetch origin`
compares the fork with itself. This matters before you **read** code to answer
a question about how the app behaves now, not only before you edit it.

The canonical repository is named in `.claude/homeroom-canonical-repo`. Check against
it, not against `origin`:

```sh
git fetch "$(cat .claude/homeroom-canonical-repo)" main
git merge-base --is-ancestor FETCH_HEAD HEAD && echo current || echo behind
```

`behind` means this checkout does not contain the canonical `main`. To answer
a question, read the canonical code instead (`git show FETCH_HEAD:<path>`,
`git grep <pattern> FETCH_HEAD`). To change code, start from the exact base
commit your Homeroom work order gives, and never merge or rebase onto the
canonical `main` yourself: which commit a change is diffed against decides
what the group votes on. With the Homeroom connector, `get_checkout_status`
answers the same question.

A session-start hook (`.claude/hooks/homeroom-freshness.sh`, see `.claude/README.md`) runs
this check for you and tells you when you are behind. It is silent offline, so
its silence is not proof the checkout is current. Inside Homeroom (its dev
chat, and Homeroom bot's builds) the platform fixes the base commit, and none
of this applies.

## Starter template

The starter's own screen and placeholder note have been replaced by Kidraw's
board (the first version removed the `usernode-starter-notice@1` block and
rewrote `README.md`). The `usernode-dev-console@1` forwarder, the bridge
`<script>` and the design kit stay: they are platform infrastructure, not
template content.

The screen has a light and a dark look and follows the viewer's Homeroom
theme, switching live when they change it: the theme `<script>` right after
the bridge tag sets a `dark` class on `<html>`. Keep that script, and give
everything you build both looks (the design kit's colour tokens carry both), unless one
fixed look is the point of this app, like a game's own scene; then say so
under "## Design" below. Unless a request asks for one, add
no theme picker: the viewer's Homeroom setting is the control. "The
platform's light/dark theme inside the app frame" in the platform
conventions has the details.

If a rule below this line conflicts with the hosted conventions, the
hosted conventions win. This file is **app-specific** — write down
things about *this* app that belong in the repo: product intent,
data-model quirks, style preferences, opt-in policies (e.g. which
tables you've marked private), etc.

---

## About Kidraw

A playful drawing board with crayons and stamps. One screen: a sheet of
paper, seven crayons, a brush plus star and heart stamps, four sizes, undo,
clear and Save picture. A drawing lives only in the open page and leaves as
a PNG saved to the device; **nothing is stored on the server**, and there are
no tables or routes for drawings. Drawing together live and a shared gallery
are deliberately not in this version.

## Your people's data

`usernode-user-data.js` erases a person's rows when they delete their
Homeroom account, and exports them when they ask for a copy. By default it
covers every table with a `user_id` (or `usernode_pubkey`) column. When
you add a table that keys a person's rows another way (`author_id`), add it
to `OWNED_BY`; when a table's `user_id` is not the person the row is
about, add it to `SKIP`. Keep the file and its mount in `server.js`.

## Design

This app's look. The first real version fills in the blanks; every later
change follows it, and updates it when a request changes the look on purpose.

- **Palette:** accent: burnt orange (`--accent`), carrying the selected tool
  and size and the one filled button; neutrals: warm paper creams (`--ground`,
  `--surface`, `--raised`, `--line`); text: warm near-black `--fg` and warm
  grey `--muted`; the sheet `--paper` is white in both looks, with `--ink`
  as the pencil grey of text on it; and the seven
  crayon colours (`--red`, `--orange`, `--yellow`, `--green`, `--blue`,
  `--purple`, `--brown`), the same in both looks like a real box of crayons.
  A saved picture is white paper regardless of the look on screen.
- **Signature element:** the crayon row: seven chunky rounded tips with a
  paper wrapper band, the chosen one standing taller inside a ring. Everything
  else is small line icons and paper-like rounded surfaces.
- **Type scale:** `text-title`, `text-heading`, `text-body`, `text-small`,
  set in a rounded system face (`ui-rounded`), which suits crayons and a
  sheet of paper. The screen uses the 28px name, 16px body and 14px labels
  the drawn screen sets; change sizes in `tailwind.config.js` if ever needed.

The kit is in `styles/tailwind-input.css`: colour tokens with a light and
a dark value (named in `tailwind.config.js`), and a few components
(`page-column`, `btn-primary`, `btn-secondary`, `field`, `list`, `list-row`,
`card`, `section-label`, `skeleton`, `state-empty`, `state-error`).
Re-theme by changing the token values there, keeping every text pair at
4.5:1 or more in both looks.

- Colour comes only from the tokens (`bg-ground`, `bg-surface`,
  `text-fg`, `text-muted`, `border-line`, `bg-accent` with
  `text-on-accent`, ...): never a raw hex value or a stock palette class.
- Tap targets are at least 44 px; the buttons and fields already are.
- A field's label says what it is; its placeholder, if any, is an example
  that says so ("e.g. 5.0"), never a bare value that could pass for one
  already entered.
- Each screen sits in `page-column`, one centred column on a wide window.
- Every screen that loads data has honest loading, empty and error states.
  Never show the empty state while loading or after a failure; an error says
  what failed, what still works, and offers Retry. Loading has the content's
  own shape (its rows, with `skeleton` bars for their text).
- Seed obviously fake staging demo data so the populated screen can be seen
  ("Staging mock data" in the platform conventions).
- No cards in cards, no uppercase eyebrows, no emoji as icons.
- A header that shows the app's own mark shows the project's icon there
  (the emoji in `dapp.json`'s `icon` block) or no mark at all: never an
  empty tile, and never `brand/icon.png`, which the app does not serve.

## App-specific conventions

- A drawing is an array of marks in `public/app.js`: `{type:'stroke', color,
  size, points}` or `{type:'stamp', shape, color, size, x, y}`. Points and
  stamp positions are fractions of the board, never pixels, so a resize or a
  rotation repaints the same drawing. Keep that: the saved picture and the
  screen are painted from the same array.
- Colours painted on the canvas are read from the kit's tokens
  (`getComputedStyle(document.documentElement)`), never written as hex.
  Crayon colours stay the same in both looks by design.
- Clear is an undoable entry (`{type:'clear', before}`), not a delete of the
  marks: Undo after Clear restores the whole drawing. There is no
  confirmation.
- Nothing is stored anywhere: no tables, no local storage, no saved
  preferences. `?demo=1` paints a fixed scene but writes nothing.
