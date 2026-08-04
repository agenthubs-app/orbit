import type { EventParticipantProfileAnswers, EventRegistration } from "../registration/contract";
import { eventRegistrationId } from "../registration/service";
import {
  createEventRegistrationLiveRecordProvider,
  EVENT_REGISTRATION_COLLECTION,
} from "../registration/storage/live-record-provider";
import { EVENTS_LIVE_RECORD_COLLECTION } from "../event-crud-and-import/providers/storage-event-provider";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import {
  EVENT_OPERATIONS_COLLECTIONS,
  type EventOperationsConfiguration,
} from "./contract";
import type { EventOperationsRepository } from "./repository";

export const EVENT_OPERATIONS_E2E_EVENT_ID = "event_signup_01";
export const EVENT_OPERATIONS_E2E_ORGANIZER_EMAIL = "organizer.event-ops@orbit.example.test";

export interface EventOperationsSeedParticipantDefinition {
  answers: EventParticipantProfileAnswers;
  displayName: string;
  email: string;
  registrationStatus: "cancelled" | "rsvped";
  registrationTiming: "late" | "on_time";
}

const participant = (
  index: number,
  displayName: string,
  positioning: string,
  industry: string,
  targetAttendees: string,
  valueOffered: string,
  desiredOutcome: string,
  energyStyle: string,
  experienceHighlight: string,
  followUpPreference: string,
  registrationStatus: "cancelled" | "rsvped" = "rsvped",
  registrationTiming: "late" | "on_time" = "on_time",
): EventOperationsSeedParticipantDefinition => ({
  answers: {
    desiredOutcome,
    energyStyle,
    experienceHighlight,
    followUpPreference,
    industry,
    positioning,
    targetAttendees,
    valueOffered,
  },
  displayName,
  email: `attendee${String(index).padStart(2, "0")}.event-ops@orbit.example.test`,
  registrationStatus,
  registrationTiming,
});

/** Fictional, test-only people with deliberately different matching dimensions. */
export const EVENT_OPERATIONS_E2E_PARTICIPANTS = [
  participant(1, "Aiko Mori", "Climate founder @ LoopMatter", "Circular economy", "Manufacturing buyers, seed investors", "Packaging reuse pilot data", "Find two Japanese pilot customers", "Focused one-to-one", "Scaled a reuse pilot from 2 to 18 stores", "日本語, English"),
  participant(2, "Ren Ito", "Principal @ Northstar Ventures", "Venture capital", "Climate and robotics founders", "Seed fundraising feedback, investor introductions", "Source investment-ready founders", "High-energy connector", "Led 22 seed investments across Japan", "日本語, English"),
  participant(3, "Maya Chen", "Product lead @ RelayAI", "Enterprise AI", "Design partners, security leaders", "Agent workflow prototypes", "Validate regulated-industry use cases", "Small-group analytical", "Shipped an AI copilot to 4,000 users", "English, 中文"),
  participant(4, "Daichi Sato", "Factory director @ Shinsei Works", "Manufacturing", "Vision AI vendors, operations peers", "Three production-line pilot sites", "Reduce inspection downtime", "Practical and direct", "Cut defect escape rate by 31%", "日本語"),
  participant(5, "Leila Haddad", "Partnerships director @ GridCommons", "Energy", "Utilities, climate software teams", "Utility procurement navigation", "Build a cross-border flexibility pilot", "Warm facilitator", "Negotiated a three-utility consortium", "English, Français"),
  participant(6, "Kenji Nakamura", "Robotics founder @ Mizu Robotics", "Robotics", "Factory operators, embedded engineers", "Mobile manipulation platform", "Recruit two design partners", "Hands-on technical", "Deployed robots in 11 warehouses", "日本語, English"),
  participant(7, "Sofia Alvarez", "Market entry advisor @ Puente Asia", "Market expansion", "SaaS founders entering Japan", "Japan go-to-market and localization", "Meet product-led B2B teams", "High-energy storyteller", "Launched 7 overseas products in Japan", "Español, English, 日本語"),
  participant(8, "Priya Rao", "AI delivery director @ Nimbus Systems", "Enterprise services", "Reliable AI product teams, banks", "Regional implementation teams", "Form one delivery partnership", "Structured listener", "Delivered 14 regulated AI programs", "English, हिन्दी"),
  participant(9, "Haruto Kondo", "Security architect @ Kintsugi Bank", "Financial services", "AI governance leaders, vendors", "Bank security review expertise", "Compare auditable agent controls", "Reserved expert", "Designed zero-trust controls for 9 systems", "日本語, English"),
  participant(10, "Nora Williams", "Community lead @ Founder Harbor", "Startup community", "Operators, mentors, curated hosts", "A 1,200-member founder network", "Find substantive roundtable partners", "Inclusive connector", "Produced 60 founder peer sessions", "English"),
  participant(11, "Yuna Park", "Growth head @ Lantern Health", "Digital health", "Hospital innovators, privacy counsel", "Patient engagement experiments", "Secure a hospital co-design partner", "Empathetic one-to-one", "Raised activation by 44% without incentives", "한국어, English, 日本語"),
  participant(12, "Takeshi Watanabe", "Procurement VP @ Koyo Mobility", "Mobility", "Fleet software, battery analytics teams", "Enterprise procurement sponsorship", "Identify deployable fleet tools", "Decisive executive", "Consolidated procurement across 6 markets", "日本語, English"),
  participant(13, "Elena Petrova", "Data scientist @ OceanLedger", "Climate data", "Remote sensing teams, insurers", "Coastal risk models and datasets", "Find a commercial distribution partner", "Deep technical", "Published a flood model used by 3 cities", "English, Русский"),
  participant(14, "Jun Seo", "Corporate innovation manager @ Mirai Foods", "Food technology", "Traceability startups, retailers", "Retail test beds and supply-chain access", "Launch a traceability proof of concept", "Curious generalist", "Ran 8 corporate-startup pilots", "日本語, 한국어, English"),
  participant(15, "Amara Okafor", "People operations founder @ TeamWeave", "Future of work", "Scaling founders, HR leaders", "Distributed-team operating systems", "Test a manager coaching product", "Reflective facilitator", "Built remote practices for a 300-person team", "English"),
  participant(16, "Riku Hayashi", "Open-source maintainer @ EdgeMesh", "Developer infrastructure", "Platform teams, technical founders", "Edge orchestration community", "Find sustainable enterprise use cases", "Quiet builder", "Maintains a project with 12k stars", "日本語, English"),
  participant(17, "Camille Dubois", "Impact measurement lead @ Verity Fund", "Impact investing", "Climate funds, measurement platforms", "Impact diligence frameworks", "Standardize portfolio evidence", "Methodical analyst", "Assessed impact across 40 portfolio firms", "Français, English"),
  participant(18, "Omar Farouk", "Logistics founder @ RouteKind", "Logistics", "Retail shippers, routing researchers", "Last-mile operations data", "Reduce failed delivery attempts", "Fast-paced operator", "Scaled deliveries to 2 million parcels/year", "العربية, English"),
  // These six early registrations deliberately exercise partial and minimal
  // profiles without shrinking the frozen matching cohort to only ideal data.
  participant(19, "Mei Lin", "Design research director @ HumanSignal", "Product design", "AI product leads, accessibility experts", "", "", "Patient interviewer", "", "中文, English, 日本語"),
  participant(20, "Akira Fujimoto", "Policy counsel @ CivicStack", "Technology policy", "AI builders, public-sector buyers", "", "Translate regulation into product controls", "Evidence-first debater", "", ""),
  participant(21, "Grace Kim", "Revenue operations VP @ AtlasCloud", "B2B SaaS", "", "Revenue system design", "", "", "", "English, 한국어"),
  participant(22, "Mateo Silva", "Biodiversity founder @ CanopyTrace", "Nature technology", "Satellite teams, consumer brands", "", "", "Mission-led storyteller", "", ""),
  participant(23, "Hana Suzuki", "Customer success lead @ CareBridge", "", "", "", "", "", "", "日本語"),
  participant(24, "Noah Bennett", "Repeat founder @ QuietCurrent", "", "", "", "", "", "", ""),
  participant(25, "Shiori Takeda", "Co-founder and COO @ ClauseHarbor", "Legal technology", "General counsel at export-heavy companies, compliance product leaders", "A multilingual contract-risk benchmark built from 180 anonymized negotiation patterns", "Recruit three design partners for an explainable cross-border contract review workflow", "Calm, precise one-to-one conversations before broader group discussion", "Led legal operations across Tokyo and Singapore and reduced outside-counsel turnaround by 38%", "日本語, English, Prefer a concise written recap within two business days"),
  participant(26, "Marcus Lee", "Senior product director @ PortLedger", "Supply-chain finance", "Freight forwarders, trade-finance banks, customs-data providers", "API integration experience across invoice, shipment, and credit-risk systems", "Validate a shared-data product that shortens working-capital approval for mid-sized exporters", "Systems thinker who sketches flows and asks detailed follow-up questions", "Launched a regional trade-finance platform processing USD 420 million in annual invoices", "English, 中文, Happy to continue through a technical workshop the following week"),
  participant(27, "Fatima Zahra El Idrissi", "Founder and water systems engineer @ AtlasBlue", "Water resilience", "Industrial water users, membrane researchers, climate-infrastructure investors", "Field performance data from decentralized treatment systems in arid communities", "Form a manufacturing partnership for a lower-maintenance filtration module", "Warm but evidence-led; prefers a few deep conversations over rapid networking", "Commissioned 23 community systems and trained local operators to maintain them independently", "العربية, Français, English, Send technical materials first and schedule a call only if there is a concrete fit"),
  participant(28, "Kenta Ishikawa", "Executive director of business development @ Nami Bio", "Biotechnology", "Diagnostics distributors, hospital innovation teams, translational researchers", "Access to a validated microfluidic assay and a Japan clinical-development roadmap", "Identify a co-development partner for a respiratory screening pilot", "Measured executive presence with direct questions about ownership and timelines", "Negotiated two university licenses and brought one diagnostic program from prototype to multicenter study", "日本語, English, Prefer an introduction email with decision makers copied"),
  participant(29, "Emily Carter", "Partner, LP relations and platform @ Meridian Seed", "Venture capital", "Emerging managers, institutional allocators, portfolio talent leaders", "Fundraising narrative review and a network of mission-aligned family offices", "Compare practical approaches to transparent portfolio support reporting", "Generous connector who alternates short introductions with careful listening", "Built an allocator program that helped four first-time funds close above target", "English, A thoughtful memo is welcome; follow up within one week rather than the next morning"),
  participant(30, "Nguyễn Minh Anh", "Agronomy product manager @ Mekong Harvest Labs", "Agricultural technology", "Greenhouse operators, crop-model teams, food-company sustainability leads", "Three seasons of sensor and yield data from smallholder vegetable farms", "Find a partner to turn agronomic recommendations into a low-bandwidth mobile service", "Observant and collaborative; likes working through a concrete farmer journey", "Co-designed an advisory program used by 6,800 farms while keeping weekly churn below 3%", "Tiếng Việt, English, Prefer a shared pilot brief and monthly milestone calls"),
  participant(31, "Lars Andersen", "Commercial vice president @ FurnaceZero", "Industrial decarbonization", "Steel and ceramics operators, project financiers, heat-storage engineers", "Customer economics models for replacing gas-fired process heat", "Assemble a bankable demonstration consortium for a high-temperature storage project", "Blunt, energetic operator who welcomes informed disagreement", "Closed EUR 28 million of industrial equipment contracts across five European markets", "Dansk, English, Follow up with quantified assumptions and a named commercial owner"),
  participant(32, "Rina Kobayashi", "Principal accessibility researcher @ CommonForm", "Inclusive product design", "AI interface teams, disability advocates, enterprise design-system owners", "Moderated research methods and an accessibility test panel spanning visual, motor, and cognitive needs", "Influence one AI product roadmap before its interaction model becomes difficult to change", "Patient facilitator who makes room for quieter participants and tests assumptions gently", "Established an inclusive research practice across 12 product squads and trained 90 designers", "日本語, English, Prefer accessible documents and asynchronous reflection before a follow-up interview"),
  participant(33, "Samuel Adeyemi", "Chief security officer @ TrustRail", "Cybersecurity", "Fintech founders, identity engineers, regulated enterprise buyers", "Threat-model workshops and incident lessons from high-volume payment infrastructure", "Identify identity products that can prove resilience without slowing enterprise onboarding", "Candid, scenario-driven and comfortable pressure-testing ambitious claims", "Led containment of a supply-chain compromise with no customer-fund loss and rebuilt the vendor-control program", "English, Yoruba, Share architecture diagrams securely before arranging a 45-minute review"),
  participant(34, "Ayumi Tanaka", "Director of digital public services @ Setagaya Civic Lab", "Government technology", "Service designers, identity specialists, procurement reformers", "Frontline access to resident-service workflows and public-sector usability evidence", "Find a small, auditable automation pilot that reduces application rework for residents", "Deliberate consensus builder who translates technical detail into public outcomes", "Redesigned a benefits application used by 70,000 households and cut incomplete submissions by 26%", "日本語, English, Use a formal summary with privacy assumptions and a realistic procurement path"),
  participant(35, "Daniel Wong", "Regional solutions architect @ SiliconBridge", "Semiconductors", "Edge-AI founders, automotive engineering teams, chip-design tool vendors", "Reference architectures for low-power inference and access to evaluation boards", "Select two software partners for an automotive edge-compute demonstration", "Technical and animated at a whiteboard, reserved during unstructured mingling", "Supported 17 production design wins across imaging, robotics, and mobility applications", "English, 中文, Prefer a benchmark matrix followed by an engineering deep dive"),
  participant(36, "Chiara Rossi", "Circular sourcing lead @ Forma Nuova", "Fashion and textiles", "Fiber innovators, traceability platforms, premium brand procurement teams", "Supplier transition playbooks and purchasing data from a multi-brand apparel group", "Create a credible recycled-material trial with measurable quality and labor safeguards", "Expressive storyteller who grounds discussion in supplier realities", "Moved 34% of a seasonal collection to verified lower-impact materials without raising returns", "Italiano, English, Follow up with physical sample options and a six-month adoption calendar"),
  participant(37, "Arjun Mehta", "Staff quantum software engineer @ QubitWorks", "Quantum computing", "Optimization researchers, logistics operators, skeptical enterprise technologists", "Open-source tooling for comparing quantum and classical optimization baselines", "Find a real scheduling problem where a transparent benchmark is more valuable than a publicity demo", "Quietly rigorous; prefers paired problem-solving and will challenge imprecise metrics", "Built a hybrid solver benchmark adopted by three university-industry research teams", "English, हिन्दी, Exchange reproducible notebooks before discussing a commercial pilot"),
  participant(38, "Miki Okamoto", "General manager of care innovation @ Hinata Living", "Aging and eldercare", "Care-home operators, family communication products, rehabilitation specialists", "Access to six care facilities and structured feedback from nurses and family coordinators", "Co-design a low-burden tool that improves continuity during shift handovers", "Empathetic operator who listens for workflow friction and emotional load", "Introduced a multidisciplinary care protocol that reduced avoidable hospital transfers by 19%", "日本語, Prefer an on-site observation and a one-page proposal in plain language"),
  participant(39, "Jacob Stein", "Founder and managing partner @ DeepCraft Talent", "Technical recruiting", "Deep-tech founders, research leaders, immigration counsel", "Specialist hiring maps for robotics, climate science, and advanced materials", "Build a shared talent program for startups that cannot yet support full recruiting teams", "Fast pattern-matcher who enjoys making specific, permission-based introductions", "Placed 46 senior technical hires with a 91% twelve-month retention rate", "English, Deutsch, Send role scorecards and funding context; I respond within three working days"),
  participant(40, "Siti Nur Aisyah", "Head of merchant growth @ Amanah Market", "Digital commerce", "Consumer brands, halal-certification experts, cross-border logistics operators", "Behavioral insights from 14,000 Southeast Asian specialty merchants", "Design a Japan entry experiment for independent food and beauty brands", "Friendly, high-energy collaborator who uses concrete merchant stories", "Built a merchant education program that lifted first-90-day revenue by 32% across three countries", "Bahasa Indonesia, English, 日本語, Prefer a WhatsApp-style concise update followed by a monthly review"),
  participant(41, "Hugo Martin", "Co-founder and chief revenue officer @ BlockCourtyard", "Property technology", "Commercial landlords, building-energy teams, workplace operators", "A tenant-engagement platform and occupancy data from mixed-use buildings", "Secure a Tokyo demonstration site for adaptive workspace services", "Confident relationship builder who moves quickly from context to commercial next steps", "Expanded a workplace platform from one city to 38 buildings across France and Belgium", "Français, English, Send a commercial outline with site requirements and decision dates"),
  participant(42, "Naoko Matsumoto", "Executive producer for international IP @ StoryArc Japan", "Media and entertainment", "Interactive storytellers, rights lawyers, fan-community product teams", "Licensing experience across anime, games, and location-based entertainment", "Meet technology partners who can prototype participatory stories without weakening creator control", "Curious cultural translator who connects creative and commercial perspectives", "Produced three transmedia launches reaching audiences in 11 markets", "日本語, English, Begin with a visual concept deck and clarify rights ownership before scheduling workshops"),
  participant(43, "Idris Mensah", "Risk and partnerships director @ Kora Remit", "Cross-border payments", "Community banks, fraud analytics teams, diaspora business networks", "Corridor-level compliance knowledge and anonymized remittance behavior patterns", "Find a responsible distribution partner for lower-cost SME supplier payments", "Steady, trust-first conversationalist who asks how incentives affect vulnerable users", "Opened four regulated payment corridors while reducing false-positive reviews by 21%", "English, Twi, Prefer a compliance note and references before exchanging customer introductions"),
  participant(44, "Olivia Thompson", "Dean of applied learning @ Northbank Institute", "Education technology", "Workforce employers, assessment designers, adult-learning founders", "Employer-validated curriculum models and access to 2,400 part-time learners", "Pilot an evidence-based skills credential for mid-career operations managers", "Socratic facilitator who enjoys structured debate and reflective pauses", "Rebuilt a diploma around workplace projects and increased completion from 63% to 81%", "English, Follow up with learning outcomes, learner-support assumptions, and a named evaluation plan"),
  participant(45, "Kohei Yamada", "Senior materials scientist @ Hikari Composites", "Advanced materials", "Mobility engineers, recycling specialists, industrial scale-up investors", "Pilot-line capacity for bio-based composites and detailed failure-analysis capability", "Choose a mobility component for a durability and recyclability validation program", "Low-key technical expert who communicates best around samples and test data", "Took a lightweight composite from lab formulation to 20,000-part annual production", "日本語, English, Share CAD constraints and target standards before an in-person lab review"),
  participant(46, "Tenzin Dolma", "Program director @ Resilient Himalaya", "Disaster resilience", "Satellite mapping teams, insurers, local-government preparedness leaders", "Community-led hazard maps and field networks across remote mountain districts", "Create an early-warning pilot that local responders can maintain after grant funding ends", "Grounded listener who balances urgency with community consent", "Coordinated flood preparedness across 52 villages and trained 300 volunteer responders", "Tibetan, हिन्दी, English, Prefer a community-impact note and a slow, trust-building follow-up cadence"),
  participant(47, "Lucas Meyer", "Chief methodology officer @ CarbonLedger", "Climate accounting", "Corporate controllers, supply-chain data platforms, assurance professionals", "Audit-ready carbon accounting methods and implementation lessons from complex manufacturers", "Align product and assurance teams on evidence requirements for Scope 3 automation", "Analytical moderator who is comfortable reconciling competing definitions", "Led assured inventories for 27 multinational companies and contributed to two sector guidance papers", "Deutsch, English, Continue by exchanging methodology notes before a scoped working session"),
  participant(48, "Emi Shibata", "Founder and sports physiotherapist @ MotionKind", "Digital wellness", "Employer benefits teams, wearable-data scientists, occupational health clinicians", "Return-to-work protocols and longitudinal mobility outcomes from 900 participants", "Validate a privacy-preserving movement coaching service with one employer", "Encouraging, practical and attentive to people who dislike competitive fitness settings", "Built a hybrid rehabilitation program that improved six-month adherence by 37%", "日本語, English, Prefer a short pilot intake form and fortnightly clinical review meetings"),
  participant(49, "Sara Al-Khalil", "Urban systems strategy lead @ CityMesh MENA", "Smart cities", "Transit agencies, civic-data platforms, inclusive mobility researchers", "Scenario-planning methods and access to municipal innovation teams in three Gulf cities", "Develop a resident-centered mobility data pilot with transparent governance", "Big-picture synthesizer who invites dissent before converging on a decision", "Designed a metropolitan mobility strategy covering 4.5 million residents and 12 agencies", "العربية, English, Send a stakeholder map and data-governance principles before a joint workshop"),
  participant(50, "Tomás Ferreira", "Autonomous systems founder @ Pelagic Robotics", "Ocean technology", "Port operators, marine insurers, perception engineers", "A field-tested inspection vehicle and annotated underwater infrastructure imagery", "Find a port partner for a twelve-week quay inspection deployment", "Adventurous builder who becomes meticulous when discussing safety cases", "Completed 160 autonomous inspection hours in high-current coastal environments", "Português, English, Follow up with operating conditions, insurance requirements, and a named field lead"),
  participant(51, "Min-jun Choi", "Vice president of operations @ ReCell Korea", "Battery recycling", "Automotive OEMs, cathode-material buyers, process-control startups", "Commercial recovery data and commissioning experience for hydrometallurgical lines", "Improve feedstock quality prediction before expanding the next processing line", "Results-oriented operator who prefers numbers, owners, and near-term experiments", "Raised nickel recovery by eight percentage points while cutting reagent consumption by 14%", "한국어, English, Share sample specifications and an experiment owner within 72 hours"),
  participant(52, "Zoë Fischer", "Investment director @ Linden Family Partners", "Family office investing", "Patient-capital founders, climate adaptation funds, governance advisors", "Long-duration capital and experience structuring mission protections through growth rounds", "Meet teams with credible unit economics and a ten-year view of category change", "Thoughtful, low-volume networker who values candor about uncertainty", "Built a direct-investment portfolio across regenerative agriculture, health access, and industrial efficiency", "English, Deutsch, Prefer one substantive quarterly update instead of frequent promotional messages"),
  // These twelve round out the fixed matching cohort. The last six deliberately
  // retain partial and minimal profiles so real AI shards see imperfect input.
  participant(53, "Lucía Navarro", "Clinical partnerships lead @ Synapse Garden", "Neurotechnology", "Rehabilitation hospitals, patient advocates, signal-processing researchers", "A clinician training protocol for non-invasive motor recovery systems", "Find an ethics-conscious hospital partner for a feasibility study", "Careful interdisciplinary bridge-builder who surfaces patient burden early", "Coordinated a multicenter neurorehabilitation study with 96 participants", "Español, English, Prefer a clinical synopsis and ethics checklist before introductions"),
  participant(54, "Sora Kim", "Creator economy strategist @ Studio Current", "Digital media", "Independent creators, membership-platform teams, brand partnership leads", "Revenue model diagnostics drawn from 70 creator businesses", "Test a cooperative sponsorship model that gives small creators more negotiating power", "Playful ideator who becomes structured when deciding experiments", "Helped a documentary collective triple recurring membership revenue without increasing publishing volume", "한국어, English, 日本語, Continue in a shared workspace with weekly written decisions"),
  participant(55, "Hiroshi Abe", "Mission integration manager @ Asteria Space", "Space technology", "Earth-observation customers, payload engineers, space-insurance specialists", "Launch interface knowledge and a hosted-payload opportunity on a small satellite", "Identify a commercially valuable climate-monitoring payload for the next mission window", "Methodical and safety-conscious; enjoys technical small groups", "Delivered integration and environmental testing for nine spacecraft payloads", "日本語, English, Follow up with mass, power, data-rate, and schedule assumptions"),
  participant(56, "Ananya Iyer", "Chief learning officer @ ShiftWorks", "Workforce development", "Manufacturing employers, vocational educators, frontline software teams", "Competency maps and multilingual learning content for shift-based workforces", "Co-design a supervisor development program that can be measured on the factory floor", "Energetic teacher who uses examples and checks for shared understanding", "Rolled out skills academies for 18,000 frontline employees across India", "English, हिन्दी, Prefer a cohort design workshop and monthly evidence reviews"),
  participant(57, "Ahmed El-Sayed", "Cold-chain operations founder @ FreshRoute", "Food logistics", "Grocery distributors, sensor companies, warehouse automation teams", "Temperature excursion data and operating access across urban fulfillment routes", "Reduce spoilage without adding manual scanning work for drivers", "Pragmatic operator who tells candid failure stories", "Cut produce waste by 17% across a network delivering 80,000 orders per month", "العربية, English, Begin with a route-level experiment and review results after four weeks"),
  participant(58, "Julia Novák", "Principal privacy engineer @ ConsentLayer", "Privacy engineering", "AI product owners, data protection officers, identity infrastructure teams", "Privacy threat modeling and implementable consent-state architectures", "Find product teams willing to measure whether privacy controls improve user trust", "Exacting but constructive; prefers diagrams over slogans", "Designed consent infrastructure supporting 35 million accounts across multiple jurisdictions", "Čeština, English, Exchange a data-flow map and retention schedule before a working call"),
  participant(59, "Kaito Mori", "Publishing partnerships manager @ Lantern Games", "Interactive entertainment", "Independent studios, localization producers, community safety leads", "Console publishing experience and relationships with Japanese localization teams", "Explore responsible market entry for a cooperative narrative game", "Curious and informal in small groups", "Coordinated launches for five independent titles across East Asia", ""),
  participant(60, "Isabel Costa", "Research fellow @ BioWeave Lab", "Biomaterials", "Packaging engineers, fermentation scale-up teams", "Bench samples of a seaweed-based barrier coating", "Find an industrial partner to validate shelf-life performance", "Quiet experimentalist", "", "Português, English"),
  participant(61, "Rohan Gupta", "Revenue AI product lead @ ClearQuota", "B2B software", "Sales operations leaders, responsible AI reviewers", "Workflow prototypes for evidence-linked account planning", "", "Structured challenger", "", "English, हिन्दी"),
  participant(62, "Eri Nishida", "Independent curator @ Field Notes Tokyo", "Arts and culture", "Community venue operators, cultural funders", "Curatorial experience with neighborhood archives", "", "Reflective listener", "", "日本語"),
  participant(63, "Binta Diop", "SME finance analyst @ Teranga Cooperative", "Inclusive finance", "", "", "", "", "", "Français"),
  participant(64, "Théo Martin", "Spatial audio designer @ Resonant Room", "", "", "", "", "", "", ""),
] as const satisfies readonly EventOperationsSeedParticipantDefinition[];

/**
 * Lifecycle-only histories. They have credentials and canonical registration
 * versions, but their cancelled terminal state keeps the active directory and
 * immutable matching cohort fixed at exactly 64 people.
 */
export const EVENT_OPERATIONS_E2E_LIFECYCLE_FIXTURES = [
  participant(65, "Mao Ueda", "Corporate development associate @ Kiyora Mobility", "Mobility services", "Fleet operators, charging infrastructure teams", "Commercial diligence notes from shared-mobility pilots", "Understand why fleet electrification partnerships stall after procurement", "Careful observer", "Reviewed eleven mobility partnership cases across Japan", "日本語, English, Prefer a short written debrief", "cancelled"),
  participant(66, "Kwame Boateng", "Senior treasury manager @ Coastline Foods", "Food manufacturing", "Working-capital platforms, commodity risk advisers", "Buyer-side knowledge of seasonal inventory financing", "Compare non-dilutive finance options for a new processing line", "Practical and numbers-first", "Restructured supplier payment terms across four production sites", "English, Twi, Follow up with a quantified term sheet", "cancelled"),
  participant(67, "Marina Volkova", "Program manager @ NorthWind Research", "Climate research", "Open-data maintainers, Arctic logistics operators", "Field coordination experience and a polar observation dataset", "Find a durable host for a cross-border environmental data commons", "Reflective small-group contributor", "Coordinated five international field seasons with shared data protocols", "Русский, English, Prefer an asynchronous technical review", "cancelled"),
  participant(68, "Chen Yu-Ting", "Product counsel @ HarborPay", "Financial technology", "Privacy engineers, payments compliance leaders", "A comparative analysis of wallet consent requirements", "Identify a privacy-by-design reviewer for a regional wallet release", "Concise and evidence-led", "Supported launches in three regulated payment markets", "中文, English, Exchange a compliance checklist first", "cancelled", "late"),
  participant(69, "Youssef Benali", "Operations architect @ SunRoute Transit", "Public transport", "Scheduling scientists, depot electrification operators", "Bus depot operating data and transition constraints", "Stress-test an electric fleet scheduling prototype", "Direct operational problem-solver", "Planned a 120-bus depot transition without reducing peak service", "العربية, Français, English, Prefer a scenario workshop", "cancelled", "late"),
  participant(70, "Maeve O'Connell", "Community investment lead @ CommonGround Trust", "Place-based investing", "Local enterprise funds, measurement practitioners", "A community governance model for patient capital", "Compare ways to preserve resident voice as funds scale", "Warm deliberative facilitator", "Structured two resident-led funds with independent investment committees", "English, Prefer a facilitated follow-up with clear decision rights", "cancelled", "late"),
] as const satisfies readonly EventOperationsSeedParticipantDefinition[];

export const EVENT_OPERATIONS_E2E_SEED_ACCOUNTS = [
  ...EVENT_OPERATIONS_E2E_PARTICIPANTS,
  ...EVENT_OPERATIONS_E2E_LIFECYCLE_FIXTURES,
] as const satisfies readonly EventOperationsSeedParticipantDefinition[];

export interface SeedEventOperationsE2EInput {
  event: {
    description: string;
    endsAt: string;
    id: string;
    startsAt: string;
    title: string;
    venue: string;
  };
  now?: () => string;
  organizerActorId: string;
  operationsRepository: EventOperationsRepository;
  participants: readonly (EventOperationsSeedParticipantDefinition & { actorId: string })[];
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface SeedEventOperationsE2EResult {
  configuration: EventOperationsConfiguration;
  eventId: string;
  organizerActorId: string;
  participantCount: number;
  registrationHistoryCount: number;
  resetCollections: readonly string[];
}

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

function noSideEffects(): EventRegistration["sideEffects"] {
  return {
    calendarUpdateExecuted: false,
    emailSent: false,
    globalProfileWriteExecuted: false,
    notificationDelivered: false,
    organizerMessageSent: false,
    refundRequested: false,
  };
}

async function resetExactEventScope(input: {
  deletedAt: string;
  eventId: string;
  operationsRepository: EventOperationsRepository;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<string[]> {
  const collections = [EVENT_REGISTRATION_COLLECTION];
  for (const collectionName of collections) {
    const records = await input.store.listRecords({
      collectionName,
      targetId: input.eventId,
      targetType: "event",
      workspaceId: input.workspaceId,
    });
    for (const record of records) {
      await input.store.deleteRecord({
        collectionName,
        deletedAt: input.deletedAt,
        recordId: record.recordId,
        workspaceId: input.workspaceId,
      });
    }
  }
  await input.operationsRepository.resetEventForSeed(input.eventId);
  return [EVENT_REGISTRATION_COLLECTION, ...Object.values(EVENT_OPERATIONS_COLLECTIONS)];
}

export async function seedEventOperationsE2E({
  event,
  now = () => new Date().toISOString(),
  organizerActorId,
  operationsRepository,
  participants,
  store,
  workspaceId,
}: SeedEventOperationsE2EInput): Promise<SeedEventOperationsE2EResult> {
  if (!organizerActorId.trim()) throw new Error("organizerActorId is required.");
  const matchingCohort = participants.filter(
    (value) =>
      value.registrationStatus === "rsvped" &&
      value.registrationTiming === "on_time",
  );
  const cancelledFixtures = participants.filter(
    (value) => value.registrationStatus === "cancelled",
  );
  const lateFixtures = participants.filter(
    (value) => value.registrationTiming === "late",
  );
  if (
    participants.length !== 70 ||
    matchingCohort.length !== 64 ||
    cancelledFixtures.length !== 6 ||
    lateFixtures.length !== 3
  ) {
    throw new Error(
      "The event-operations E2E seed requires 64 on-time active participants plus 6 cancelled lifecycle fixtures, including 3 late histories.",
    );
  }
  if (new Set(participants.map((value) => value.actorId)).size !== participants.length) {
    throw new Error("Every seeded participant must have a distinct actorId.");
  }
  if (event.id !== EVENT_OPERATIONS_E2E_EVENT_ID) {
    throw new Error(
      `The full-flow fixture must enrich the public catalogue event ${EVENT_OPERATIONS_E2E_EVENT_ID}.`,
    );
  }
  const seededAt = now();
  const base = Date.parse(seededAt);
  if (!Number.isFinite(base)) throw new Error("The seed clock must return an ISO timestamp.");
  const startsAtMs = Date.parse(event.startsAt);
  const endsAtMs = Date.parse(event.endsAt);
  if (
    !Number.isFinite(startsAtMs) ||
    !Number.isFinite(endsAtMs) ||
    endsAtMs - startsAtMs < 75 * 60_000
  ) {
    throw new Error(
      "The public full-flow event must provide a valid window of at least 75 minutes.",
    );
  }
  const eventId = event.id;
  const resultsAtMs = Math.min(base, startsAtMs);
  const resetCollections = await resetExactEventScope({
    deletedAt: seededAt,
    eventId,
    operationsRepository,
    store,
    workspaceId,
  });
  const startsAt = new Date(startsAtMs).toISOString();
  const endsAt = new Date(endsAtMs).toISOString();
  const eventEvidenceId = `evidence:${eventId}:seed`;

  await store.upsertRecord({
    collectionName: EVENTS_LIVE_RECORD_COLLECTION,
    createdAt: at(base, -10_080),
    evidenceIds: [eventEvidenceId],
    lifecycleState: "active",
    occurredAt: startsAt,
    payload: {
      description: event.description,
      endsAt,
      evidence: [{ capturedAt: seededAt, createdBy: organizerActorId, evidenceId: eventEvidenceId, excerpt: "Explicit event-operations E2E seed." }],
      nextAction: "Complete registration preparation, then use the attendee workspace from the public event detail.",
      recommendedPreparation: "Review participant profiles and the published matching schedule before arrival.",
      relationshipContext: event.description,
      startsAt,
      status: "confirmed",
      title: event.title,
      venue: event.venue,
    },
    provider: "event-operations-e2e-seed",
    providerRecordId: eventId,
    recordId: eventId,
    searchText: `${event.title} ${event.venue} event operations`,
    sourceId: `source:${eventId}:seed`,
    sourceLabel: "Explicit event-operations E2E seed",
    sourceType: "manual",
    targetId: eventId,
    targetType: "event",
    updatedAt: seededAt,
    userId: organizerActorId,
    workspaceId,
  });

  const registrationProvider = createEventRegistrationLiveRecordProvider({
    now: () => seededAt,
    source: "event-operations-e2e-seed",
    store,
    workspaceId,
  });
  const shadowRegistrations: EventRegistration[] = [];
  for (const definition of participants) {
    const registeredAt = at(
      resultsAtMs,
      definition.registrationTiming === "late" ? -5 : -120,
    );
    const cancelledAt =
      definition.registrationStatus === "cancelled"
        ? at(resultsAtMs, definition.registrationTiming === "late" ? -2 : -40)
        : null;
    const updatedAt = cancelledAt ?? registeredAt;
    const id = eventRegistrationId(eventId, definition.actorId);
    const participantProfileId = `event-participant-profile:${encodeURIComponent(eventId)}:${encodeURIComponent(definition.actorId)}`;
    shadowRegistrations.push(await registrationProvider.saveRegistration({
      cancelledAt,
      eventId,
      id,
      participantProfile: {
        answers: { ...definition.answers },
        createdAt: registeredAt,
        displayName: definition.displayName,
        eventId,
        id: participantProfileId,
        updatedAt: registeredAt,
        userId: definition.actorId,
      },
      participantProfileId,
      reactivatedAt: null,
      registeredAt,
      sideEffects: noSideEffects(),
      status: definition.registrationStatus,
      updatedAt,
      userId: definition.actorId,
    }));
  }

  const configuration = await operationsRepository.saveConfiguration({
    checkInOpensAt: at(startsAtMs, -60),
    eventEndsAt: endsAt,
    eventId,
    eventStartsAt: startsAt,
    maxAttemptsPerTask: 3,
    organizerActorId,
    profileEditDeadlineAt: at(resultsAtMs, -10),
    recommendationCount: 4,
    registrationCutoffAt: at(resultsAtMs, -5),
    resultsAvailableAt: at(resultsAtMs, 0),
    roundOneStartsAt: at(startsAtMs, 15),
    roundTwoStartsAt: at(startsAtMs, 60),
    shardSize: 6,
    tableSize: 6,
    updatedAt: seededAt,
  });
  await operationsRepository.activateCanonicalRegistrations(
    eventId,
    shadowRegistrations,
  );

  return {
    configuration,
    eventId,
    organizerActorId,
    participantCount: matchingCohort.length,
    registrationHistoryCount: participants.length,
    resetCollections,
  };
}
