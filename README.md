# OCBC ONE interactive prototype

OCBC ONE is a dependency-free responsive web demo of a living financial plan across banking, protection and investments. It demonstrates proactive event detection, customer-controlled data permissions, explainable AI decisions and three levels of authority:

- Tier 1: **ONE acts** only inside a saved, capped and reversible instruction.
- Tier 2: **You confirm** after ONE prepares and explains the next step.
- Tier 3: **A human steps in** for high-impact, unfamiliar or out-of-boundary decisions.

The UI demonstrates these levels through decision badges, confirmation states and customer authority settings without adding presentation-style explainer panels.

## AI State Engine

The demo now includes a small, reproducible deep-clustering layer. A `6 → 8 → 2 → 8 → 6` autoencoder learns a two-dimensional financial fingerprint from 720 seeded synthetic snapshots. K-means then groups that fingerprint into three presentation-friendly planning states:

- **Buffer Building**: establish emergency liquidity first.
- **Protection Gap**: review a meaningful uncovered risk.
- **Growth Ready**: proceed to an investment suitability review.

The browser runs the exported encoder and nearest-centroid inference live as Tom's demo data changes. The label only prioritises planning context: deterministic rules calculate any next step, and customer permissions plus the Trust Ladder determine whether an action is allowed.

## Run the app

From this folder, run `npm start`.

Open `http://127.0.0.1:4173`.

No package installation is required.

## Recommended demo flow

1. On first use, save the data-consent choices.
2. Open **Demo scenarios**.
3. Run **First full-time salary**, open the calculation behind the Tier 1 transfer, then choose **View AI state** to show **Buffer Building**.
4. Run **Trip to Dubai** and open **View AI state** to show the transition to **Protection Gap**. Compare Essential and Plus cover, choose Great Eastern or the other-provider route, then confirm.
5. Open **Protection** to inspect the cover decision, or **Actions & dates** to show the action beside the live month calendar.
6. Run **Planning a first home**, then open the state engine from **Investments** to show **Growth Ready** before inspecting the prepared brief and booking a dated advisor review.

The **Investments** page includes a readiness gate, preliminary planning questions and a ten-year simulator. Saving a planning amount does not move money or place an order.

For a two-minute presentation, the three state-engine reveals can be delivered in about 20 seconds total: “The same six consented features are compressed into a financial fingerprint. Deep clustering sees Tom move from building liquidity, to a protection gap, to being ready for an investment suitability review. The AI identifies the state; it never authorises the action.”

## Retrain the model

The committed model is ready to use; Python is not required to run the web app. To reproduce it:

```bash
python -m pip install -r requirements-ai.txt
npm run ai:train
```

The fixed seed makes the generated dataset, encoder and clusters deterministic.

## Reset

Use **Reset Tom's journey** in Demo scenarios to restore the financial starting point while keeping data and Trust choices.

Use **Reset app and consent** under Trust controls to restore the complete first-use state.

## Verification

Run `npm run check`, `npm run ai:check` and `npm run test:demo`.

The integration check verifies the served app structure, trained model artifact, live browser inference states and exact financial transitions through all three stages.
