# Marketing audit: paid banks versus an ad-supported, ad-free model, 2026-10-27

Scope: whether Syntactical should drop the per-bank purchases (Medium and Hard banks at $4.99 each) in favour of free content for everyone, with ads for free users and one ad-free purchase. This is the marketing and unit-economics read, written before any plan. The engineering scope of the change is a separate document.

Checked against `main` at `6f12b7c`. Revised the same day after the owner chose annual plus lifetime Pro pricing over the first draft's one-time purchase; the earlier shape is kept under "Alternatives considered". External figures carry their source in the "Sources" section; where a number is my own calculation or a planning assumption, the text says so.

## Verdict

**Yes to the half that matters, with conditions on the other half.**

1. **Making every bank free is the right call, and it is close to a no-regret move.** Today two thirds of the product is invisible to a free user, nothing is purchasable (no RevenueCat keys, no store products, no DNS), and the catalogue has grown to 24 paid SKUs at $4.99 each with no bundle. "Every bank is free" is a launch headline; "Easy is free, the rest is $4.99 per bank" is a reason to leave.
2. **Ads will not be meaningful revenue at any scale Syntactical can reach in the next year.** On mobile, a US user who plays eight rounds a month is worth roughly $0.06 to $0.20 a month in ads (my calculation, assumptions below). On the web, developer ad blocking (about 72% in the two surveys that measure it) and the SPA on GitHub Pages make web ads close to zero. Ads earn their place only as the thing that gives the ad-free purchase a reason to exist.
3. **The revenue line is the ad-free tier, not the ads.** A Pro year at $19.99, or a lifetime at $39.99, nets more than the ads from the same user would return in many years. Treat the ad as a light, between-rounds nudge toward Pro, not as the business. Pro is sold as annual or lifetime, never monthly (the owner's choice on 2026-10-27; see "Alternatives considered").
4. **Keep the privacy posture.** Run non-personalised ads only, mobile only, no App Tracking Transparency prompt, no ads on the web. That keeps the "no tracking, no advertising identifier" story that the privacy policy, labels, and review notes are built on, at the cost of lower eCPMs that were small anyway.

If the owner wants a one-line version: free all content, sell Pro as an annual or a lifetime purchase, show one non-personalised interstitial between rounds on mobile, nothing on the web, and measure before adding anything else.

## What exists today

| Fact                                                                                                                                                             | Where                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 12 tracks, 36 banks: 12 free Easy banks (1,196 questions) and 24 paid Medium and Hard banks in the private `syntactical-content` repo                            | `content/manifest.json`, `content/*/easy.json`                                                          |
| One non-consumable per paid bank at the $4.99 tier; the whole catalogue costs about $120                                                                         | `docs/store/in-app-purchases.md` (still lists the first six of the 24)                                  |
| Purchases run through RevenueCat on iOS and Android and Web Billing on the web; the API grants entitlements from the RevenueCat webhook                          | `clients/purchaseStoreClient.ts`, `clients/webBillingClient/`, `server/src/routes/revenueCatWebhook.ts` |
| Nothing is sold yet: no RevenueCat keys, products, or webhook secret; the API hostnames do not resolve; sign-in email is stubbed; the stores have no app records | `docs/launch-placeholders.md`, `docs/session-handoff/session-handoff.md`                                |
| No usage data: PostHog is not configured, so every analytics call is a no-op                                                                                     | `docs/feature-list/features.md`, "Analytics"                                                            |
| "Ask about this card" is gated on any entitlement; the weekly study note needs only sign-in. Both call Claude Haiku                                              | `server/src/routes/ask.ts`, `server/src/routes/studyNote.ts`                                            |
| The privacy posture is explicit: no ads, no advertising identifier, no tracking, no ATT prompt                                                                   | `docs/store/privacy-labels.md`, `app/privacy.tsx`, `docs/store/app-review-notes.md`                     |
| Brand: "Linear/Vercel meets covert dark-mode ops", mobile-first, keyboard-driven lightning rounds                                                                | `docs/original-prompt.md`                                                                               |

Two consequences of this state shape the audit. First, there are zero paying customers to migrate, so the switching cost on the customer side is nil; the sunk engineering is sunk either way. Second, there is no data, so every number below is an assumption to be replaced by measurement, and the audit ends with what to measure.

## The marketing case for the switch

**The paid-bank model hides the product.** A new user sees ten to twelve Easy banks and 24 locked tiles. The locked tiles cannot be previewed, the paywall copy is "Unlock Medium", and the price is per bank. The strongest content (Hard banks on runtime semantics, the security tracks) is exactly what a developer would share or screenshot, and it is behind the gate. Free content is the acquisition channel for an app with no marketing budget; gating two thirds of it starves the channel.

**24 SKUs is a pricing problem on its own.** Each bank is a separate purchase decision, a separate App Store Connect and Play Console product, and a separate RevenueCat package. There is no bundle, no "all tracks", and no price anchor. A user who likes Python Medium has to decide again for Python Hard, then again for TypeScript. The per-bank model also fights the product's own roadmap: every new track adds two more products to configure and two more purchase decisions.

**"Pay to remove ads" is a message developers already understand.** It asks for one decision, it does not withhold content, and it reads as fair. It is also one product to configure instead of 24, which removes most of the store-setup work in `docs/store/in-app-purchases.md`.

**The free-everything headline works on every channel at once.** The listing subtitle, the Hacker News post, the README, and a tweet all get the same line: twelve tracks, 3,600 questions, all free. The current listing draft cannot say that and spends its "What you get" section explaining which banks cost money.

## The case against, and what it costs

**Developers block ads.** The Stack Overflow 2018 survey put regular ad-blocker use among developers at 72%, and a 2024 Ghostery survey of US adults put programmers at the same 72%. That is the web figure; in-app mobile ads are not blocked by browser extensions, though DNS-level blockers catch some. Plan on web ad revenue being a rounding error and on mobile ad revenue being reduced by some share of users who block at the network level.

**Ad eCPMs are small and the audience is small.** Vendor benchmarks for US iOS put rewarded video at $10 to $30, interstitials at $3 to $15, and banners at $0.50 to $2.50 per thousand impressions, with Android lower and non-US traffic lower again. Developer-focused web networks (EthicalAds, Carbon) pay $2.25 to $2.75 per thousand pageviews and want 50,000 monthly pageviews before they take a site. At the scale a side project reaches in its first year, these multiply out to tens or low hundreds of dollars a month. The unit-economics section below shows the arithmetic.

**Ads strain the brand.** The aesthetic brief was tactical, dark, no cartoonish anything. A mediated banner from a casual-game advertiser under a question about Postgres isolation levels is the opposite of that. A non-personalised interstitial between rounds is tolerable; a banner on the question card is not, and an ad during a keyboard-driven round breaks the "high velocity" promise the product is built on. Placement discipline is the mitigation, and it costs revenue.

**Ads change the privacy story that the store copy rests on.** Adding an ad SDK means an "Advertising Data" row in the privacy labels, a consent flow for EEA users (Google's User Messaging Platform or an equivalent), SKAdNetwork entries on iOS, and, if personalised ads are on, the ATT prompt and "Used for tracking: Yes". The current labels, policy, and review notes all say the opposite. Non-personalised ads avoid ATT and the tracking label, at lower eCPM.

**Web ads are not practical at launch anyway.** The web app is a client-rendered SPA on GitHub Pages. AdSense review has become strict about JavaScript-rendered sites with little crawlable text, and the developer-friendly networks have traffic floors the site does not meet. Nothing in the product today produces the indexable text pages those networks look at.

**Free content becomes scrapable.** The paid banks live in a private repo partly for protection. Once they are free they will be downloaded. This matters less than it looks: the questions come from a model-assisted pipeline that can regenerate them, and the defensible part of the product is the pipeline, the oracle validation, the review scheduling, and the UX, not any one bank.

## Unit economics

All of this is my calculation from the vendor figures in "Sources" and from planning assumptions I chose. Replace every assumption with a measured value as soon as PostHog is live.

### Assumptions

| Assumption                                   | Value                                                            | Why                                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rounds per active mobile user per month      | 8                                                                | Two short sessions a week; a planning guess                                                                                                                                              |
| Interstitials shown                          | 1 per completed round, never mid-round                           | Placement rule from the brand section                                                                                                                                                    |
| Banner impressions per active user per month | 40                                                               | Menu and results screens only                                                                                                                                                            |
| US iOS interstitial eCPM, non-personalised   | $3 to $10                                                        | Vendor ranges, discounted for non-personalised                                                                                                                                           |
| US iOS banner eCPM                           | $0.50 to $2                                                      | Vendor ranges                                                                                                                                                                            |
| Web pageviews per active web user per month  | 40                                                               | Planning guess                                                                                                                                                                           |
| Developer web network CPM                    | $2.50                                                            | EthicalAds published estimate                                                                                                                                                            |
| Web ad-block share                           | 72%                                                              | Stack Overflow 2018, Ghostery 2024                                                                                                                                                       |
| Pro prices and net                           | $19.99 a year (about $17 net) or $39.99 lifetime (about $34 net) | Apple Small Business Program and Play's 15% tier; lifetime at about two annuals, the usual ratio                                                                                         |
| Lifetime spread over                         | 24 months                                                        | A planning convention so the two Pro products compare per month                                                                                                                          |
| Mix of Pro buyers                            | 60% annual, 40% lifetime                                         | Planning guess; developers skew toward lifetime where it is offered                                                                                                                      |
| Pro conversion among monthly active users    | 1% to 3%                                                         | Duolingo runs about 8% paid out of monthly actives at scale with a decade of brand; a new app should plan well below that, and a $19.99 entry price sits toward the low end of the range |

### Per active user per month

| Source                                             | Low    | High   |
| -------------------------------------------------- | ------ | ------ |
| Mobile interstitials (8 at $3 to $10 CPM)          | $0.024 | $0.080 |
| Mobile banners (40 at $0.50 to $2 CPM)             | $0.020 | $0.080 |
| Mobile ads, US iOS total                           | $0.04  | $0.16  |
| Web ads before ad blocking (40 pageviews at $2.50) | $0.10  | $0.10  |
| Web ads after 72% blocking                         | $0.03  | $0.03  |
| Pro annual, net, per month of a paid year          | $1.42  | $1.42  |
| Pro lifetime, net, spread over 24 months           | $1.42  | $1.42  |

Android and non-US traffic sit below the mobile row by roughly two to five times.

### At plausible scales

| Monthly active users (mobile, US-weighted) | Ads per month    | Pro at 2% conversion, net at purchase, per month of new users |
| ------------------------------------------ | ---------------- | ------------------------------------------------------------- |
| 1,000                                      | $40 to $160      | $480                                                          |
| 10,000                                     | $400 to $1,600   | $4,800                                                        |
| 50,000                                     | $2,000 to $8,000 | $24,000                                                       |

The Pro column uses the blended net of about $24 per buyer (60% at $17, 40% at $34) and counts new buyers each month. Annual subscribers who renew add a second year the table does not show; a renewal rate is the first number to measure once there is one. Pro outearns ads by an order of magnitude at every row. The conclusion holds across any reasonable choice of the assumptions: the ad-free tier is the revenue, ads are the nudge.

### The hidden cost that turns out to be small

"Ask about this card" calls Claude Haiku 5.5, listed at $0.10 per million input tokens and $0.50 per million output tokens. A user who hits the current cap of 20 asks a day, at roughly 1,500 input and 300 output tokens per ask, costs about $0.006 a day, or under $0.20 a month, and almost nobody hits the cap. The weekly study note is one short call a week. Neither needs to stay behind a purchase for cost reasons. They can stay behind Pro for conversion reasons, which is a different and better argument: "remove ads" alone converts weakly when the ads are light, so Pro needs a second benefit.

## Audience and channel reality

**Mobile is where ads can run.** AdMob through `react-native-google-mobile-ads` is the realistic option in an Expo app; it needs a development build rather than Expo Go, which the project already does through EAS, and the config plugin has had version-compatibility issues with recent Expo SDKs that will need checking at implementation time. It needs the UMP consent flow, SKAdNetwork identifiers, and label updates.

**The web is the funnel, not the ad inventory.** Keep the web free of third-party ads. Use the slot a free mobile user would see for a house card ("Syntactical Pro removes ads on mobile and raises the Ask limit") or nothing. Revisit a developer network only if the site passes 50,000 monthly pageviews and gains crawlable text pages, both of which are far off and neither of which the ad decision should wait on.

**Developers reward restraint and punish the opposite in public.** This audience writes the reviews, the Hacker News comments, and the "why I uninstalled" posts. One interstitial between rounds, non-personalised, skippable after a few seconds, with a clear path to remove it, is defensible. Anything heavier risks the rating and the word of mouth that is the only acquisition channel.

## Brand and privacy implications

| Today                                                                                     | Under the new model                                                                                                         |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| "The app has no ads and no third-party advertising or tracking" in the privacy labels doc | "Non-personalised ads on iOS and Android for free users; no advertising identifier is used for tracking; no ads on the web" |
| ATT prompt not shown, not needed                                                          | Still not shown if ads are non-personalised only                                                                            |
| Privacy label: no Advertising Data, no Device ID                                          | Advertising Data collected (not linked, not for tracking); confirm the Device ID row against AdMob's current disclosure     |
| EEA: no consent flow                                                                      | UMP consent before the first ad request in the EEA and UK, with a "Privacy settings" entry in Settings                      |
| Listing: "Easy banks are free. Medium and Hard banks are one-time purchases"              | "Every bank is free. Pro removes ads and raises the Ask limit"                                                              |
| Review notes: how to reach the per-bank purchase                                          | How to reach the Pro purchase and where the ad appears                                                                      |

The privacy policy draft in `app/privacy.tsx` gains one vendor (Google AdMob) and one data category, and loses nothing else if personalised ads stay off.

## Comparables

- **Duolingo** is the pattern: free with ads, a subscription that removes ads and adds perks. Advertising was about 8% of revenue in early 2025 (my calculation from reported quarterly figures), the 10-K notes ads carry lower margins than subscriptions, and paid subscribers were about 10 million against a monthly active base in the low hundreds of millions. Even the best-run ad-plus-subscription learning app earns its money from the subscription.
- **Mimo, Sololearn, Enki, Brilliant** all run freemium with a subscription; Sololearn has shown ads to free users. None gates content per module the way Syntactical does today.
- **Stack Overflow, daily.dev, documentation sites on Carbon or EthicalAds** show that developer ads work when they are relevant and unobtrusive, and that the economics only make sense at very large pageview counts.

## Recommended shape

1. **All 36 banks free.** Serve them the same way the free banks are served now (static host with hash verification), which also removes the private-repo deploy coupling and the `PAID_CONTENT_DIR` machinery.
2. **Pro as two products: an annual subscription at about $19.99 and a lifetime non-consumable at about $39.99, no monthly.** Both remove ads, raise the Ask daily limit, and are the home for future perks, including any expansion packs. Annual gives the recurring revenue that funds new tracks; lifetime keeps the subscription-averse developer, and pricing it at about two annuals is the usual ratio. The lifetime product reuses the non-consumable path already written; the annual needs the server to grant on `INITIAL_PURCHASE` and `RENEWAL` and revoke on `EXPIRATION`, which `server/src/constants/revenueCatEvents.ts` does not list today (it grants only on `NON_RENEWING_PURCHASE`). When an annual lapses the user returns to the free tier with ads; say so plainly on the paywall.
3. **Ads: one non-personalised interstitial after a completed round, mobile only.** Never mid-round, never on the question card, never on the web. Frequency-cap it (for example, not more than one per three rounds, and none in the first session) so the first impression of the app is the product, not the ad.
4. **Ask free for everyone at a lower daily cap, Pro at the current cap.** Costs cents, converts better than "remove ads" alone, and lets guests see the feature. Keep the study note sign-in-only as it is.
5. **Web: no third-party ads.** A house Pro card in the slot, or nothing.
6. **Privacy posture: unchanged in spirit.** No ATT, no personalised ads, UMP consent in the EEA and UK, labels and policy updated to match.

What I would not do: run AdMob on the web through a web view, run rewarded video to unlock content (it recreates the gate the switch removes), sell a monthly plan, or put a banner on the question card.

## Alternatives considered

Three shapes were weighed against the recommendation above. The owner chose annual plus lifetime on 2026-10-27.

**Keep the paid Medium and Hard banks, add ads to the free tier, and sell further banks as expansion packs.** Rejected. A free user would get the degraded experience (ads) and the withheld product (two thirds of the banks) at once, which compounds the discoverability problem the switch exists to fix, and a developer audience reads "ads plus paid unlocks" in one app as greedy. Expansion packs are sound only when they are additive and distinct, a new track or a themed bundle rather than the Hard tier of a track the user already started, and only once the free base is complete. If packs come later, sell them as whole-track bundles, include them in Pro, and keep every difficulty of every core track free.

**Pro as a monthly subscription.** Rejected. At $2.99 a month (about $2.54 net) a subscriber passes a $9.99 one-time purchase at roughly three and a half months of retention, and quiz usage is bursty, so that retention is unproven. The stronger objection is the audience: developers are the most subscription-averse segment for small tools, "pay monthly to remove ads" is the version they mock, and ads reappearing on lapse each month feels punitive. Some monthly revenue would come from people who forget to cancel, which this audience notices and reviews. Annual keeps the recurring revenue without the monthly optics.

**Pro as a single one-time purchase at $9.99 to $14.99.** This was the first draft's recommendation and remains defensible: it fits the brand, reuses the non-consumable code, and is the simplest store setup. It was set aside because it caps lifetime value at one payment while content, hosting, and the Ask model are ongoing costs, and because adding an annual tier later with lifetime buyers grandfathered is easy, whereas moving from a subscription back to one-time is not. The lifetime product in the chosen shape preserves this option for the buyer.

## Decision gates and what to measure

Ads are the reversible part of this decision and the part that depends on scale. The sequence that de-risks it:

1. **Before anything else, turn on PostHog** (the key is the only missing piece) so the next decisions have data. Add two events: `ad_shown` and `pro_purchased`, and keep `round_completed` as the denominator.
2. **Ship free-all-content and Pro first, ads second.** The free-content change and the two Pro products are good under either outcome. Adding the ad SDK is a separate PR that can wait for the first four to eight weeks of data.
3. **Gates for turning ads on:** at least 1,000 monthly active mobile users, a median of 4 or more completed rounds per active user per month, and the UMP, label, and policy updates done. Below that, ads cost more in brand and review risk than they return.
4. **Gates for revisiting web ads:** 50,000 monthly pageviews and crawlable text pages. Not expected within the horizon of this plan.
5. **Watch for:** rating drops in the two weeks after ads ship, `ad_shown` to `round_started` ratio (a user who stops after the first ad is the signal to loosen the frequency cap), Pro conversion from the ad-free prompt versus from the Ask limit prompt, the annual-to-lifetime split among buyers, and, from month 13, the annual renewal rate.

## Sources

- Stack Overflow 2018 developer survey on ad-blocker use (72% of developers), via [Marketing Tech News](https://www.marketingtechnews.net/news/2018/mar/13/developers-use-adblockers-and-dont-engage-online-ads/) and [B2B Marketing](https://www.b2bmarketing.net/archive/majority-of-tech-developers-using-ad-blockers-b2b-marketing/).
- Ghostery 2024 survey (programmers 72%), via [The Register forums](https://forums.theregister.com/forum/all/2024/03/27/america_ad_blocker/).
- General ad-blocking rates: [eMarketer FAQ on ad blocking](https://www.emarketer.com/content/faq-on-ad-blocking-preparing-platform-crackdowns-user-response-what-s-changing-2026), [Factually summary](https://factually.co/fact-checks/technology/how-many-people-use-ad-blockers-538802).
- EthicalAds publisher rates and 50k pageview floor: [publisher guide](https://www.ethicalads.io/publisher-guide/), [revenue calculator](https://www.ethicalads.io/publishers/calculator/).
- Carbon Ads developer-audience pricing: [carbonads.net/more-info](https://carbonads.net/more-info).
- Mobile eCPM ranges: [MonetizeMore](https://www.monetizemore.com/blog/how-much-ad-revenue-can-apps-generate/), [MWM eCPM glossary](https://mwm.ai/glossary/ecpm), [Appodeal Q4 2024 eCPM report](https://appodeal.com/the-mobile-ecpm-report-updated-q4-2024-view).
- Duolingo FY2025 10-K (revenue, "Other" revenue including advertising, ad margin note): [SEC filing](https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm); Q1 2025 results (paid subscribers): [press release](https://www.webull.com/news/12745507198313472).
- AdMob consent and ATT mechanics: [Google AdMob IDFA guide](https://developers.google.com/admob/ios/privacy/idfa), [Secure Privacy iOS consent guide](https://secureprivacy.ai/blog/mobile-app-consent-ios-2025).
- Expo and `react-native-google-mobile-ads`: [config plugin issue](https://github.com/invertase/react-native-google-mobile-ads/issues/835), [Expo forum thread on web builds](https://forums.expo.dev/t/react-native-google-mobile-ads-expo-web/68400).
- AdSense and single-page apps: [developer rejection checklist](https://coderfile.io/blog/adsense-approval-checklist-developers-2026).
- Claude Haiku 5.5 pricing: Anthropic model pricing table as of 2026-10-06 ($0.10 input, $0.50 output per million tokens).
