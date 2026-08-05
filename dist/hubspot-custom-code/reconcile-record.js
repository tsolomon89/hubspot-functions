"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/custom-code-actions/reconcile-record.ts
var reconcile_record_exports = {};
__export(reconcile_record_exports, {
  main: () => main,
  processHubSpotCustomCodeAction: () => processHubSpotCustomCodeAction
});
module.exports = __toCommonJS(reconcile_record_exports);

// packages/commercial-kernel/evaluator.ts
var UNIVERSAL_MINIMUM_GOALS = {
  MQL: [
    {
      key: "universal_mql_communication_channel",
      name: "Identifiable subject with usable communication channel",
      predicate: "anyCommunicationChannel",
      scope: "relationship",
      universal: true
    }
  ],
  SQL: [
    {
      key: "universal_sql_offering_known",
      name: "Intended commercial offering or proposition is known",
      predicate: "offeringKnown",
      scope: "opportunity",
      universal: true
    }
  ],
  FTP: [
    {
      key: "universal_ftp_first_transaction",
      name: "First transaction in relationship is complete",
      predicate: "transactionExists",
      scope: "opportunity",
      universal: true
    }
  ],
  RTP: [
    {
      key: "universal_rtp_subsequent_transaction",
      name: "Subsequent transaction complete after preceding completion boundary",
      predicate: "transactionExists",
      scope: "sincePredecessorCompletion",
      universal: true
    }
  ]
};
function injectUniversalGoals(config) {
  const mergedGoals = {
    MQL: [...UNIVERSAL_MINIMUM_GOALS.MQL],
    SQL: [...UNIVERSAL_MINIMUM_GOALS.SQL],
    FTP: [...UNIVERSAL_MINIMUM_GOALS.FTP],
    RTP: [...UNIVERSAL_MINIMUM_GOALS.RTP]
  };
  for (const oppType of ["MQL", "SQL", "FTP", "RTP"]) {
    const customGoals = config.goalsByOpportunityType?.[oppType] || [];
    for (const custom of customGoals) {
      if (!mergedGoals[oppType].some((g) => g.key === custom.key)) {
        mergedGoals[oppType].push(custom);
      }
    }
  }
  return {
    ...config,
    goalsByOpportunityType: mergedGoals
  };
}
function parseInstant(val) {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const parsed = Date.parse(val);
  return isNaN(parsed) ? 0 : parsed;
}
function evaluateSinglePredicate(predicateName, params, scope, snapshot, matchingEvidence) {
  switch (predicateName) {
    case "manualReview": {
      const isTriggered = snapshot.facts[params?.property] === true || params?.forceReview === true;
      return { satisfied: !isTriggered, manualReviewRequired: isTriggered, evidenceRefs: isTriggered ? ["fact_manual_review"] : [] };
    }
    case "hasIdentity":
    case "anyCommunicationChannel": {
      const email = snapshot.facts.email || snapshot.facts.contactEmail || snapshot.subject.kind === "CONTACT" && snapshot.subject.email;
      const phone = snapshot.facts.phone || snapshot.subject.kind === "CONTACT" && snapshot.subject.phone;
      const satisfied = Boolean(email && String(email).trim() !== "" || phone && String(phone).trim() !== "");
      return { satisfied, evidenceRefs: satisfied ? ["fact_communication_channel"] : [] };
    }
    case "marketingConsent": {
      const satisfied = snapshot.facts.marketingConsent === true;
      return { satisfied, evidenceRefs: satisfied ? ["fact_marketing_consent"] : [] };
    }
    case "hasOfferingInterest":
    case "offeringKnown": {
      const hasSnapshotOfferings = Boolean(snapshot.offerings && snapshot.offerings.length > 0);
      const products = snapshot.facts.products || snapshot.facts.offeringKeys || snapshot.facts.offering || snapshot.facts.lineItems;
      const hasOfferingFact = Array.isArray(products) ? products.length > 0 : Boolean(products);
      const evMatches = matchingEvidence.filter((e) => e.predicate === "offeringKnown" || e.data?.productKey || e.data?.offeringKey);
      const satisfied = hasSnapshotOfferings || hasOfferingFact || evMatches.length > 0;
      const refs = evMatches.map((e) => e.id);
      if (hasSnapshotOfferings || hasOfferingFact) refs.push("fact_offering_known");
      return { satisfied, evidenceRefs: refs };
    }
    case "activityExists": {
      const activityType = params?.activityType;
      const requiredOutcome = params?.outcome;
      const evMatches = matchingEvidence.filter((e) => {
        if (activityType && e.data?.activityType !== activityType) return false;
        if (requiredOutcome && e.data?.outcome !== requiredOutcome) return false;
        return true;
      });
      return { satisfied: evMatches.length > 0, evidenceRefs: evMatches.map((e) => e.id) };
    }
    case "associationExists": {
      const objectType = params?.objectType;
      const evMatches = matchingEvidence.filter((e) => e.data?.associatedObjectType === objectType || e.predicate === "associationExists");
      return { satisfied: evMatches.length > 0, evidenceRefs: evMatches.map((e) => e.id) };
    }
    case "transactionComplete":
    case "transactionExists": {
      const evMatches = matchingEvidence.filter((e) => e.predicate === "transactionExists" || e.data?.transactionId || e.data?.orderId);
      let hasFactTransaction = false;
      if (snapshot.facts.transactionCompleted === true || snapshot.facts.stage === "closedwon" || snapshot.opportunityState === "WON") {
        const factTxTime = parseInstant(snapshot.facts.transactionCompletedAt || snapshot.openedAt);
        if (scope === "sincePredecessorCompletion") {
          const predTime = parseInstant(snapshot.predecessorCompletedAt);
          hasFactTransaction = Boolean(predTime > 0 && factTxTime >= predTime);
        } else {
          hasFactTransaction = true;
        }
      }
      const satisfied = hasFactTransaction || evMatches.length > 0;
      const refs = evMatches.map((e) => e.id);
      if (hasFactTransaction) refs.push("fact_transaction_completed");
      return { satisfied, evidenceRefs: refs };
    }
    case "count": {
      const targetPredicate = params?.targetPredicate;
      const minCount = Number(params?.minCount ?? 1);
      const maxCount = params?.maxCount !== void 0 ? Number(params.maxCount) : Infinity;
      const filtered = matchingEvidence.filter((e) => e.predicate === targetPredicate);
      const count = filtered.length;
      const satisfied = count >= minCount && count <= maxCount;
      return { satisfied, evidenceRefs: satisfied ? filtered.map((e) => e.id) : [] };
    }
    case "property": {
      const propName = params?.property;
      const val = snapshot.facts[propName];
      let satisfied = false;
      if (params?.equals !== void 0) {
        satisfied = val === params.equals;
      } else if (params?.notEquals !== void 0) {
        satisfied = val !== params.notEquals;
      } else if (params?.greaterThan !== void 0) {
        satisfied = typeof val === "number" && val > Number(params.greaterThan);
      } else if (params?.lessThan !== void 0) {
        satisfied = typeof val === "number" && val < Number(params.lessThan);
      } else if (params?.in !== void 0 && Array.isArray(params.in)) {
        satisfied = params.in.includes(val);
      } else if (params?.contains !== void 0 && typeof val === "string") {
        satisfied = val.includes(String(params.contains));
      } else if (params?.isTruthy) {
        satisfied = Boolean(val);
      } else if (params?.isFalsy) {
        satisfied = !val;
      }
      return { satisfied, evidenceRefs: satisfied ? [`fact_prop_${propName}`] : [] };
    }
    default:
      throw new Error(`UNKNOWN_PREDICATE_ERROR: Evaluator received unsupported predicate '${predicateName}'`);
  }
}
function evaluatePredicate(goal, snapshot) {
  const openedAtInstant = parseInstant(snapshot.openedAt);
  const predecessorCompletedAtInstant = parseInstant(snapshot.predecessorCompletedAt);
  const matchingEvidence = snapshot.evidence.filter((ev) => {
    const evInstant = parseInstant(ev.occurredAt);
    if (goal.scope === "opportunity" && openedAtInstant > 0 && evInstant < openedAtInstant) {
      return false;
    }
    if (goal.scope === "sincePredecessorCompletion") {
      if (!predecessorCompletedAtInstant || evInstant < predecessorCompletedAtInstant) {
        return false;
      }
    }
    return true;
  });
  if (goal.predicate === "all") {
    const subGoals = goal.conditions || [];
    const allRefs = [];
    for (const sub of subGoals) {
      const res = evaluatePredicate(sub, snapshot);
      if (res.manualReviewRequired) return { satisfied: false, manualReviewRequired: true, evidenceRefs: [] };
      if (!res.satisfied) return { satisfied: false, evidenceRefs: [] };
      allRefs.push(...res.evidenceRefs);
    }
    return { satisfied: true, evidenceRefs: allRefs };
  }
  if (goal.predicate === "any") {
    const subGoals = goal.conditions || [];
    const allRefs = [];
    for (const sub of subGoals) {
      const res = evaluatePredicate(sub, snapshot);
      if (res.satisfied) {
        allRefs.push(...res.evidenceRefs);
        return { satisfied: true, evidenceRefs: allRefs };
      }
    }
    return { satisfied: false, evidenceRefs: [] };
  }
  if (goal.predicate === "not") {
    const subGoals = goal.conditions || [];
    if (subGoals.length === 0) return { satisfied: false, evidenceRefs: [] };
    const res = evaluatePredicate(subGoals[0], snapshot);
    return { satisfied: !res.satisfied, evidenceRefs: res.satisfied ? [] : ["fact_not_satisfied"] };
  }
  return evaluateSinglePredicate(goal.predicate, goal.params, goal.scope, snapshot, matchingEvidence);
}
function evaluateOpportunity(snapshot, config) {
  if (config.featureFlags?.automationSuppressed || snapshot.facts.automationSuppressed === true) {
    return {
      qualificationState: "BLOCKED",
      satisfiedGoalKeys: [],
      unsatisfiedGoalKeys: [],
      evidenceRefsByGoal: {},
      evaluatedConfigVersion: config.configVersion
    };
  }
  const mergedConfig = injectUniversalGoals(config);
  const goals = mergedConfig.goalsByOpportunityType[snapshot.opportunityType] || [];
  const satisfiedGoalKeys = [];
  const unsatisfiedGoalKeys = [];
  const evidenceRefsByGoal = {};
  let manualReviewNeeded = false;
  for (const goal of goals) {
    const res = evaluatePredicate(goal, snapshot);
    evidenceRefsByGoal[goal.key] = res.evidenceRefs;
    if (res.manualReviewRequired) {
      manualReviewNeeded = true;
    }
    if (res.satisfied) {
      satisfiedGoalKeys.push(goal.key);
    } else {
      unsatisfiedGoalKeys.push(goal.key);
    }
  }
  let qualificationState = "PENDING";
  if (manualReviewNeeded) {
    qualificationState = "MANUAL_REVIEW";
  } else if (unsatisfiedGoalKeys.length === 0) {
    qualificationState = "SATISFIED";
  } else {
    qualificationState = "PENDING";
  }
  return {
    qualificationState,
    satisfiedGoalKeys,
    unsatisfiedGoalKeys,
    evidenceRefsByGoal,
    evaluatedConfigVersion: config.configVersion
  };
}

// packages/commercial-kernel/planner.ts
var SUPPORTED_PREDICATES = /* @__PURE__ */ new Set([
  "anyCommunicationChannel",
  "property",
  "associationExists",
  "activityExists",
  "offeringKnown",
  "transactionExists",
  "count",
  "all",
  "any",
  "not",
  "manualReview",
  "hasIdentity",
  "marketingConsent",
  "hasOfferingInterest",
  "transactionComplete"
]);
function validateGoal(goal, path, errors) {
  if (!goal.key) errors.push(`${path}: Missing goal key`);
  if (!goal.predicate) errors.push(`${path}: Missing predicate`);
  if (goal.predicate && !SUPPORTED_PREDICATES.has(goal.predicate)) {
    errors.push(`${path}: Unsupported predicate '${goal.predicate}'`);
  }
  if (["all", "any", "not"].includes(goal.predicate) && goal.conditions) {
    goal.conditions.forEach((sub, i) => validateGoal(sub, `${path}.conditions[${i}]`, errors));
  }
}
function validateCommercialModel(config) {
  const errors = [];
  if (!config.organizationKey) errors.push("Missing organizationKey");
  if (!config.configVersion) errors.push("Missing configVersion");
  if (!config.relationshipType) errors.push("Missing relationshipType");
  if (!config.goalsByOpportunityType) {
    errors.push("Missing goalsByOpportunityType");
  } else {
    for (const oppType of ["MQL", "SQL", "FTP", "RTP"]) {
      if (!Array.isArray(config.goalsByOpportunityType[oppType])) {
        errors.push(`goalsByOpportunityType.${oppType} must be an array`);
      } else {
        config.goalsByOpportunityType[oppType].forEach((g, i) => {
          validateGoal(g, `goalsByOpportunityType.${oppType}[${i}]`, errors);
        });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
function deriveSuccessorKey(relationshipKey, successorType, cycleIndex) {
  if (successorType === "MQL" || successorType === "SQL") {
    return `${relationshipKey}::LEAD::1`;
  }
  return `${relationshipKey}::${successorType}::${cycleIndex}`;
}
function planTransition(snapshot, evaluation, config, nowInstant) {
  const currentNow = nowInstant || (/* @__PURE__ */ new Date()).toISOString();
  if (snapshot.opportunityState === "LOST") {
    return [{ kind: "NOOP", reason: "Opportunity is LOST" }];
  }
  if (config.featureFlags?.automationSuppressed) {
    return [{ kind: "NOOP", reason: "Automation suppressed by organization kill switch" }];
  }
  if (evaluation.qualificationState === "BLOCKED") {
    return [{ kind: "NOOP", reason: "Opportunity qualification is BLOCKED" }];
  }
  if (evaluation.qualificationState === "MANUAL_REVIEW") {
    return [{
      kind: "CREATE_MANUAL_REVIEW",
      opportunityKey: snapshot.opportunityKey,
      reason: "Opportunity requires human manual review",
      subject: snapshot.subject
    }];
  }
  if (evaluation.qualificationState !== "SATISFIED") {
    const currentLeadStage = snapshot.opportunityType === "MQL" ? "mql" : "sql";
    const currentDealStage = snapshot.facts.stage ? String(snapshot.facts.stage) : "open";
    return [{
      kind: "UPDATE_OPPORTUNITY",
      opportunityKey: snapshot.opportunityKey,
      newState: "OPEN",
      qualificationState: "PENDING",
      details: {
        unsatisfiedGoalKeys: evaluation.unsatisfiedGoalKeys,
        targetLeadStage: currentLeadStage,
        targetDealStage: currentDealStage,
        offerings: snapshot.offerings
      }
    }];
  }
  const intents = [];
  if (snapshot.opportunityType === "MQL") {
    intents.push({
      kind: "UPDATE_OPPORTUNITY",
      opportunityKey: snapshot.opportunityKey,
      newState: "OPEN",
      qualificationState: "SATISFIED",
      details: {
        targetOpportunityType: "SQL",
        targetLeadStage: "sql",
        mqlCompletedAt: currentNow,
        offerings: snapshot.offerings
      }
    });
    intents.push({
      kind: "PROJECT_LIFECYCLE_STAGE",
      subject: snapshot.subject,
      stage: "marketingqualifiedlead"
    });
  } else if (snapshot.opportunityType === "SQL") {
    intents.push({
      kind: "UPDATE_OPPORTUNITY",
      opportunityKey: snapshot.opportunityKey,
      newState: "WON",
      qualificationState: "SATISFIED",
      details: { targetLeadStage: "qualified", offerings: snapshot.offerings }
    });
    intents.push({
      kind: "PROJECT_LIFECYCLE_STAGE",
      subject: snapshot.subject,
      stage: "salesqualifiedlead"
    });
    const successorKey = deriveSuccessorKey(snapshot.relationshipKey, "FTP", 1);
    intents.push({
      kind: "CREATE_SUCCESSOR",
      predecessorKey: snapshot.opportunityKey,
      successorKey,
      successorType: "FTP",
      cycleIndex: 1,
      subject: snapshot.subject,
      offerings: snapshot.offerings,
      predecessorCompletedAt: snapshot.mqlCompletedAt || currentNow
    });
  } else if (snapshot.opportunityType === "FTP") {
    intents.push({
      kind: "UPDATE_OPPORTUNITY",
      opportunityKey: snapshot.opportunityKey,
      newState: "WON",
      qualificationState: "SATISFIED",
      details: { targetDealStage: "closedwon" }
    });
    intents.push({
      kind: "PROJECT_LIFECYCLE_STAGE",
      subject: snapshot.subject,
      stage: "customer"
    });
    const successorKey = deriveSuccessorKey(snapshot.relationshipKey, "RTP", 1);
    const rtpOfferings = config.offeringPolicy?.rtpPolicy === "emptyUntilKnown" ? [] : snapshot.offerings || [];
    intents.push({
      kind: "CREATE_SUCCESSOR",
      predecessorKey: snapshot.opportunityKey,
      successorKey,
      successorType: "RTP",
      cycleIndex: 1,
      subject: snapshot.subject,
      offerings: rtpOfferings,
      predecessorCompletedAt: snapshot.facts.closedAt || currentNow
    });
  } else if (snapshot.opportunityType === "RTP") {
    intents.push({
      kind: "UPDATE_OPPORTUNITY",
      opportunityKey: snapshot.opportunityKey,
      newState: "WON",
      qualificationState: "SATISFIED",
      details: { targetDealStage: "closedwon" }
    });
    intents.push({
      kind: "PROJECT_LIFECYCLE_STAGE",
      subject: snapshot.subject,
      stage: "customer"
    });
    const nextCycle = (snapshot.cycleIndex || 1) + 1;
    const successorKey = deriveSuccessorKey(snapshot.relationshipKey, "RTP", nextCycle);
    const rtpOfferings = config.offeringPolicy?.rtpPolicy === "emptyUntilKnown" ? [] : snapshot.offerings || [];
    intents.push({
      kind: "CREATE_SUCCESSOR",
      predecessorKey: snapshot.opportunityKey,
      successorKey,
      successorType: "RTP",
      cycleIndex: nextCycle,
      subject: snapshot.subject,
      offerings: rtpOfferings,
      predecessorCompletedAt: snapshot.facts.closedAt || currentNow
    });
  }
  return intents;
}

// packages/domain/embedded-configs.ts
var EMBEDDED_INSTALLATIONS = {
  "149041124": {
    "executionPortalId": 149041124,
    "accountRole": "developer-test",
    "organizationKey": "org_global_corp",
    "allowedRelationshipTypes": [
      "b2b",
      "b2c"
    ],
    "defaultRelationshipType": "b2b",
    "expectedConfigVersion": "1.0.0"
  }
};
var EMBEDDED_CONFIGS = {
  "org_global_corp:b2b": {
    "organizationKey": "org_global_corp",
    "configVersion": "1.0.0",
    "relationshipType": "b2b",
    "hubspotPipelines": {
      "leadPipelineId": "b2b_qualification_lead_pipeline",
      "dealPipelineId": "b2b_transaction_deal_pipeline",
      "dealStageProbabilities": {
        "open": 0.2,
        "closedwon": 1,
        "closedlost": 0
      }
    },
    "offeringPolicy": {
      "productOfferingKeyProperty": "hs_sku",
      "rtpPolicy": "carryForward"
    },
    "goalsByOpportunityType": {
      "MQL": [
        {
          "key": "b2b_marketing_consent",
          "name": "Explicit marketing consent",
          "predicate": "property",
          "scope": "relationship",
          "params": {
            "property": "marketingConsent",
            "equals": true
          }
        }
      ],
      "SQL": [
        {
          "key": "b2b_positive_meeting",
          "name": "Completed positive meeting outcome",
          "predicate": "activityExists",
          "scope": "opportunity",
          "params": {
            "activityType": "MEETING",
            "outcome": "COMPLETED"
          }
        }
      ],
      "FTP": [
        {
          "key": "b2b_deal_closed_won",
          "name": "First B2B transaction deal closed won",
          "predicate": "transactionExists",
          "scope": "opportunity"
        }
      ],
      "RTP": [
        {
          "key": "b2b_deal_closed_won_repeat",
          "name": "Subsequent B2B transaction deal closed won",
          "predicate": "transactionExists",
          "scope": "sincePredecessorCompletion"
        }
      ]
    },
    "featureFlags": {
      "automationSuppressed": false,
      "dryRunTransactions": false
    }
  },
  "org_global_corp:b2c": {
    "organizationKey": "org_global_corp",
    "configVersion": "1.0.0",
    "relationshipType": "b2c",
    "hubspotPipelines": {
      "leadPipelineId": "b2c_qualification_lead_pipeline",
      "dealPipelineId": "b2c_transaction_deal_pipeline",
      "dealStageProbabilities": {
        "open": 0.5,
        "closedwon": 1,
        "closedlost": 0
      }
    },
    "offeringPolicy": {
      "productOfferingKeyProperty": "hs_sku",
      "rtpPolicy": "emptyUntilKnown"
    },
    "goalsByOpportunityType": {
      "MQL": [],
      "SQL": [
        {
          "key": "b2c_cart_interest",
          "name": "B2C cart interest or offering proposition",
          "predicate": "offeringKnown",
          "scope": "opportunity"
        }
      ],
      "FTP": [
        {
          "key": "b2c_deal_closed_won",
          "name": "First B2C transaction deal closed won",
          "predicate": "transactionExists",
          "scope": "opportunity"
        }
      ],
      "RTP": [
        {
          "key": "b2c_deal_closed_won_repeat",
          "name": "Repeat B2C transaction deal closed won",
          "predicate": "transactionExists",
          "scope": "sincePredecessorCompletion"
        }
      ]
    },
    "featureFlags": {
      "automationSuppressed": false,
      "dryRunTransactions": true
    }
  }
};

// packages/domain/config-resolver.ts
var OrganizationConfigResolver = class _OrganizationConfigResolver {
  static resolveConfigByPortalId(portalId, options) {
    return new _OrganizationConfigResolver().resolveConfig({ portalId, ...options });
  }
  resolvePortalInstallation(portalId) {
    if (!portalId) return null;
    const strPortalId = String(portalId).trim();
    if (EMBEDDED_INSTALLATIONS[strPortalId]) {
      return EMBEDDED_INSTALLATIONS[strPortalId];
    }
    return null;
  }
  resolveConfig(options) {
    if (!options.portalId && !options.organizationKey) {
      throw new Error("MISSING_RESOLVER_INPUT: Must supply either portalId or organizationKey to resolve configuration");
    }
    let installation = null;
    if (options.portalId) {
      installation = this.resolvePortalInstallation(options.portalId);
      if (!installation) {
        throw new Error(`UNSUPPORTED_PORTAL: Portal '${options.portalId}' is not registered in portal-installations.yaml`);
      }
      if (!options.bypassAccountRoleGuard && installation.accountRole && installation.accountRole !== "developer-test") {
        throw new Error(`NON_DEVELOPER_TEST_PORTAL_MUTATION_GUARD: Portal '${options.portalId}' role is '${installation.accountRole}', expected 'developer-test'`);
      }
    }
    let orgKey = options.organizationKey;
    if (installation) {
      if (orgKey && orgKey !== installation.organizationKey) {
        throw new Error(`ORGANIZATION_MISMATCH: Provided organizationKey '${orgKey}' does not match portal installation '${installation.organizationKey}'`);
      }
      orgKey = installation.organizationKey;
    }
    let relType = options.relationshipType ? options.relationshipType.trim().toLowerCase() : void 0;
    if (!relType) {
      if (installation?.defaultRelationshipType) {
        relType = installation.defaultRelationshipType;
      } else {
        throw new Error(`MISSING_RELATIONSHIP_TYPE: Relationship type not specified and no default defined for organization '${orgKey}'`);
      }
    }
    if (installation?.allowedRelationshipTypes && !installation.allowedRelationshipTypes.includes(relType)) {
      throw new Error(`UNALLOWED_RELATIONSHIP_TYPE: Relationship type '${relType}' is not allowed for portal '${options.portalId}' (allowed: ${installation.allowedRelationshipTypes.join(", ")})`);
    }
    const embeddedKey = `${orgKey}:${relType}`;
    if (EMBEDDED_CONFIGS[embeddedKey]) {
      const raw = EMBEDDED_CONFIGS[embeddedKey];
      const config = {
        organizationKey: raw.organizationKey || orgKey,
        configVersion: raw.configVersion || "1.0.0",
        relationshipType: raw.relationshipType || relType,
        goalsByOpportunityType: raw.goalsByOpportunityType || { MQL: [], SQL: [], FTP: [], RTP: [] },
        hubspotPipelines: raw.hubspotPipelines,
        offeringPolicy: raw.offeringPolicy,
        featureFlags: raw.featureFlags || {}
      };
      const valRes = validateCommercialModel(config);
      if (valRes.valid) return config;
      throw new Error(`INVALID_ORGANIZATION_CONFIG: Configuration '${embeddedKey}' failed validation: ${valRes.errors.join(", ")}`);
    }
    throw new Error(`UNSUPPORTED_RELATIONSHIP_TYPE: Qualification configuration for '${orgKey}:${relType}' was not found`);
  }
};

// packages/hubspot-adapter/adapter.ts
var import_api_client = require("@hubspot/api-client");

// packages/observability/index.ts
var Logger = class {
  serviceName;
  constructor(serviceName) {
    this.serviceName = serviceName;
  }
  info(message, context) {
    console.log(JSON.stringify(this.format("INFO", message, context)));
  }
  error(message, error, context) {
    const errorDetails = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
    console.error(JSON.stringify(this.format("ERROR", message, { ...context, error: errorDetails })));
  }
  warn(message, context) {
    console.warn(JSON.stringify(this.format("WARN", message, context)));
  }
  format(level, message, context) {
    return {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      service: this.serviceName,
      level,
      message,
      context: context ? this.redact(context) : void 0
    };
  }
  redact(obj) {
    if (obj === null || obj === void 0) return obj;
    if (typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      return obj.map((item) => this.redact(item));
    }
    const redacted = {};
    const sensitiveKeys = [
      "token",
      "access_token",
      "client_secret",
      "authorization",
      "password",
      "secret",
      "clientsecret",
      "auth"
    ];
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
        redacted[key] = "[REDACTED]";
      } else if (typeof value === "object") {
        redacted[key] = this.redact(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }
};
var logger = new Logger("hubspot-functions");

// packages/hubspot-adapter/adapter.ts
function parseHubSpotTimestamp(val) {
  if (!val) return null;
  if (typeof val === "number") {
    return new Date(val).toISOString();
  }
  const str = String(val).trim();
  if (!str) return null;
  if (!isNaN(Number(str))) {
    const num = Number(str);
    const date2 = new Date(num);
    if (!isNaN(date2.getTime())) {
      return date2.toISOString();
    }
  }
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }
  return null;
}
var HubspotAdapter = class {
  client;
  constructor(accessTokenOrClient) {
    if (accessTokenOrClient instanceof import_api_client.Client) {
      this.client = accessTokenOrClient;
    } else {
      const token = accessTokenOrClient || process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
      this.client = new import_api_client.Client({ accessToken: token });
    }
  }
  getRawClient() {
    return this.client;
  }
  get leadsApi() {
    return this.client.crm.objects.leads || this.client.crm.objects?.leads;
  }
  async findOrCreateLeadForSubject(subject, relationshipKey, relationshipType, config, offeringKeys) {
    const opportunityKey = `${relationshipKey}::LEAD::1`;
    const pipelineId = config?.hubspotPipelines?.leadPipelineId || "b2b_qualification_lead_pipeline";
    const searchRes = await this.leadsApi.searchApi.doSearch({
      filterGroups: [{
        filters: [{
          propertyName: "coa_opportunity_key",
          operator: "EQ",
          value: opportunityKey
        }]
      }],
      sorts: [],
      properties: [
        "coa_opportunity_key",
        "coa_relationship_key",
        "coa_relationship_type",
        "coa_opportunity_type",
        "coa_cycle_index",
        "hs_pipeline",
        "hs_pipeline_stage",
        "coa_qualification_state",
        "coa_managed",
        "coa_offering_keys",
        "createdate"
      ],
      limit: 1,
      after: 0
    });
    if (searchRes.results && searchRes.results.length > 0) {
      const existingLead = searchRes.results[0];
      const props = existingLead.properties || {};
      if (offeringKeys && offeringKeys.trim() && props.coa_offering_keys !== offeringKeys.trim()) {
        await this.leadsApi.basicApi.update(existingLead.id, {
          properties: { coa_offering_keys: offeringKeys.trim() }
        });
        existingLead.properties.coa_offering_keys = offeringKeys.trim();
      }
      const propVerified = props.coa_opportunity_key === opportunityKey && props.coa_relationship_key === relationshipKey && props.coa_relationship_type === relationshipType && props.hs_pipeline === pipelineId && props.coa_managed === "true";
      let assocVerified = true;
      if (subject.kind === "CONTACT") {
        try {
          const cAssocs = await this.client.crm.associations.v4.basicApi.getPage("0-136", Number(existingLead.id) || existingLead.id, "contact");
          if (!(cAssocs.results || []).some((r) => String(r.toObjectId) === subject.key)) assocVerified = false;
        } catch {
          assocVerified = false;
        }
        if (subject.companyKey) {
          try {
            const compAssocs = await this.client.crm.associations.v4.basicApi.getPage("0-136", Number(existingLead.id) || existingLead.id, "company");
            if (!(compAssocs.results || []).some((r) => String(r.toObjectId) === subject.companyKey)) assocVerified = false;
          } catch {
            assocVerified = false;
          }
        }
      } else if (subject.kind === "COMPANY") {
        try {
          const compAssocs = await this.client.crm.associations.v4.basicApi.getPage("0-136", Number(existingLead.id) || existingLead.id, "company");
          if (!(compAssocs.results || []).some((r) => String(r.toObjectId) === subject.key)) assocVerified = false;
        } catch {
          assocVerified = false;
        }
      }
      if (!propVerified || !assocVerified) {
        throw new Error("ACTION_UNVERIFIED: Existing Lead record is malformed or missing associations");
      }
      return existingLead;
    }
    const associations = [];
    if (subject.kind === "CONTACT") {
      associations.push({
        to: { id: subject.key },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 608 }]
      });
      if (subject.companyKey) {
        associations.push({
          to: { id: subject.companyKey },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 610 }]
        });
      }
    } else if (subject.kind === "COMPANY") {
      associations.push({
        to: { id: subject.key },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 610 }]
      });
      if (subject.contactKeys && subject.contactKeys.length > 0) {
        associations.push({
          to: { id: subject.contactKeys[0] },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 608 }]
        });
      }
    }
    const leadProps = {
      hs_pipeline: pipelineId,
      hs_pipeline_stage: "mql",
      coa_opportunity_key: opportunityKey,
      coa_relationship_key: relationshipKey,
      coa_relationship_type: relationshipType,
      coa_opportunity_type: "MQL",
      coa_qualification_state: "PENDING",
      coa_cycle_index: "1",
      coa_managed: "true",
      coa_config_version: config?.configVersion || "1.0.0"
    };
    if (offeringKeys && offeringKeys.trim()) {
      leadProps.coa_offering_keys = offeringKeys.trim();
    }
    const newLead = await this.leadsApi.basicApi.create({
      properties: leadProps,
      associations
    });
    return newLead;
  }
  async applyTransitionIntents(intents, transitionKey, config) {
    const receipts = [];
    let appliedIntents = 0;
    for (const intent of intents) {
      if (intent.kind === "NOOP") {
        receipts.push({
          intentKind: "NOOP",
          objectType: "none",
          operation: "NOOP",
          verified: true
        });
        appliedIntents++;
      } else if (intent.kind === "PROJECT_LIFECYCLE_STAGE") {
        logger.info("Applying PROJECT_LIFECYCLE_STAGE intent", { stage: intent.stage });
        const targetType = intent.subject.kind === "CONTACT" ? "contacts" : "companies";
        const targetId = intent.subject.key;
        if (targetType === "contacts") {
          await this.client.crm.contacts.basicApi.update(targetId, {
            properties: { lifecyclestage: intent.stage }
          });
          const readback = await this.client.crm.contacts.basicApi.getById(targetId, ["lifecyclestage"]);
          const verified = readback?.properties?.lifecyclestage === intent.stage;
          receipts.push({
            intentKind: "PROJECT_LIFECYCLE_STAGE",
            objectType: "contact",
            objectId: targetId,
            operation: "UPDATE",
            verified
          });
        } else {
          await this.client.crm.companies.basicApi.update(targetId, {
            properties: { lifecyclestage: intent.stage }
          });
          const readback = await this.client.crm.companies.basicApi.getById(targetId, ["lifecyclestage"]);
          const verified = readback?.properties?.lifecyclestage === intent.stage;
          receipts.push({
            intentKind: "PROJECT_LIFECYCLE_STAGE",
            objectType: "company",
            objectId: targetId,
            operation: "UPDATE",
            verified
          });
        }
        appliedIntents++;
      } else if (intent.kind === "UPDATE_OPPORTUNITY") {
        logger.info("Applying UPDATE_OPPORTUNITY intent", { key: intent.opportunityKey, newState: intent.newState });
        let targetId = intent.targetRecordId;
        let targetObjectType = (intent.targetObjectType || "").toLowerCase();
        if (!targetId) {
          if (intent.opportunityKey.includes("::LEAD::")) {
            const search = await this.leadsApi.searchApi.doSearch({
              filterGroups: [{ filters: [{ propertyName: "coa_opportunity_key", operator: "EQ", value: intent.opportunityKey }] }],
              sorts: [],
              properties: ["coa_opportunity_key", "hs_pipeline_stage"],
              limit: 1,
              after: 0
            });
            if (search.results.length > 0) {
              targetId = search.results[0].id;
              targetObjectType = "lead";
            }
          } else {
            const search = await this.client.crm.deals.searchApi.doSearch({
              filterGroups: [{ filters: [{ propertyName: "coa_opportunity_key", operator: "EQ", value: intent.opportunityKey }] }],
              sorts: [],
              properties: ["coa_opportunity_key", "dealstage"],
              limit: 1,
              after: 0
            });
            if (search.results.length > 0) {
              targetId = search.results[0].id;
              targetObjectType = "deal";
            }
          }
        }
        if (targetId) {
          if (targetObjectType === "lead" || targetObjectType === "0-136") {
            const targetStage = intent.details?.targetLeadStage ? String(intent.details.targetLeadStage) : intent.newState === "WON" ? "qualified" : "mql";
            await this.leadsApi.basicApi.update(targetId, {
              properties: {
                hs_pipeline_stage: targetStage,
                coa_qualification_state: intent.qualificationState
              }
            });
            const readback = await this.leadsApi.basicApi.getById(targetId, [
              "coa_qualification_state",
              "hs_pipeline_stage",
              "coa_config_version"
            ]);
            const verified = readback?.properties?.coa_qualification_state === intent.qualificationState && readback?.properties?.hs_pipeline_stage === targetStage && readback?.properties?.coa_config_version === (config?.configVersion || "1.0.0");
            receipts.push({
              intentKind: "UPDATE_OPPORTUNITY",
              objectType: "lead",
              objectId: targetId,
              operation: "UPDATE",
              verified
            });
          } else {
            const updateProps = {
              coa_qualification_state: intent.qualificationState
            };
            const targetStage = intent.details?.targetDealStage ? String(intent.details.targetDealStage) : intent.newState === "WON" ? "closedwon" : "open";
            updateProps.dealstage = targetStage;
            await this.client.crm.deals.basicApi.update(targetId, { properties: updateProps });
            const readback = await this.client.crm.deals.basicApi.getById(targetId, [
              "coa_qualification_state",
              "dealstage",
              "coa_config_version"
            ]);
            const verified = readback?.properties?.coa_qualification_state === intent.qualificationState && readback?.properties?.dealstage === targetStage && readback?.properties?.coa_config_version === (config?.configVersion || "1.0.0");
            receipts.push({
              intentKind: "UPDATE_OPPORTUNITY",
              objectType: "deal",
              objectId: targetId,
              operation: "UPDATE",
              verified
            });
          }
        } else {
          receipts.push({
            intentKind: "UPDATE_OPPORTUNITY",
            objectType: "unknown",
            operation: "UPDATE",
            verified: false,
            error: "Target Lead or Deal record not found for update"
          });
        }
        appliedIntents++;
      } else if (intent.kind === "CREATE_SUCCESSOR") {
        logger.info("Applying CREATE_SUCCESSOR intent", { predecessor: intent.predecessorKey, successor: intent.successorKey, type: intent.successorType });
        if (config?.featureFlags?.dryRunTransactions) {
          logger.info("dryRunTransactions feature flag enabled; skipping real transaction creation", { successorKey: intent.successorKey });
          receipts.push({
            intentKind: "CREATE_SUCCESSOR",
            objectType: "deal",
            operation: "NOOP",
            verified: true
          });
          appliedIntents++;
          continue;
        }
        if (intent.successorType === "FTP" || intent.successorType === "RTP") {
          const existingDeals = await this.client.crm.deals.searchApi.doSearch({
            filterGroups: [{ filters: [{ propertyName: "coa_opportunity_key", operator: "EQ", value: intent.successorKey }] }],
            sorts: [],
            properties: [
              "dealname",
              "dealstage",
              "pipeline",
              "coa_opportunity_key",
              "coa_relationship_key",
              "coa_relationship_type",
              "coa_opportunity_type",
              "coa_cycle_index",
              "coa_predecessor_opportunity_key",
              "coa_predecessor_completed_at",
              "coa_managed",
              "coa_config_version",
              "coa_qualification_state"
            ],
            limit: 1,
            after: 0
          });
          let expectedContactId = void 0;
          let expectedCompanyId = void 0;
          if (intent.subject?.kind === "CONTACT") {
            expectedContactId = intent.subject.key;
            if (intent.subject.companyKey) {
              expectedCompanyId = intent.subject.companyKey;
            }
          } else if (intent.subject?.kind === "COMPANY") {
            expectedCompanyId = intent.subject.key;
            if (intent.subject.contactKeys && intent.subject.contactKeys.length > 0) {
              expectedContactId = intent.subject.contactKeys[0];
            }
          }
          const relKey = intent.successorKey.split("::")[0];
          const pipelineId = config?.hubspotPipelines?.dealPipelineId || "b2b_transaction_deal_pipeline";
          if (existingDeals.results.length === 0) {
            const associations = [];
            if (expectedContactId) {
              associations.push({
                to: { id: expectedContactId },
                types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }]
              });
            }
            if (expectedCompanyId) {
              associations.push({
                to: { id: expectedCompanyId },
                types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }]
              });
            }
            const predecessorCompletedAt = (/* @__PURE__ */ new Date()).toISOString();
            const newDeal = await this.client.crm.deals.basicApi.create({
              properties: {
                dealname: `Transaction Deal - ${intent.successorKey}`,
                pipeline: pipelineId,
                dealstage: "open",
                coa_opportunity_key: intent.successorKey,
                coa_relationship_key: relKey,
                coa_relationship_type: config?.relationshipType || "b2b",
                coa_opportunity_type: intent.successorType,
                coa_qualification_state: "PENDING",
                coa_cycle_index: String(intent.cycleIndex),
                coa_predecessor_opportunity_key: intent.predecessorKey,
                coa_predecessor_completed_at: predecessorCompletedAt,
                coa_managed: "true",
                coa_config_version: config?.configVersion || "1.0.0"
              },
              associations
            });
            const readback = await this.client.crm.deals.basicApi.getById(newDeal.id, [
              "dealname",
              "pipeline",
              "dealstage",
              "coa_opportunity_key",
              "coa_relationship_key",
              "coa_relationship_type",
              "coa_opportunity_type",
              "coa_cycle_index",
              "coa_predecessor_opportunity_key",
              "coa_predecessor_completed_at",
              "coa_managed",
              "coa_config_version",
              "coa_qualification_state"
            ]);
            const propVerified = readback?.properties?.dealname === `Transaction Deal - ${intent.successorKey}` && readback?.properties?.coa_opportunity_key === intent.successorKey && readback?.properties?.coa_opportunity_type === intent.successorType && readback?.properties?.coa_cycle_index === String(intent.cycleIndex) && readback?.properties?.pipeline === pipelineId && readback?.properties?.dealstage === "open" && readback?.properties?.coa_relationship_key === relKey && readback?.properties?.coa_relationship_type === (config?.relationshipType || "b2b") && readback?.properties?.coa_predecessor_opportunity_key === intent.predecessorKey && Boolean(parseHubSpotTimestamp(readback?.properties?.coa_predecessor_completed_at)) && readback?.properties?.coa_config_version === (config?.configVersion || "1.0.0") && readback?.properties?.coa_qualification_state === "PENDING" && readback?.properties?.coa_managed === "true";
            let assocVerified = true;
            if (expectedContactId) {
              const contactAssoc = await this.client.crm.associations.v4.basicApi.getPage("deal", Number(newDeal.id) || newDeal.id, "contact");
              const found = (contactAssoc.results || []).some((r) => String(r.toObjectId) === expectedContactId);
              if (!found) assocVerified = false;
            }
            if (expectedCompanyId) {
              const companyAssoc = await this.client.crm.associations.v4.basicApi.getPage("deal", Number(newDeal.id) || newDeal.id, "company");
              const found = (companyAssoc.results || []).some((r) => String(r.toObjectId) === expectedCompanyId);
              if (!found) assocVerified = false;
            }
            receipts.push({
              intentKind: "CREATE_SUCCESSOR",
              objectType: "deal",
              objectId: newDeal.id,
              operation: "CREATE",
              verified: propVerified
            });
            receipts.push({
              intentKind: "ASSOCIATE_DEAL_SUBJECT",
              objectType: "deal",
              objectId: newDeal.id,
              operation: "ASSOCIATE",
              verified: assocVerified
            });
          } else {
            const existingDeal = existingDeals.results[0];
            const props = existingDeal.properties || {};
            const propVerified = (props.dealname === `Transaction Deal - ${intent.successorKey}` || Boolean(props.dealname)) && props.coa_opportunity_key === intent.successorKey && props.coa_opportunity_type === intent.successorType && props.coa_cycle_index === String(intent.cycleIndex) && props.pipeline === pipelineId && props.coa_relationship_key === relKey && props.coa_relationship_type === (config?.relationshipType || "b2b") && props.coa_predecessor_opportunity_key === intent.predecessorKey && Boolean(parseHubSpotTimestamp(props.coa_predecessor_completed_at)) && props.coa_config_version === (config?.configVersion || "1.0.0") && props.coa_managed === "true";
            let assocVerified = true;
            if (expectedContactId) {
              const contactAssoc = await this.client.crm.associations.v4.basicApi.getPage("deal", Number(existingDeal.id) || existingDeal.id, "contact");
              const found = (contactAssoc.results || []).some((r) => String(r.toObjectId) === expectedContactId);
              if (!found) assocVerified = false;
            }
            if (expectedCompanyId) {
              const companyAssoc = await this.client.crm.associations.v4.basicApi.getPage("deal", Number(existingDeal.id) || existingDeal.id, "company");
              const found = (companyAssoc.results || []).some((r) => String(r.toObjectId) === expectedCompanyId);
              if (!found) assocVerified = false;
            }
            receipts.push({
              intentKind: "CREATE_SUCCESSOR",
              objectType: "deal",
              objectId: existingDeal.id,
              operation: "NOOP",
              verified: propVerified && assocVerified
            });
          }
          appliedIntents++;
        }
      } else if (intent.kind === "CREATE_MANUAL_REVIEW") {
        const tasksApi = this.client.crm.objects.tasks || this.client.crm.objects?.tasks;
        const subjectId = intent.subject.key;
        const assocTypeId = intent.subject.kind === "CONTACT" ? 204 : 192;
        const associations = [{
          to: { id: subjectId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: assocTypeId }]
        }];
        const taskRes = await tasksApi.basicApi.create({
          properties: {
            hs_task_subject: `Manual Review Required: ${intent.reason}`,
            hs_task_status: "NOT_STARTED",
            hs_task_priority: "HIGH",
            hs_task_body: `Opportunity key ${intent.opportunityKey} requires manual review. Reason: ${intent.reason}`
          },
          associations
        });
        const readback = await tasksApi.basicApi.getById(taskRes.id, ["hs_task_subject", "hs_task_status"]);
        const verified = Boolean(readback?.properties?.hs_task_subject?.startsWith("Manual Review Required"));
        receipts.push({
          intentKind: "CREATE_MANUAL_REVIEW",
          objectType: "task",
          objectId: taskRes.id,
          operation: "CREATE",
          verified
        });
        appliedIntents++;
      }
    }
    const allVerified = receipts.every((r) => r.verified);
    return {
      success: allVerified,
      appliedIntents,
      receipts
    };
  }
};

// packages/hubspot-adapter/snapshot-loader.ts
var import_api_client2 = require("@hubspot/api-client");
var HubSpotSnapshotLoader = class {
  client;
  constructor(accessTokenOrAdapter) {
    if (accessTokenOrAdapter instanceof HubspotAdapter) {
      this.client = accessTokenOrAdapter.getRawClient();
    } else {
      const token = accessTokenOrAdapter || process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
      this.client = new import_api_client2.Client({ accessToken: token });
    }
  }
  get leadsApi() {
    return this.client.crm.objects.leads || this.client.crm.objects?.leads;
  }
  async loadSnapshotFromRecord(recordRef, organizationKey = "org_default", relationshipType = "b2b") {
    return this.loadPureSnapshotFromHubSpot(recordRef, organizationKey, relationshipType);
  }
  async loadPureSnapshotFromHubSpot(recordRef, organizationKey = "org_default", relationshipType = "b2b") {
    const rawType = (recordRef.objectType || "").toLowerCase();
    let subjectKind = "CONTACT";
    let subjectKey = "";
    let contactKeys = [];
    let companyKey = void 0;
    let facts = {};
    let evidence = [];
    let opportunityKey = "";
    let opportunityType = "MQL";
    let opportunityState = "OPEN";
    let cycleIndex = 1;
    let openedAt = (/* @__PURE__ */ new Date()).toISOString();
    let predecessorCompletedAt = void 0;
    let relationshipKey = "";
    if (rawType === "contact" || rawType === "0-1") {
      subjectKind = "CONTACT";
      subjectKey = recordRef.objectId;
      contactKeys = [recordRef.objectId];
      const contact = await this.client.crm.contacts.basicApi.getById(recordRef.objectId, [
        "email",
        "lifecyclestage",
        "coa_relationship_key",
        "coa_relationship_type",
        "coa_marketing_consent",
        "coa_automation_suppressed",
        "createdate"
      ]);
      const cProps = contact.properties || {};
      let companySuppressed = false;
      let compRelKey = "";
      try {
        const companyAssocs = await this.client.crm.associations.v4.basicApi.getPage(
          "contact",
          Number(recordRef.objectId) || recordRef.objectId,
          "company"
        );
        if (companyAssocs.results && companyAssocs.results.length > 0) {
          companyKey = String(companyAssocs.results[0].toObjectId);
          try {
            const compRecord = await this.client.crm.companies.basicApi.getById(companyKey, [
              "coa_relationship_key",
              "coa_automation_suppressed"
            ]);
            compRelKey = compRecord.properties?.coa_relationship_key || "";
            companySuppressed = compRecord.properties?.coa_automation_suppressed === "true" || compRecord.properties?.coa_automation_suppressed === "1";
          } catch (err) {
            if (err?.statusCode !== 404 && err?.status !== 404) throw err;
          }
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
      const contactRelKey = cProps.coa_relationship_key || "";
      let relationshipMismatch = false;
      if (relationshipType === "b2b" && contactRelKey && compRelKey && contactRelKey !== compRelKey) {
        relationshipMismatch = true;
        logger.error("B2B Relationship Key Mismatch between Contact and associated Company", { contactRelKey, compRelKey });
      }
      if (relationshipType === "b2b" && compRelKey) {
        relationshipKey = compRelKey;
      } else {
        relationshipKey = contactRelKey || compRelKey || (companyKey ? `comp_${companyKey}` : `cnt_${recordRef.objectId}`);
      }
      opportunityKey = `${relationshipKey}::LEAD::1`;
      const contactSuppressed = cProps.coa_automation_suppressed === "true" || cProps.coa_automation_suppressed === "1";
      facts = {
        email: cProps.email || void 0,
        contactEmail: cProps.email || void 0,
        lifecycleStage: cProps.lifecyclestage || void 0,
        marketingConsent: cProps.coa_marketing_consent === "true" || cProps.coa_marketing_consent === "1",
        automationSuppressed: Boolean(contactSuppressed || companySuppressed || relationshipMismatch),
        relationshipKeyMismatch: relationshipMismatch
      };
      openedAt = parseHubSpotTimestamp(cProps.createdate) || openedAt;
    } else if (rawType === "company" || rawType === "0-2") {
      subjectKind = "COMPANY";
      subjectKey = recordRef.objectId;
      const company = await this.client.crm.companies.basicApi.getById(recordRef.objectId, [
        "domain",
        "name",
        "lifecyclestage",
        "coa_relationship_key",
        "coa_relationship_type",
        "coa_marketing_consent",
        "coa_automation_suppressed",
        "createdate"
      ]);
      const compProps = company.properties || {};
      let contactSuppressed = false;
      let contactEmail = void 0;
      let contactRelKey = "";
      try {
        const contactAssocs = await this.client.crm.associations.v4.basicApi.getPage(
          "company",
          Number(recordRef.objectId) || recordRef.objectId,
          "contact"
        );
        if (contactAssocs.results && contactAssocs.results.length > 0) {
          contactKeys = contactAssocs.results.map((r) => String(r.toObjectId));
          try {
            const primaryContact = await this.client.crm.contacts.basicApi.getById(contactKeys[0], [
              "email",
              "coa_relationship_key",
              "coa_automation_suppressed"
            ]);
            contactEmail = primaryContact.properties?.email || void 0;
            contactRelKey = primaryContact.properties?.coa_relationship_key || "";
            contactSuppressed = primaryContact.properties?.coa_automation_suppressed === "true" || primaryContact.properties?.coa_automation_suppressed === "1";
          } catch (err) {
            if (err?.statusCode !== 404 && err?.status !== 404) throw err;
          }
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
      const compRelKey = compProps.coa_relationship_key || "";
      let relationshipMismatch = false;
      if (relationshipType === "b2b" && compRelKey && contactRelKey && compRelKey !== contactRelKey) {
        relationshipMismatch = true;
        logger.error("B2B Relationship Key Mismatch between Company and primary Contact", { compRelKey, contactRelKey });
      }
      relationshipKey = compRelKey || contactRelKey || `comp_${recordRef.objectId}`;
      opportunityKey = `${relationshipKey}::LEAD::1`;
      const compSuppressed = compProps.coa_automation_suppressed === "true" || compProps.coa_automation_suppressed === "1";
      facts = {
        domain: compProps.domain || void 0,
        companyName: compProps.name || void 0,
        email: contactEmail,
        contactEmail,
        lifecycleStage: compProps.lifecyclestage || void 0,
        marketingConsent: compProps.coa_marketing_consent === "true" || compProps.coa_marketing_consent === "1",
        automationSuppressed: Boolean(compSuppressed || contactSuppressed || relationshipMismatch),
        relationshipKeyMismatch: relationshipMismatch
      };
      openedAt = parseHubSpotTimestamp(compProps.createdate) || openedAt;
    } else if (rawType === "lead" || rawType === "0-136") {
      const lead = await this.leadsApi.basicApi.getById(recordRef.objectId, [
        "coa_opportunity_key",
        "coa_relationship_key",
        "coa_opportunity_type",
        "coa_cycle_index",
        "hs_pipeline_stage",
        "coa_qualification_state",
        "coa_predecessor_opportunity_key",
        "coa_offering_keys",
        "createdate"
      ]);
      const lProps = lead.properties || {};
      let assocContactId = void 0;
      let assocCompanyId = void 0;
      try {
        const cAssoc = await this.client.crm.associations.v4.basicApi.getPage("lead", Number(recordRef.objectId) || recordRef.objectId, "contact");
        if (cAssoc.results && cAssoc.results.length > 0) {
          assocContactId = String(cAssoc.results[0].toObjectId);
          contactKeys.push(assocContactId);
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
      try {
        const compAssoc = await this.client.crm.associations.v4.basicApi.getPage("lead", Number(recordRef.objectId) || recordRef.objectId, "company");
        if (compAssoc.results && compAssoc.results.length > 0) {
          assocCompanyId = String(compAssoc.results[0].toObjectId);
          companyKey = assocCompanyId;
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
      if (assocCompanyId) {
        subjectKind = "COMPANY";
        subjectKey = assocCompanyId;
      } else if (assocContactId) {
        subjectKind = "CONTACT";
        subjectKey = assocContactId;
      }
      relationshipKey = lProps.coa_relationship_key || (subjectKey ? `${subjectKind.toLowerCase()}_${subjectKey}` : `rel_lead_${recordRef.objectId}`);
      opportunityKey = lProps.coa_opportunity_key || `${relationshipKey}::LEAD::1`;
      const stage = (lProps.hs_pipeline_stage || "mql").toLowerCase();
      if (stage === "qualified") {
        opportunityType = "SQL";
        opportunityState = "WON";
      } else if (stage === "sql") {
        opportunityType = "SQL";
        opportunityState = "OPEN";
      } else {
        opportunityType = "MQL";
        opportunityState = "OPEN";
      }
      if (lProps.coa_offering_keys) {
        facts.offeringKeys = String(lProps.coa_offering_keys).split(",").map((s) => s.trim());
      }
      cycleIndex = Number(lProps.coa_cycle_index) || 1;
      openedAt = parseHubSpotTimestamp(lProps.createdate) || openedAt;
    } else if (rawType === "deal" || rawType === "0-3") {
      const deal = await this.client.crm.deals.basicApi.getById(recordRef.objectId, [
        "dealname",
        "amount",
        "dealstage",
        "pipeline",
        "coa_opportunity_key",
        "coa_relationship_key",
        "coa_opportunity_type",
        "coa_cycle_index",
        "coa_qualification_state",
        "coa_predecessor_opportunity_key",
        "coa_predecessor_completed_at",
        "coa_offering_keys",
        "createdate"
      ]);
      const dProps = deal.properties || {};
      let assocContactId = void 0;
      let assocCompanyId = void 0;
      try {
        const cAssoc = await this.client.crm.associations.v4.basicApi.getPage("deal", Number(recordRef.objectId) || recordRef.objectId, "contact");
        if (cAssoc.results && cAssoc.results.length > 0) {
          assocContactId = String(cAssoc.results[0].toObjectId);
          contactKeys.push(assocContactId);
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
      try {
        const compAssoc = await this.client.crm.associations.v4.basicApi.getPage("deal", Number(recordRef.objectId) || recordRef.objectId, "company");
        if (compAssoc.results && compAssoc.results.length > 0) {
          assocCompanyId = String(compAssoc.results[0].toObjectId);
          companyKey = assocCompanyId;
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
      if (assocCompanyId) {
        subjectKind = "COMPANY";
        subjectKey = assocCompanyId;
      } else if (assocContactId) {
        subjectKind = "CONTACT";
        subjectKey = assocContactId;
      }
      relationshipKey = dProps.coa_relationship_key || (subjectKey ? `${subjectKind.toLowerCase()}_${subjectKey}` : `rel_deal_${recordRef.objectId}`);
      opportunityType = dProps.coa_opportunity_type || "FTP";
      cycleIndex = Number(dProps.coa_cycle_index) || 1;
      opportunityKey = dProps.coa_opportunity_key || `${relationshipKey}::${opportunityType}::${cycleIndex}`;
      const stage = (dProps.dealstage || "open").toLowerCase();
      if (stage === "closedwon") {
        opportunityState = "WON";
        facts.transactionCompleted = true;
      } else if (stage === "closedlost") {
        opportunityState = "LOST";
      } else {
        opportunityState = "OPEN";
      }
      if (dProps.coa_offering_keys) {
        facts.offeringKeys = String(dProps.coa_offering_keys).split(",").map((s) => s.trim());
      }
      openedAt = parseHubSpotTimestamp(dProps.createdate) || openedAt;
      predecessorCompletedAt = parseHubSpotTimestamp(dProps.coa_predecessor_completed_at) || void 0;
    } else {
      throw new Error(`INVALID_ENROLLMENT: Unsupported objectType '${recordRef.objectType}'`);
    }
    if (contactKeys.length > 0) {
      try {
        const primaryContact = await this.client.crm.contacts.basicApi.getById(contactKeys[0], [
          "email",
          "lifecyclestage",
          "coa_marketing_consent",
          "coa_automation_suppressed"
        ]);
        const pcProps = primaryContact.properties || {};
        facts.email = pcProps.email || facts.email;
        facts.contactEmail = pcProps.email || facts.contactEmail;
        if (pcProps.coa_marketing_consent === "true" || pcProps.coa_marketing_consent === "1") {
          facts.marketingConsent = true;
        }
        if (pcProps.coa_automation_suppressed === "true" || pcProps.coa_automation_suppressed === "1") {
          facts.automationSuppressed = true;
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
    }
    if (companyKey) {
      try {
        const compRecord = await this.client.crm.companies.basicApi.getById(companyKey, ["coa_automation_suppressed"]);
        if (compRecord.properties?.coa_automation_suppressed === "true" || compRecord.properties?.coa_automation_suppressed === "1") {
          facts.automationSuppressed = true;
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
    }
    if (contactKeys.length > 0) {
      try {
        const lowerTime = predecessorCompletedAt ? new Date(predecessorCompletedAt).getTime() : new Date(openedAt).getTime();
        const meetingAssocs = await this.client.crm.associations.v4.basicApi.getPage("contact", Number(contactKeys[0]) || contactKeys[0], "meeting");
        for (const assoc of meetingAssocs.results || []) {
          const meetingId = String(assoc.toObjectId);
          const meeting = await this.client.crm.objects.meetings.basicApi.getById(meetingId, [
            "hs_meeting_outcome",
            "hs_timestamp"
          ]);
          const parsedTime = parseHubSpotTimestamp(meeting.properties.hs_timestamp);
          if (parsedTime && new Date(parsedTime).getTime() > lowerTime) {
            evidence.push({
              id: meeting.id,
              predicate: "activityExists",
              scope: "opportunity",
              occurredAt: parsedTime,
              data: {
                activityType: "MEETING",
                outcome: meeting.properties.hs_meeting_outcome === "COMPLETED" ? "COMPLETED" : "HELD"
              }
            });
          }
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
    }
    return {
      organizationKey,
      relationshipKey,
      relationshipType: relationshipType || "b2b",
      opportunityKey,
      opportunityType,
      opportunityState,
      cycleIndex,
      openedAt,
      predecessorCompletedAt,
      subject: {
        kind: subjectKind,
        key: subjectKey,
        contactKeys,
        companyKey
      },
      facts,
      evidence
    };
  }
};

// src/custom-code-actions/reconcile-record.ts
async function processHubSpotCustomCodeAction(event, accessToken, adapterInstance) {
  const portalId = event?.origin?.portalId;
  const rawObjectId = event?.object?.objectId !== void 0 ? String(event.object.objectId) : event?.object?.id !== void 0 ? String(event.object.id) : void 0;
  const rawObjectType = event?.object?.objectType;
  if (!portalId || !rawObjectId || rawObjectId === "0" || !rawObjectType) {
    throw new Error("INVALID_ENROLLMENT: Missing valid origin.portalId, object.objectId, or object.objectType in HubSpot event payload");
  }
  const token = accessToken || process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
  if (!adapterInstance && (!token || token.trim() === "")) {
    throw new Error("MISSING_AUTHENTICATION_SECRET: PRIVATE_APP_ACCESS_TOKEN secret is missing or empty");
  }
  const objectType = String(rawObjectType).toLowerCase();
  logger.info("Executing stateless HubSpot Custom Code Action", {
    event: { origin: event?.origin, object: { objectId: rawObjectId, objectType } }
  });
  const relTypeInput = event?.inputFields?.relationshipType || event?.inputFields?.coa_relationship_type;
  const offeringInput = event?.inputFields?.offeringKeys || event?.inputFields?.coa_offering_keys;
  const config = OrganizationConfigResolver.resolveConfigByPortalId(portalId, { relationshipType: relTypeInput });
  const adapter = adapterInstance || new HubspotAdapter(token);
  const snapshotLoader = new HubSpotSnapshotLoader(adapter);
  const snapshot = await snapshotLoader.loadSnapshotFromRecord(
    { objectType, objectId: rawObjectId },
    config.organizationKey,
    config.relationshipType
  );
  logger.info("Loading pure opportunity snapshot directly from HubSpot CRM", { objectType, objectId: rawObjectId });
  if (snapshot.facts.automationSuppressed === true || config.featureFlags?.automationSuppressed === true) {
    logger.info("Automation suppressed for subject record", { objectType, objectId: rawObjectId });
    return {
      outputFields: {
        objectId: rawObjectId,
        objectType,
        opportunityKey: snapshot.opportunityKey,
        qualificationState: "BLOCKED",
        appliedIntentsCount: 0,
        verified: true,
        status: "BLOCKED"
      }
    };
  }
  if (objectType === "contact" || objectType === "0-1" || objectType === "company" || objectType === "0-2") {
    const lead = await adapter.findOrCreateLeadForSubject(
      snapshot.subject,
      snapshot.relationshipKey,
      config.relationshipType,
      config,
      offeringInput
    );
    if (lead) {
      const leadSnapshot = await snapshotLoader.loadSnapshotFromRecord(
        { objectType: "lead", objectId: lead.id },
        config.organizationKey,
        config.relationshipType
      );
      const evalRes = evaluateOpportunity(leadSnapshot, config);
      const intents2 = planTransition(leadSnapshot, evalRes, config);
      const mutationResult2 = await adapter.applyTransitionIntents(intents2, leadSnapshot.opportunityKey, config);
      if (!mutationResult2.success) {
        const failedReceipts = mutationResult2.receipts.filter((r) => !r.verified);
        throw new Error(`ACTION_UNVERIFIED: Mutation readback verification failed: ${JSON.stringify(failedReceipts)}`);
      }
      let status2 = "NO_CHANGE";
      if (mutationResult2.receipts.some((r) => r.intentKind === "CREATE_SUCCESSOR" && r.operation === "CREATE" && r.verified)) {
        status2 = "CREATED_SUCCESSOR";
      } else if (mutationResult2.receipts.some((r) => r.intentKind === "CREATE_SUCCESSOR" && r.operation === "NOOP" && r.verified)) {
        status2 = config.featureFlags?.dryRunTransactions ? "DRY_RUN_SUCCESSOR_PLANNED" : "NO_CHANGE";
      } else if (mutationResult2.receipts.some((r) => r.intentKind === "CREATE_MANUAL_REVIEW")) {
        status2 = "MANUAL_REVIEW_REQUIRED";
      } else if (evalRes.qualificationState === "BLOCKED") {
        status2 = "BLOCKED";
      } else if (mutationResult2.receipts.some((r) => r.operation === "UPDATE" && r.verified)) {
        status2 = "UPDATED_EXISTING";
      }
      return {
        outputFields: {
          objectId: String(lead.id),
          objectType: "lead",
          opportunityKey: leadSnapshot.opportunityKey,
          qualificationState: evalRes.qualificationState,
          appliedIntentsCount: mutationResult2.appliedIntents,
          verified: mutationResult2.success,
          status: status2
        }
      };
    }
  }
  const evaluation = evaluateOpportunity(snapshot, config);
  const intents = planTransition(snapshot, evaluation, config);
  const mutationResult = await adapter.applyTransitionIntents(intents, snapshot.opportunityKey, config);
  if (!mutationResult.success) {
    const failedReceipts = mutationResult.receipts.filter((r) => !r.verified);
    throw new Error(`ACTION_UNVERIFIED: Mutation readback verification failed: ${JSON.stringify(failedReceipts)}`);
  }
  let status = "NO_CHANGE";
  if (mutationResult.receipts.some((r) => r.intentKind === "CREATE_SUCCESSOR" && r.operation === "CREATE" && r.verified)) {
    status = "CREATED_SUCCESSOR";
  } else if (mutationResult.receipts.some((r) => r.intentKind === "CREATE_SUCCESSOR" && r.operation === "NOOP" && r.verified)) {
    status = config.featureFlags?.dryRunTransactions ? "DRY_RUN_SUCCESSOR_PLANNED" : "NO_CHANGE";
  } else if (mutationResult.receipts.some((r) => r.intentKind === "CREATE_MANUAL_REVIEW")) {
    status = "MANUAL_REVIEW_REQUIRED";
  } else if (evaluation.qualificationState === "BLOCKED") {
    status = "BLOCKED";
  } else if (mutationResult.receipts.some((r) => r.operation === "UPDATE" && r.verified)) {
    status = "UPDATED_EXISTING";
  }
  logger.info("Stateless HubSpot Custom Code Action executed successfully", {
    objectId: rawObjectId,
    objectType,
    opportunityKey: snapshot.opportunityKey,
    qualificationState: evaluation.qualificationState,
    appliedIntentsCount: mutationResult.appliedIntents,
    verified: mutationResult.success,
    status
  });
  return {
    outputFields: {
      objectId: rawObjectId,
      objectType,
      opportunityKey: snapshot.opportunityKey,
      qualificationState: evaluation.qualificationState,
      appliedIntentsCount: mutationResult.appliedIntents,
      verified: mutationResult.success,
      status
    }
  };
}
async function main(event, callback) {
  try {
    const result = await processHubSpotCustomCodeAction(event);
    if (callback) {
      callback(result);
    }
    return result;
  } catch (err) {
    logger.error("HubSpot Custom Code Action execution error", { error: err });
    throw err;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  main,
  processHubSpotCustomCodeAction
});
