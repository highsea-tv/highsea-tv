# highsea.tv — Brand Brief

- **Status:** v1.0. The brand direction is **locked**: Abyss Neutral with the Bone accent, signed off by the owner on 2026-10-16. The specification is in [direction.md](direction.md) and the decision record in [ADR 0013](../adr/0013-brand-direction-abyss-neutral.md).
- **Owner:** Product/design.
- **History:**
  - v0.2 added direction D (Jolly Roger) and the contrast policy.
  - v0.3 recorded the leaning toward a neutral refinement of A.
  - v1.0 locks the direction.

## 1. Positioning

**One line:** *Your own streaming platform, fully yours.*

highsea.tv collapses a home media setup into one product: acquisition, management, downloading, subtitles, requests and streaming. People shouldn't feel they are running a dozen apps. They should feel they own a streaming service.

**What we stand against.** The status quo is powerful but fragmented:
- many web UIs, each with its own visual language;
- configuration spread across apps that have to be wired together by hand;
- clients that look like admin tools.

**What we stand for.** Consumer-grade polish on top of power-user depth:
- the server admin feels like a well-made pro tool;
- the clients feel like the best commercial streaming apps;
- both are unmistakably the same product.

## 2. Audiences

| Audience | Who they are | What they need from the brand |
| --- | --- | --- |
| **Server owner** | Self-hoster or homelab enthusiast; often migrating from Radarr/Sonarr/Plex/Jellyfin | Competence, control, clarity. Dense but calm admin UI; trust that it won't break their library |
| **Household member** | Partner, kids, roommates | Zero learning curve; it should feel like Netflix or Apple TV, never like a server |
| **Friends and family (remote)** | Invited users on other networks | Easy onboarding, a branded "this is *Alex's* server" feeling, reliability |
| **Contributor** | Developers and catalog maintainers | Clear design system and docs; a project that looks serious and well run |

## 3. Personality

| We are | We are not |
| --- | --- |
| Calm | Loud, gamer-RGB |
| Precise | Fussy, over-decorated |
| Cinematic | Corporate, generic SaaS |
| Confident | Smug, edgy |
| Warm | Cutesy |
| Open (AGPL, self-hosted) | Hacker-cliché |

**Nautical, not piratical (decided).** "highsea" already nods to "sailing the high seas", and that stays a private joke in the name. The brand leans into the sea: depth, horizon, light on water, navigation and signals. It uses no piracy imagery or pirate copy. Direction D (Jolly Roger) explored the alternative, and the owner chose the nautical path. The brand must look legitimate in an app store, on a TV home screen and in a press article.

## 4. Brand pillars → design implications

1. **Ownership.** "Your server, your rules."
   - Theming and server branding are first-class.
   - Clients show the *server's* name and identity prominently.
   - highsea is the hull, not the cargo.
2. **Calm power.** Deep capability without noise.
   - Restrained color: one accent at a time.
   - Generous negative space in clients, deliberate density in admin.
   - Motion that explains rather than decorates.
3. **Cinema first.** Content is the hero.
   - Artwork dominates client surfaces, and chrome recedes.
   - Dark by default, tuned for living rooms and OLED.
4. **One system, every screen.**
   - The same tokens, components, motion and sounds from a 6" phone to a 10-foot TV to a dense admin table.

## 5. Competitive look-and-feel audit

| Product | Strengths to learn from | Weaknesses we exploit |
| --- | --- | --- |
| **Plex** | Strong brand recognition; polished hero rows | Ad and upsell clutter; cloud-account dependency; admin and clients feel unrelated |
| **Jellyfin** | Open and free; flexible | Dated and inconsistent UI; many clients with different looks; weak brand |
| **Emby** | Mature feature set | Generic look; paywalled features; little visual identity |
| **Infuse** | Best-in-class client polish and artwork presentation | Client only; no server or management story |
| **Apple TV app** | Typography, focus model, calm motion on TV | Closed ecosystem |
| **Netflix** | Home-screen choreography, profile UX, sound identity ("ta-dum") | Engagement-maximizing patterns we don't want |
| ***arr apps** | Powerful, information-dense | Five visual languages; admin-only aesthetics; no consumer polish |

**The whitespace:** nobody pairs consumer-grade streaming polish with first-class management, under one coherent brand.

## 6. Voice and tone

- **Plain and direct.** "Downloading · 4 min left", not "Your content is currently being acquired."
- **Helpful in errors.** Say what happened, why, and the next step: "Couldn't reach Indexer X. It's been down for 2 hours. We'll keep retrying; you can also disable it."
- **Quietly confident.** No exclamation marks in UI chrome. Celebrate sparingly (first library import, first stream).
- **Respect the owner.** Explain consequences before destructive actions, and never hide advanced options; reveal them progressively.
- **Domain terms where users know them** (indexer, quality profile, seeding), with inline help, never dumbed down for owners. Household-facing clients avoid jargon entirely.

## 7. Identity system scope (Phase 1 deliverables)

- **Layouts.** Each direction proposes its own structure for the TV home, phone home and admin dashboard, not only a skin. Every layout is built from the same tokens and can be combined with any skin.

- Logo mark + wordmark, lockups, clear space, minimum sizes; app icons for every platform.
- Color: dark-first semantic palette, a single accent, status colors, and theming rules.
- Typography: UI family, optional display family, mono family; scales for admin, client and 10-foot use.
- Iconography: Lucide base set plus custom glyphs (media types, indexer, seeding, subtitles sync).
- **Motion identity:** a signature easing/spring family; page, focus and sheet choreography.
- **Sound identity:** a small UI sound family (navigate, select, back, success, error, notification) plus a short signature "arrival" sound for TV app launch.
- Imagery rules: artwork treatment, scrims, blur, placeholder art for items without artwork.

### 7.1 Contrast policy

Moved to [design language › color › contrast policy](../design-language/color.md#contrast-policy).

## 8. Direction review: answers

1. **Accent:** neither cool nor warm-bright. **Bone** is a warm off-white on neutral graphite.
2. **Typography:** neutral throughout. Geist (SemiBold display, −0.035em) and Geist Mono for figures.
3. **Sound defaults:** subtle-on for TV clients, off for admin. Confirmed.
4. **Wordmark:** lowercase `highsea`, with a quiet `.tv` (tertiary color, weight 500) that is part of the lockup.
5. **Theme:** nautical, not piratical.
6. **Layouts:**
   - TV: Hero + rows.
   - Phone: Tabs + carousel.
   - Admin: Sidebar + widgets.
