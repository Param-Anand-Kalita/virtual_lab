# Budget Planner: technical notes

These notes are for reports and presentations. They hold the detail that the Planner page deliberately leaves out: how the search works, what it prunes, how it was verified and where it stops being reliable. The page itself keeps to plain-language explanations.

Source files: `lib/build-planner.ts` (the search and the planner), `lib/price-catalogue.ts` (price data), `lib/compatibility.ts` and `lib/compatibility-catalogue.ts` (the existing rules and catalogue, reused unchanged), `components/budget-planner.tsx` (the page) and `tests/build-planner.test.mjs` (the tests).

## 1. What the Planner does, and what it does not

Given a budget in rupees, it lists combinations of **four parts only**: a CPU, a motherboard, a RAM kit and a case. Each combination has passed the three compatibility rules that already exist in the project, and has an estimated price range built from retailer listings. Combinations are ranked by estimated cost.

It does not build a complete PC (no graphics card, storage, power supply or cooler), it does not score or rank performance, and it does not track live prices. Cheapest does not mean best or fastest.

## 2. How the search works

### 2.1 Data the search is given

- **Slots**, searched in this order: motherboard, CPU, RAM kit, case. Motherboard comes first because two of the three rules involve it, so a wrong board ends a branch before RAM and case are tried.
- **Candidates** for each slot: the catalogue models that have a verified price, each carrying its minimum, median and maximum price.
- **Rules**: the three existing checks, wrapped without change. CPU socket against motherboard socket; RAM memory type against motherboard memory type; motherboard form factor and width against the case.

The search engine (`searchBuilds`) knows nothing about PCs. It takes a list of slots, the candidates for each, a list of rules (each naming the slots it needs) and an optional budget. That is what keeps it extensible (section 8).

### 2.2 The backtracking search

It is a recursive depth-first search:

```
search(depth, minSoFar, medianSoFar, maxSoFar):
  if depth == number of slots: record a complete build; return
  for each candidate in the slot at this depth:
      if minSoFar + candidate.min + cheapestPossible(remaining slots) > budget:
          count a budget prune; continue            # branch cannot fit the budget
      choose the candidate
      for each rule whose last needed slot is this depth:
          if the rule does not return PASSED:        # FAILED or UNVERIFIED
              count a rule prune; undo; continue     # abandon this branch
      search(depth + 1, ...)                         # explore the rest
      undo the choice                                # backtrack
```

Key points:

- **Rules run as early as possible.** A rule is checked the moment both of its parts are chosen, not at the end. A bad pair therefore removes every combination that would have followed it.
- **UNVERIFIED is treated like FAILED.** A build must pass every rule, and missing data is never read as a pass. The two outcomes are counted separately.
- **The budget bound is a lower bound.** `cheapestPossible` is the cheapest minimum price in each unchosen slot, ignoring compatibility. A branch is dropped only when even that optimistic total already exceeds the budget. Any complete build under it would have a minimum total above the budget, and such builds are excluded anyway, so the bound never discards a build that qualifies. It is deliberately loose: it ignores compatibility, which keeps it simple and provably safe.

### 2.3 Budget labels and ranking

Each part carries a price range, so each build has a lowest, median-sum and highest total.

| Condition | Label |
|---|---|
| highest total <= budget | **within budget** |
| lowest total <= budget < highest total | **may exceed budget** |
| lowest total > budget | not shown |

A budget exactly equal to a total counts as fitting. Within each group, builds are ranked by the sum of the parts' median prices, cheapest first. Ties break on the lowest total, then on the part ids, so the order is the same every time.

## 3. Why backtracking rather than checking every combination

Checking every combination costs the product of the candidate counts, and most of that work is wasted on combinations that fail a rule in their first pair. Backtracking cuts a bad pair once and skips everything beneath it. At this catalogue's size either approach is instant, but the structure is what scales and what extends: a new category is one more slot and one more rule, not a rewrite.

## 4. Pruning statistics on the real catalogue

These numbers come from running the project's own planner (`planBuilds(...).stats`) on the real data. "Nodes visited" counts every candidate the search tried at every depth.

### 4.1 Rules only, all real models

The catalogue has 15 real models (3 CPUs, 5 motherboards, 4 RAM kits, 3 cases). That gives 3 x 5 x 4 x 3 = **180 combinations**.

| | Count |
|---|---|
| Compatible combinations | **24** of 180 |
| Nodes in a tree with no pruning | 260 |
| Nodes the search visited | **70** |
| Branches cut by CPU-motherboard socket | 10 |
| Branches cut by RAM-motherboard memory type | 10 |
| Branches cut by motherboard-case fit | 6 |
| Branches cut as UNVERIFIED | 0 |

### 4.2 With prices and budgets

Only 8 of the 15 real models have a verified price (3 CPUs, 2 motherboards, 2 RAM kits, 1 case), giving **12 priced combinations** and a 32-node unpruned tree. Of those, **2 are compatible**.

| Budget | Result | Nodes visited | Cut by a rule | Cut by budget | Complete builds |
|---|---|---|---|---|---|
| ₹60,000 | 1 within budget | 8 | 2 | 2 | 1 |
| ₹87,000 | 1 within, 1 may exceed | 14 | 6 | 0 | 2 |
| ₹87,355 | 2 within | 14 | 6 | 0 | 2 |
| ₹53,459 | none fit | 5 | 1 | 3 | 0 |
| no limit | 2 | 14 | 6 | 0 | 2 |

At ₹60,000 the budget bound removes the more expensive branch before its parts are explored, which is where the 8 nodes (instead of 14) come from. At ₹53,459, one rupee below the cheapest build's lowest total, the budget bound cuts 3 branches and only 5 nodes are visited.

## 5. Price data

- **Observations.** Each verified product holds the in-stock listings found at approved retailers, with retailer, URL, listing title, product code and price. Only in-stock listings of the exact model (or the named variant) are counted. Everything else seen is kept with the reason it was not counted (out of stock, a different variant or model, ambiguous identity, or a marketplace seller).
- **Statistics.** Minimum, maximum and median come from the observations. With an even count the median is the mean of the two middle prices. A build's median is the sum of its parts' medians, so it can end in .5; the page rounds to the nearest rupee for display only.
- **Retailers.** Approved retailers are MD Computers, PrimeABGB, Vedant Computers, EliteHubs, Computech Store and PC Studio. Counted prices come from the first four. Computech Store and PC Studio were checked but contributed only listings that were not counted. Amazon and Flipkart third-party listings are not used.
- **Confidence.** A price with a single observation is flagged single-source (`lowConfidence` in the planner's output) and its range is that one price. Both priced builds contain at least one such part. The page shows each part's source count but does not display a separate confidence warning.
- **Variants.** The NZXT H5 Flow (2024) is priced for the white CC-H52FW-01 only. The Fractal Define 7 is the Black Solid FD-C-DEF7A-01, which is out of stock, so it is unpriced. Ryzen 5 5600X OEM packs are excluded. The MSI MAG B550 TOMAHAWK WIFI is treated as a different model from the TOMAHAWK in the catalogue.
- **Exclusions.** 7 real models have no verified price (ASUS B650E-I, ASUS Z790 EXTREME, MSI B550 TOMAHAWK, both original Corsair RAM kits, Cooler Master Q300L, Fractal Define 7) and are listed on the page with their reasons.
- **Dates.** Prices were researched on 29 October 2026. They are a snapshot.

## 6. Verification

- **Test suite.** `npm test` runs 67 tests. 28 are in `tests/build-planner.test.mjs`.
- **Exhaustive comparison.** On 150 random small catalogues, at many budgets (including budgets at and one rupee either side of each build's totals), the search returns exactly what a separate brute-force enumeration returns, using only the existing `checkCompatibility`. A further 61 catalogues confirm that budget pruning never removes a build whose lowest total fits.
- **Backtracking behaviour.** Tests count nodes and prunes on small catalogues to show a failing pair removes its whole subtree, that UNVERIFIED data prunes and is counted separately, and that a wrong board is never explored further.
- **Boundaries.** Budget equal to the highest total (within), one rupee below it (may exceed), equal to the lowest total (may exceed), one rupee below that (dropped).
- **Real catalogue.** The 180 combinations give exactly 24 compatible builds; the priced search gives exactly 2; at ₹60,000 only the Intel build appears; the Ryzen build appears as "may exceed" from ₹86,607 and as "within" from ₹87,355.
- **Data consistency.** Every stored minimum, median and maximum is checked against its observations; every price record points at a real catalogue id; retailers are approved; no listing is counted twice.
- **Development-time checks (not part of the repository).** The tests were confirmed to fail when the search was deliberately broken (over-aggressive budget pruning, or UNVERIFIED treated as a pass). The stored prices were cross-checked against copies of the retailer pages saved during research, and all 17 counted observations matched.
- **Build and static checks.** `npx tsc --noEmit` and `npm run build` pass; lint is clean on the Planner files.

## 7. Technical limitations

1. **Three rules only.** A planned build has passed CPU socket, RAM memory type and motherboard-case fit. It has not been checked for BIOS or chipset support, memory speed or qualified memory lists, power supply capacity, cooling or anything else. Passing is not a guarantee that the parts work together as a complete system.
2. **A recorded platform note.** Corsair's page for the CMK16GX4M1E3200C16 DDR4 kit lists Intel 300 to 600 series and AMD 300 to 500 series platforms. The Intel build pairs this kit with an MSI B760 board, and B760 is a 700-series chipset, which is not in that list. The planner checks memory type only, so it neither claims nor rules out a problem. The note is stored with the kit in the catalogue so it is not lost.
3. **Small, partly priced catalogue.** Only 8 of 15 real models have a verified price, so only 2 of the 24 compatible builds can be priced. The Planner is a demonstration of the method, not a recommender over the market.
4. **Prices are a snapshot.** They were collected by hand on one date, are not updated live, exclude shipping and bank offers, and (especially RAM) can change quickly. Nothing in the project re-checks them against live pages.
5. **Single-source prices.** The Intel Core i5-13400F and the white NZXT H5 Flow each rest on one listing, so their range is a single price.
6. **Ranking is cost only.** There is no performance model, so the order says nothing about which build is better.
7. **A loose budget bound.** The bound ignores compatibility, so it keeps some branches that a tighter bound would drop. It is safe, not optimal.
8. **Search cost.** The worst case is the product of the candidate counts. Pruning helps in practice, but nothing guarantees speed on a catalogue thousands of times larger without further indexing.
9. **Assumes unique part ids.** The planner maps results back to parts by id, and a test enforces that ids are unique across the catalogue.
10. **Input limits.** The budget field accepts whole rupees from 1 to 1,00,00,000.

## 8. Extending the Planner

- **A new model:** add it to `lib/compatibility-catalogue.ts` with its manufacturer source, and add a price record to `lib/price-catalogue.ts`. The data tests check the rest.
- **A new part category (for example a power supply):** add a slot to the search order, give it candidates, and add a rule that names the slots it needs and returns PASSED, FAILED or UNVERIFIED. `searchBuilds` needs no change. A test with a made-up power-supply slot and rule demonstrates this.
- **A tighter budget bound:** replace the cheapest-possible lower bound in `searchBuilds` with one that also respects the rules, keeping the guarantee that it never exceeds a real completion's minimum.

## 9. Slide-ready summary

- Four parts, one budget, ranked by estimated cost: not a complete PC and not a performance ranking.
- A recursive backtracking search over the real catalogue: it tests compatibility as soon as a pair is chosen and abandons dead branches.
- On the real catalogue, rule pruning cuts 26 branches and visits 70 nodes instead of 260 to find the 24 compatible builds out of 180.
- A budget bound prunes more, and provably never discards a build that fits.
- Prices are ranges from real retailer listings, with source counts, and honest exclusions for anything unverified.
- Verified against brute-force enumeration on 150 random catalogues, with boundary tests around every budget edge.
- Limits are stated plainly: three rules, one snapshot date, partly priced catalogue.
