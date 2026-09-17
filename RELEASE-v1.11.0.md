# v1.11.0 — review build

This branch is a review build. It has not been deployed to the live Railway service.

## Included

- Balance data read from the supplied Google Sheet; confirmed six rules applied to actual handlers.
- Krai HP7 / revive to HP2 once per player per game; other characters have two equipment slots.
- Doctor self-cost2, Nerd target heal1, Mor Tham frees next-turn movement, Dog top-four excludes events, Cat multiple remote-help cards with one effect per friend per turn.
- Positive equipment Fear, positive-only sanity cards, new event names, immediate V09 healing and current-turn-only V04 end.
- Nine updated curses, warning at 3/6 and effect at 6/6, serialized player-selected Amulet discards, random equipment discard and ghost gathering.
- Separate support score for effective friend healing, revival and status removal; successful reactions credit protection of other affected players. Self effects do not earn points. No existing card redirects damage to a friend, so no new redirection ability was invented.
- Shop catalog, authenticated wallet/inventory API, server-side ownership validation, shop/inventory UI and future cosmetic categories.
- Free: Mae Mali, Doctor, Nerd, Mor Tham. Krai250; Black Shaman500; Dog600; Cat600.
- Match wallet rewards rank1–6: 100/90/80/70/60/50; wallet currency is เงินบาท and remains separate from in-match money/score.
- Duplicate-character setting on room creation and host settings (default on); host Start button moved to top.

## Rollout boundary

The shop is disabled unless SHOP_ENABLED=true. With it disabled, login/room creation and the previous character access remain available; the shop displays coming soon. Do not enable ownership locks before the database migration and account purchase test pass.

To activate the persistent economy, apply supabase/v1.11.0-shop.sql to the existing game database after v1.10.0.sql, then set SHOP_ENABLED=true for the correct Railway game service. This turn did not have an authenticated Supabase migration capability. Per Tim's instruction to avoid manual infrastructure work while at the office, activation is parked rather than asking him to run SQL now.

No existing XP/profiles are dropped. There are no retroactive wallet rewards or automatic paid-character grants. Migrations are repeatable. Account origin/cookie authentication fix is preserved.

## Validation

Run npm test with Node22+. Includes previous regressions and new socket/game-rule tests. shop-sql-test.cjs runs migrations and purchase/reward checks in an isolated PostgreSQL WASM database; it is not a production Supabase test and does not simulate independent database connections.

Playwright visual test is available as shop-ui-test.cjs but could not run here because the Chromium download returned 502. Visual QA and a real Google-login purchase/relogin/room round trip remain release checks. Do not claim production readiness before these are verified.
