# OCBC ONE: Consent, Policy and Regulation Q&A

## Is this prototype legally compliant?

> We are not claiming that. The prototype proves the customer journey and the three authority levels. It does not include production identity checks, legal notices, transaction systems, model validation or OCBC's internal approval workflow. Those would have to pass legal, compliance, risk, security, product and operational review before launch.

## Where does Tom consent to his data being used?

> The current demo shows action permissions, not the full PDPA onboarding flow. A real version would first name each data category, such as OCBC transactions, connected policies and external account data; identify the purpose, such as cash-flow planning or detecting a possible protection gap; identify any external recipient; and record the notice version, Tom's choice and the time it was given. Optional sources and purposes should have separate controls instead of one broad "agree to everything" button.

## What does the PDPA specifically require?

> Before collecting, using or disclosing personal data, OCBC must notify Tom of the intended purposes and obtain consent unless a PDPA exception applies. The purpose must be one a reasonable person would consider appropriate. The data must also be accurate when used for a decision, protected from unauthorised access, retained only while needed, and made available for access or correction where the PDPA requires it.

## What happens when Tom withdraws data consent?

> OCBC must allow withdrawal with reasonable notice, explain the likely consequences and stop future collection, use or disclosure for that purpose unless another legal basis or exception applies. PDPC guidance treats at least 10 business days as a general rule of thumb for reasonable notice, not a fixed deadline for every case. Records may still be retained where banking, dispute, audit or other legal obligations require them.

## Is the Tier 1 toggle the same as PDPA consent?

> No. PDPA consent concerns personal-data processing. The Tier 1 toggle is closer to a customer transaction mandate or standing instruction. In production, it should state the source and destination accounts, S$3,000 cash floor, S$1,000 transfer cap, trigger conditions, effective period, how to cancel it and whether a transfer can be reversed. Creating or changing that mandate should require customer authentication and generate an audit record.

## Can the AI move more than S$1,000 if it predicts that saving is better?

> No. The model cannot expand its own authority. For this journey, the hard limits are a maximum S$1,000 transfer and at least S$3,000 left available. If either condition is not met, the transfer is zero. OCBC may also block an otherwise permitted transfer because of fraud, security, sanctions, account-status or operational controls.

## Does Tom's permission override OCBC policy?

> No. The applied limit is the strictest of law, MAS requirements, OCBC policy and Tom's own boundary. For example, Tom may allow S$1,000, but the bank can permit less or stop the transaction. Neither Tom nor OCBC can use a setting to waive a legal requirement.

## Can ONE inspect all of Tom's insurance and external accounts?

> No. It can only use sources that are actually connected and authorised. Each value should carry its source and last-updated time. That is why the safe statement is "no active travel cover was found in connected policies," not "Tom has no travel insurance." If a connection is withdrawn or stale, ONE should stop relying on it and tell Tom.

## Can ONE buy the S$48 travel policy automatically?

> Not in this design. Before confirmation, Tom should see the insurer, premium, insured persons, destination and travel period, main benefits, material exclusions, eligibility conditions and policy documents. The system should record his explicit confirmation and the exact product version. Applicable Insurance Act requirements, MAS notices, disclosure rules, product governance and fair-dealing controls still apply. Detection of a trip is not consent to purchase insurance.

## Why is the mortgage not approved by ONE?

> Singapore property lending requires formal affordability and underwriting checks. As at September 2026, total monthly debt generally must stay within the 55% TDSR threshold. The MSR is 30% for applicable HDB and Executive Condominium purchases. For a bank housing loan with no outstanding housing loan, the LTV can be up to 75%, but a lower 55% limit can apply depending on tenure and age. Existing loans, income, property value, loan tenure and OCBC's credit policy must be verified. ONE can organise the information, but it cannot guarantee eligibility or approve the loan.

## Is there a Singapore law specifically governing bank AI?

> The PDPA already applies when AI processes personal data, and banks remain subject to existing banking, technology-risk, conduct and product requirements. MAS's December 2024 AI Model Risk Management paper describes good practices observed at banks; it is not a new Act. MAS also consulted on proposed AI Risk Management Guidelines in November 2025. As at September 2026, we should describe those as proposed supervisory guidance, not as final binding law.

## Is the Deep K-means model actually running?

> Yes, as a transparent proof of concept. A seeded Python pipeline generates 720 synthetic financial snapshots, standardises six features, trains a `6–8–2–8–6` autoencoder and runs K-means over its two-dimensional embedding. The exported encoder weights and centroids run locally in the browser as Tom's demo state changes. It is not trained on OCBC customer data, is not production-validated and never authorises a transaction.

## Why use clustering instead of a prediction model?

> The demo is identifying a current planning pattern, not predicting approval, returns or customer behaviour. The three clusters help prioritise the next explanation: build liquidity, review a protection gap or begin a suitability review. Their business-facing names are assigned after inspecting the cluster profiles, and deterministic rules remain the source of calculations and control.

## What AI controls would OCBC need in practice?

> OCBC would need to register the use case in an AI inventory, assess its risk and customer impact, approve its permitted actions, validate the model before deployment, test false positives and unfair outcomes, monitor performance after launch, keep input and action logs, control model changes, review third-party providers and maintain a human override or kill switch. Higher-impact actions require stronger review. The chat interface itself must never be the transaction-authorisation system.

## Who is responsible if a third-party AI provider makes the error?

> OCBC remains accountable for the customer-facing service and for selecting and overseeing its provider. A provider processing data only on OCBC's instructions may be a data intermediary with its own PDPA protection and retention duties, but outsourcing does not remove OCBC's responsibility. Roles, permitted uses, security, breach reporting, deletion and audit access must be defined contractually.

## What happens if customer data is breached?

> OCBC must assess whether the breach is notifiable. If it is likely to cause significant harm or is of significant scale, the PDPC must be notified as soon as practicable and no later than three calendar days after OCBC determines it is notifiable. Affected individuals must be notified as soon as practicable when required. A data intermediary must report a suspected breach to OCBC without undue delay.

## What should I say if asked about OCBC's exact internal policy?

> The prototype does not claim access to OCBC's confidential approval thresholds or operating procedures. It shows where those controls would be enforced. In production, OCBC policy could narrow the eligible accounts, lower the transfer cap, add transaction checks or require human approval, but it could not weaken a legal or regulatory requirement.

## Strong summary answer

> Consent does not give the AI unlimited authority. Data consent, a transaction mandate and product confirmation are separate controls. Every action is also limited by Singapore law, MAS requirements and OCBC policy, with human review for a mortgage. This prototype demonstrates that control structure; it does not claim completed compliance.

## Official reference points

- [PDPC summary of the 11 data-protection obligations](https://www.pdpc.gov.sg/overview-of-pdpa/the-legislation/personal-data-protection-act/data-protection-obligations)
- [PDPC guidance on consent withdrawal](https://www.pdpc.gov.sg/-/media/Files/PDPC/PDF-Files/Advisory-Guidelines/AG-on-Key-Concepts/Advisory-Guidelines-on-Key-Concepts-in-the-PDPA-1-Oct-2021.pdf)
- [PDPC guidance on personal data in AI systems](https://www.pdpc.gov.sg/guidelines-and-consultation/2024/02/advisory-guidelines-on-use-of-personal-data-in-ai-recommendation-and-decision-systems)
- [PDPC guide to breach assessment and notification](https://www.pdpc.gov.sg/help-and-resources/2021/01/data-breach-management-guide)
- [MAS Technology Risk Management Guidelines](https://www.mas.gov.sg/-/media/MAS/Regulations-and-Financial-Stability/Regulatory-and-Supervisory-Framework/Risk-Management/TRM-Guidelines-18-January-2021.pdf)
- [MAS Artificial Intelligence Model Risk Management information paper](https://www.mas.gov.sg/-/media/mas-media-library/publications/monographs-or-information-paper/imd/2024/information-paper-on-ai-risk-management-final.pdf)
- [MAS 2025 consultation on proposed AI Risk Management Guidelines](https://www.mas.gov.sg/news/media-releases/2025/mas-guidelines-for-artificial-intelligence-risk-management)
- [MAS Notice 120 on disclosure and advice for accident and health insurance products](https://www.mas.gov.sg/-/media/mas-media-library/regulation/notices/id/notice-120/310522-mas-120_revised-may-2022.pdf)
- [MoneySense housing-loan guide, updated 1 July 2026](https://www.moneysense.gov.sg/buying-a-property-how-much-can-you-afford/)

These answers are presentation guardrails, not legal advice. Exact obligations depend on the final product design, data flows, licences and rules in force when deployed.
