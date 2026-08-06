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
  if (snapshot.facts.missingCompany === true || snapshot.facts.ambiguousPrimaryCompany === true || snapshot.facts.ambiguousPrimaryContact === true || snapshot.facts.manualReviewRequired === true) {
    return {
      qualificationState: "MANUAL_REVIEW",
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

// packages/domain/identity.ts
function sanitizeKey(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
}
function deriveRelationshipKey(organizationKey, relationshipType, subjectAnchor) {
  const cleanOrg = sanitizeKey(organizationKey);
  const cleanRel = sanitizeKey(relationshipType);
  const cleanAnchor = sanitizeKey(subjectAnchor);
  return `rel_${cleanOrg}_${cleanRel}_${cleanAnchor}`;
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
  if (config.featureFlags?.automationSuppressed || snapshot.facts.automationSuppressed === true) {
    return [{ kind: "NOOP", reason: "Automation suppressed by organization kill switch" }];
  }
  if (evaluation.qualificationState === "BLOCKED") {
    return [{ kind: "NOOP", reason: "Opportunity qualification is BLOCKED" }];
  }
  if (evaluation.qualificationState === "MANUAL_REVIEW") {
    const isMissingCompany = Boolean(snapshot.facts.missingCompany);
    const isAmbiguousCompany = Boolean(snapshot.facts.ambiguousPrimaryCompany);
    const isAmbiguousContact = Boolean(snapshot.facts.ambiguousPrimaryContact);
    let reason = "Opportunity requires human manual review";
    if (isMissingCompany) {
      reason = "B2B Contact has missing or unassociated Company";
    } else if (isAmbiguousCompany) {
      reason = "Multiple associated Companies without explicit primary company designation";
    } else if (isAmbiguousContact) {
      reason = "Multiple associated Contacts without explicit primary contact designation";
    }
    let reviewOpportunityKey = snapshot.opportunityKey;
    if (isMissingCompany && snapshot.subject.kind === "CONTACT") {
      const reviewRelKey = deriveRelationshipKey(snapshot.organizationKey, "review", snapshot.subject.key);
      reviewOpportunityKey = `${reviewRelKey}::LEAD::1`;
    }
    return [{
      kind: "CREATE_MANUAL_REVIEW",
      opportunityKey: reviewOpportunityKey,
      reason,
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
    const mqlCompletedAt = snapshot.mqlCompletedAt;
    const isValidMqlTime = Boolean(mqlCompletedAt && !isNaN(Date.parse(mqlCompletedAt)));
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
    if (isValidMqlTime) {
      const successorKey = deriveSuccessorKey(snapshot.relationshipKey, "FTP", 1);
      intents.push({
        kind: "CREATE_SUCCESSOR",
        predecessorKey: snapshot.opportunityKey,
        successorKey,
        successorType: "FTP",
        cycleIndex: 1,
        subject: snapshot.subject,
        offerings: snapshot.offerings,
        predecessorCompletedAt: mqlCompletedAt
      });
    }
  } else if (snapshot.opportunityType === "FTP") {
    const closedAt = snapshot.facts.closedAt || snapshot.facts.closedate || snapshot.predecessorCompletedAt;
    const isValidClosedTime = Boolean(closedAt && !isNaN(Date.parse(closedAt)));
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
    if (isValidClosedTime) {
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
        predecessorCompletedAt: closedAt
      });
    }
  } else if (snapshot.opportunityType === "RTP") {
    const closedAt = snapshot.facts.closedAt || snapshot.facts.closedate || snapshot.predecessorCompletedAt;
    const isValidClosedTime = Boolean(closedAt && !isNaN(Date.parse(closedAt)));
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
    if (isValidClosedTime) {
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
        predecessorCompletedAt: closedAt
      });
    }
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
      "dryRunTransactions": false
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
        "coa_config_version",
        "coa_offering_keys",
        "coa_mql_completed_at",
        "coa_unsatisfied_goal_keys",
        "coa_last_evaluated_at",
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
        const readbackUpdate = await this.leadsApi.basicApi.getById(existingLead.id, ["coa_offering_keys"]);
        if (readbackUpdate?.properties?.coa_offering_keys !== offeringKeys.trim()) {
          throw new Error(`ACTION_UNVERIFIED: Existing Lead ${existingLead.id} offering keys update readback failed`);
        }
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
      coa_config_version: config?.configVersion || "1.0.0",
      coa_last_evaluated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (offeringKeys && offeringKeys.trim()) {
      leadProps.coa_offering_keys = offeringKeys.trim();
    }
    const newLead = await this.leadsApi.basicApi.create({
      properties: leadProps,
      associations
    });
    const leadReadback = await this.leadsApi.basicApi.getById(newLead.id, [
      "coa_opportunity_key",
      "coa_relationship_key",
      "coa_relationship_type",
      "coa_opportunity_type",
      "coa_qualification_state",
      "coa_cycle_index",
      "hs_pipeline",
      "hs_pipeline_stage",
      "coa_managed",
      "coa_config_version",
      "coa_last_evaluated_at",
      "coa_offering_keys"
    ]);
    const leadVerified = leadReadback?.properties?.coa_opportunity_key === opportunityKey && leadReadback?.properties?.coa_relationship_key === relationshipKey && leadReadback?.properties?.coa_relationship_type === relationshipType && leadReadback?.properties?.coa_opportunity_type === "MQL" && leadReadback?.properties?.coa_qualification_state === "PENDING" && leadReadback?.properties?.coa_cycle_index === "1" && leadReadback?.properties?.hs_pipeline === pipelineId && leadReadback?.properties?.hs_pipeline_stage === "mql" && leadReadback?.properties?.coa_managed === "true" && leadReadback?.properties?.coa_config_version === (config?.configVersion || "1.0.0") && Boolean(leadReadback?.properties?.coa_last_evaluated_at) && (!offeringKeys || leadReadback?.properties?.coa_offering_keys === offeringKeys.trim());
    if (!leadVerified) {
      throw new Error(`ACTION_UNVERIFIED: Initial Lead creation readback verification failed for record ${newLead.id}`);
    }
    return newLead;
  }
  async resolveProductForOfferingKey(offeringKey, offeringKeyProperty = "hs_sku") {
    try {
      const searchRes = await this.client.crm.products.searchApi.doSearch({
        filterGroups: [{
          filters: [{
            propertyName: offeringKeyProperty,
            operator: "EQ",
            value: offeringKey
          }]
        }],
        sorts: [],
        properties: ["name", "price", offeringKeyProperty],
        limit: 2,
        after: 0
      });
      if (!searchRes.results || searchRes.results.length === 0) {
        const nameSearch = await this.client.crm.products.searchApi.doSearch({
          filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: offeringKey }] }],
          sorts: [],
          properties: ["name", "price", offeringKeyProperty],
          limit: 2,
          after: 0
        });
        if (!nameSearch.results || nameSearch.results.length === 0) {
          throw new Error(`PRODUCT_NOT_FOUND: Product offering key '${offeringKey}' not found in HubSpot Product catalog`);
        }
        if (nameSearch.results.length > 1) {
          throw new Error(`AMBIGUOUS_PRODUCT_MATCH: Multiple products matched offering key '${offeringKey}'`);
        }
        return {
          id: nameSearch.results[0].id,
          price: Number(nameSearch.results[0].properties?.price || 0)
        };
      }
      if (searchRes.results.length > 1) {
        throw new Error(`AMBIGUOUS_PRODUCT_MATCH: Multiple products matched offering key '${offeringKey}'`);
      }
      return {
        id: searchRes.results[0].id,
        price: Number(searchRes.results[0].properties?.price || 0)
      };
    } catch (e) {
      if (e.message.startsWith("PRODUCT_NOT_FOUND") || e.message.startsWith("AMBIGUOUS_PRODUCT_MATCH")) {
        throw e;
      }
      throw new Error(`PRODUCT_RESOLUTION_FAILED: Failed to resolve Product for offering '${offeringKey}': ${e.message}`);
    }
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
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          const unsatisfiedJson = JSON.stringify(intent.details?.unsatisfiedGoalKeys || []);
          const offeringKeysStr = (intent.details?.offerings || []).map((o) => o.offeringKey).join(",");
          if (targetObjectType === "lead" || targetObjectType === "0-136") {
            const targetStage = intent.details?.targetLeadStage ? String(intent.details.targetLeadStage) : intent.newState === "WON" ? "qualified" : "mql";
            const updateProps = {
              hs_pipeline_stage: targetStage,
              coa_qualification_state: intent.qualificationState,
              coa_last_evaluated_at: nowIso,
              coa_unsatisfied_goal_keys: unsatisfiedJson
            };
            if (intent.details?.targetOpportunityType) {
              updateProps.coa_opportunity_type = intent.details.targetOpportunityType;
            }
            if (intent.details?.mqlCompletedAt) {
              updateProps.coa_mql_completed_at = intent.details.mqlCompletedAt;
            }
            if (offeringKeysStr) {
              updateProps.coa_offering_keys = offeringKeysStr;
            }
            await this.leadsApi.basicApi.update(targetId, { properties: updateProps });
            const readback = await this.leadsApi.basicApi.getById(targetId, [
              "coa_qualification_state",
              "hs_pipeline_stage",
              "coa_config_version",
              "coa_last_evaluated_at",
              "coa_unsatisfied_goal_keys",
              "coa_mql_completed_at",
              "coa_opportunity_type",
              "coa_offering_keys"
            ]);
            const readState = readback?.properties?.coa_qualification_state;
            const readStage = readback?.properties?.hs_pipeline_stage;
            const readUnsatisfied = readback?.properties?.coa_unsatisfied_goal_keys;
            const readMqlTime = readback?.properties?.coa_mql_completed_at;
            const readOppType = readback?.properties?.coa_opportunity_type;
            const readOfferings = readback?.properties?.coa_offering_keys;
            const verified = readState === intent.qualificationState && readStage === targetStage && readUnsatisfied === unsatisfiedJson && Boolean(readback?.properties?.coa_last_evaluated_at) && readback?.properties?.coa_config_version === (config?.configVersion || "1.0.0") && (!intent.details?.targetOpportunityType || readOppType === intent.details.targetOpportunityType) && (!intent.details?.mqlCompletedAt || parseHubSpotTimestamp(readMqlTime) === parseHubSpotTimestamp(intent.details.mqlCompletedAt)) && (!offeringKeysStr || readOfferings === offeringKeysStr);
            receipts.push({
              intentKind: "UPDATE_OPPORTUNITY",
              objectType: "lead",
              objectId: targetId,
              operation: "UPDATE",
              verified
            });
          } else {
            const updateProps = {
              coa_qualification_state: intent.qualificationState,
              coa_last_evaluated_at: nowIso,
              coa_unsatisfied_goal_keys: unsatisfiedJson
            };
            const targetStage = intent.details?.targetDealStage ? String(intent.details.targetDealStage) : intent.newState === "WON" ? "closedwon" : "open";
            updateProps.dealstage = targetStage;
            if (offeringKeysStr) {
              updateProps.coa_offering_keys = offeringKeysStr;
            }
            await this.client.crm.deals.basicApi.update(targetId, { properties: updateProps });
            const readback = await this.client.crm.deals.basicApi.getById(targetId, [
              "coa_qualification_state",
              "dealstage",
              "coa_config_version",
              "coa_last_evaluated_at",
              "coa_unsatisfied_goal_keys",
              "coa_offering_keys"
            ]);
            const verified = readback?.properties?.coa_qualification_state === intent.qualificationState && readback?.properties?.dealstage === targetStage && readback?.properties?.coa_unsatisfied_goal_keys === unsatisfiedJson && Boolean(readback?.properties?.coa_last_evaluated_at) && readback?.properties?.coa_config_version === (config?.configVersion || "1.0.0");
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
        if (!intent.predecessorCompletedAt) {
          throw new Error(`MISSING_PREDECESSOR_COMPLETION_TIMESTAMP: Predecessor completion timestamp is required to create successor Deal '${intent.successorKey}'`);
        }
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
              "coa_qualification_state",
              "coa_offering_keys"
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
          const pipelineId = config?.hubspotPipelines?.dealPipelineId || (config?.relationshipType === "b2c" ? "b2c_transaction_deal_pipeline" : "b2b_transaction_deal_pipeline");
          const predecessorCompletedAt = intent.predecessorCompletedAt;
          const offeringKeysStr = (intent.offerings || []).map((o) => o.offeringKey).join(",");
          let targetDealId = "";
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
            const dealProps = {
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
              coa_config_version: config?.configVersion || "1.0.0",
              coa_last_evaluated_at: (/* @__PURE__ */ new Date()).toISOString()
            };
            if (offeringKeysStr) {
              dealProps.coa_offering_keys = offeringKeysStr;
            }
            const newDeal = await this.client.crm.deals.basicApi.create({
              properties: dealProps,
              associations
            });
            targetDealId = newDeal.id;
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
            const readbackPredTime = parseHubSpotTimestamp(readback?.properties?.coa_predecessor_completed_at);
            const targetPredTime = parseHubSpotTimestamp(predecessorCompletedAt);
            const predTimeExactMatch = Boolean(readbackPredTime && targetPredTime && new Date(readbackPredTime).getTime() === new Date(targetPredTime).getTime());
            const propVerified = readback?.properties?.dealname === `Transaction Deal - ${intent.successorKey}` && readback?.properties?.coa_opportunity_key === intent.successorKey && readback?.properties?.coa_opportunity_type === intent.successorType && readback?.properties?.coa_cycle_index === String(intent.cycleIndex) && readback?.properties?.pipeline === pipelineId && readback?.properties?.dealstage === "open" && readback?.properties?.coa_relationship_key === relKey && readback?.properties?.coa_relationship_type === (config?.relationshipType || "b2b") && readback?.properties?.coa_predecessor_opportunity_key === intent.predecessorKey && predTimeExactMatch && readback?.properties?.coa_config_version === (config?.configVersion || "1.0.0") && readback?.properties?.coa_qualification_state === "PENDING" && readback?.properties?.coa_managed === "true";
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
            targetDealId = existingDeal.id;
            const props = existingDeal.properties || {};
            const readbackPredTime = parseHubSpotTimestamp(props.coa_predecessor_completed_at);
            const targetPredTime = parseHubSpotTimestamp(predecessorCompletedAt);
            const predTimeExactMatch = Boolean(readbackPredTime && targetPredTime && new Date(readbackPredTime).getTime() === new Date(targetPredTime).getTime());
            const propVerified = (props.dealname === `Transaction Deal - ${intent.successorKey}` || Boolean(props.dealname)) && props.coa_opportunity_key === intent.successorKey && props.coa_opportunity_type === intent.successorType && props.coa_cycle_index === String(intent.cycleIndex) && props.pipeline === pipelineId && props.coa_relationship_key === relKey && props.coa_relationship_type === (config?.relationshipType || "b2b") && props.coa_predecessor_opportunity_key === intent.predecessorKey && predTimeExactMatch && props.coa_config_version === (config?.configVersion || "1.0.0") && props.coa_managed === "true";
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
          if (intent.offerings && intent.offerings.length > 0 && targetDealId) {
            const productKeyProp = config?.offeringPolicy?.productOfferingKeyProperty || "hs_sku";
            for (const offering of intent.offerings) {
              const product = await this.resolveProductForOfferingKey(offering.offeringKey, productKeyProp);
              const lineItemKey = `${intent.successorKey}::${offering.offeringKey}`;
              let existingLineItemId = void 0;
              try {
                const existingLIAssocs = await this.client.crm.associations.v4.basicApi.getPage("deal", Number(targetDealId) || targetDealId, "line_item");
                for (const assoc of existingLIAssocs.results || []) {
                  const liRecord = await this.client.crm.lineItems.basicApi.getById(String(assoc.toObjectId), ["name", "hs_sku", "hs_product_id", "coa_line_item_key", "quantity", "price"]);
                  const liProps = liRecord.properties || {};
                  if (liProps.coa_line_item_key === lineItemKey) {
                    existingLineItemId = liRecord.id;
                    break;
                  }
                }
              } catch (e) {
                if (e?.statusCode !== 404 && e?.status !== 404) throw e;
              }
              const expectedQuantity = String(offering.quantity || 1);
              const expectedPrice = String(offering.unitPrice || product.price || 0);
              if (existingLineItemId) {
                const liReadback = await this.client.crm.lineItems.basicApi.getById(existingLineItemId, [
                  "name",
                  "hs_product_id",
                  "hs_sku",
                  "quantity",
                  "price",
                  "coa_line_item_key"
                ]);
                let dealAssocVerified = false;
                try {
                  const dAssoc = await this.client.crm.associations.v4.basicApi.getPage("line_item", Number(existingLineItemId) || existingLineItemId, "deal");
                  dealAssocVerified = (dAssoc.results || []).some((r) => String(r.toObjectId) === String(targetDealId));
                } catch {
                  dealAssocVerified = false;
                }
                const liVerified = liReadback?.properties?.coa_line_item_key === lineItemKey && liReadback?.properties?.hs_product_id === product.id && String(liReadback?.properties?.quantity) === expectedQuantity && String(liReadback?.properties?.price) === expectedPrice && dealAssocVerified;
                receipts.push({
                  intentKind: "CREATE_LINE_ITEM",
                  objectType: "line_item",
                  objectId: existingLineItemId,
                  operation: "NOOP",
                  verified: liVerified
                });
              } else {
                let newLineItemId = void 0;
                try {
                  const newLineItem = await this.client.crm.lineItems.basicApi.create({
                    properties: {
                      name: offering.offeringKey,
                      hs_product_id: product.id,
                      hs_sku: offering.offeringKey,
                      coa_line_item_key: lineItemKey,
                      quantity: expectedQuantity,
                      price: expectedPrice
                    },
                    associations: [{
                      to: { id: targetDealId },
                      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 20 }]
                      // Association type 20: Line Item -> Deal
                    }]
                  });
                  newLineItemId = newLineItem.id;
                } catch (createErr) {
                  if (createErr?.statusCode === 409 || createErr?.status === 409 || createErr?.code === 409) {
                    const searchWinner = await this.client.crm.lineItems.searchApi.doSearch({
                      filterGroups: [{ filters: [{ propertyName: "coa_line_item_key", operator: "EQ", value: lineItemKey }] }],
                      sorts: [],
                      properties: ["name", "hs_product_id", "hs_sku", "quantity", "price", "coa_line_item_key"],
                      limit: 1,
                      after: 0
                    });
                    if (searchWinner.results && searchWinner.results.length > 0) {
                      newLineItemId = searchWinner.results[0].id;
                    } else {
                      throw createErr;
                    }
                  } else {
                    throw createErr;
                  }
                }
                const liReadback = await this.client.crm.lineItems.basicApi.getById(newLineItemId, [
                  "name",
                  "hs_product_id",
                  "hs_sku",
                  "quantity",
                  "price",
                  "coa_line_item_key"
                ]);
                let dealAssocVerified = false;
                try {
                  const dAssoc = await this.client.crm.associations.v4.basicApi.getPage("line_item", Number(newLineItemId) || newLineItemId, "deal");
                  dealAssocVerified = (dAssoc.results || []).some((r) => String(r.toObjectId) === String(targetDealId));
                } catch {
                  dealAssocVerified = false;
                }
                const liVerified = liReadback?.properties?.coa_line_item_key === lineItemKey && liReadback?.properties?.hs_product_id === product.id && String(liReadback?.properties?.quantity) === expectedQuantity && String(liReadback?.properties?.price) === expectedPrice && dealAssocVerified;
                receipts.push({
                  intentKind: "CREATE_LINE_ITEM",
                  objectType: "line_item",
                  objectId: newLineItemId,
                  operation: "CREATE",
                  verified: liVerified
                });
              }
            }
          }
          appliedIntents++;
        }
      } else if (intent.kind === "CREATE_MANUAL_REVIEW") {
        const tasksApi = this.client.crm.objects.tasks || this.client.crm.objects?.tasks;
        const subjectId = intent.subject.key;
        const assocTypeId = intent.subject.kind === "CONTACT" ? 204 : 192;
        const taskMarker = `[COA_OPPORTUNITY_KEY:${intent.opportunityKey}]`;
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        let existingTaskId = void 0;
        try {
          const taskAssocs = await this.client.crm.associations.v4.basicApi.getPage(
            intent.subject.kind === "CONTACT" ? "contact" : "company",
            Number(subjectId) || subjectId,
            "task"
          );
          for (const assoc of taskAssocs.results || []) {
            const taskRecord = await tasksApi.basicApi.getById(String(assoc.toObjectId), ["hs_task_subject", "hs_task_body", "hs_task_status", "hs_timestamp"]);
            const body = taskRecord.properties?.hs_task_body || "";
            const subjectStr = taskRecord.properties?.hs_task_subject || "";
            const statusStr = taskRecord.properties?.hs_task_status || "";
            if ((body.includes(taskMarker) || subjectStr.includes(intent.opportunityKey)) && statusStr !== "COMPLETED") {
              existingTaskId = taskRecord.id;
              break;
            }
          }
        } catch (e) {
          if (e?.statusCode !== 404 && e?.status !== 404) throw e;
        }
        if (existingTaskId) {
          receipts.push({
            intentKind: "CREATE_MANUAL_REVIEW",
            objectType: "task",
            objectId: existingTaskId,
            operation: "NOOP",
            verified: true
          });
        } else {
          const associations = [{
            to: { id: subjectId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: assocTypeId }]
          }];
          const taskRes = await tasksApi.basicApi.create({
            properties: {
              hs_task_subject: `Manual Review Required: ${intent.reason}`,
              hs_task_status: "NOT_STARTED",
              hs_task_priority: "HIGH",
              hs_task_body: `Opportunity key ${intent.opportunityKey} requires manual review. Reason: ${intent.reason} ${taskMarker}`,
              hs_timestamp: nowIso
            },
            associations
          });
          const readback = await tasksApi.basicApi.getById(taskRes.id, ["hs_task_subject", "hs_task_status", "hs_task_body", "hs_timestamp"]);
          const verified = Boolean(readback?.properties?.hs_task_subject?.startsWith("Manual Review Required")) && Boolean(readback?.properties?.hs_task_body?.includes(taskMarker)) && Boolean(readback?.properties?.hs_timestamp);
          receipts.push({
            intentKind: "CREATE_MANUAL_REVIEW",
            objectType: "task",
            objectId: taskRes.id,
            operation: "CREATE",
            verified
          });
        }
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
  /**
   * Bounded association pagination helper with strict fail-closed error handling.
   * Pages through all associations matching fromObjectType -> toObjectType.
   */
  async getAllAssociations(fromObjectType, fromObjectId, toObjectType, maxPages = 10) {
    const results = [];
    let after = void 0;
    let pageCount = 0;
    do {
      pageCount++;
      try {
        const res = await this.client.crm.associations.v4.basicApi.getPage(
          fromObjectType,
          Number(fromObjectId) || fromObjectId,
          toObjectType,
          after,
          100
        );
        if (res.results && res.results.length > 0) {
          results.push(...res.results);
        }
        after = res.paging?.next?.after;
      } catch (err) {
        const is404 = err?.statusCode === 404 || err?.status === 404 || err?.code === 404;
        if (is404 && pageCount === 1) {
          return [];
        }
        throw new Error(`ASSOCIATION_PAGINATION_FAILED: Failed to load associations for ${fromObjectType}:${fromObjectId} -> ${toObjectType} on page ${pageCount}: ${err.message || err}`);
      }
      if (after && pageCount >= maxPages) {
        throw new Error(`ASSOCIATION_PAGINATION_LIMIT_EXCEEDED: Exceeded maxPages (${maxPages}) while more associations remain for ${fromObjectType}:${fromObjectId} -> ${toObjectType}`);
      }
    } while (after && pageCount < maxPages);
    return results;
  }
  /**
   * Explicit primary contact resolution from list of associated contact IDs.
   */
  async resolvePrimaryContactId(fromObjectType, fromObjectId, associationResults) {
    if (!associationResults || associationResults.length === 0) {
      return { primaryContactId: null, isAmbiguous: false };
    }
    if (associationResults.length === 1) {
      return { primaryContactId: String(associationResults[0].toObjectId), isAmbiguous: false };
    }
    for (const assoc of associationResults) {
      const types = assoc.associationTypes || [];
      for (const t of types) {
        const label = String(t.label || t.type || "").toLowerCase();
        if (label.includes("primary") || t.associationTypeId === 1) {
          return { primaryContactId: String(assoc.toObjectId), isAmbiguous: false };
        }
      }
    }
    return { primaryContactId: null, isAmbiguous: true };
  }
  /**
   * Explicit primary company resolution from list of associated company IDs for Contact.
   */
  async resolvePrimaryCompanyId(contactId, companyAssocs) {
    if (!companyAssocs || companyAssocs.length === 0) {
      return { primaryCompanyId: null, isAmbiguous: false };
    }
    if (companyAssocs.length === 1) {
      return { primaryCompanyId: String(companyAssocs[0].toObjectId), isAmbiguous: false };
    }
    for (const assoc of companyAssocs) {
      const types = assoc.associationTypes || [];
      for (const t of types) {
        const label = String(t.label || t.type || "").toLowerCase();
        if (label.includes("primary") || t.associationTypeId === 1) {
          return { primaryCompanyId: String(assoc.toObjectId), isAmbiguous: false };
        }
      }
    }
    return { primaryCompanyId: null, isAmbiguous: true };
  }
  async loadSnapshotFromRecord(recordRef, organizationKey = "org_global_corp", relationshipType = "b2b") {
    return this.loadPureSnapshotFromHubSpot(recordRef, organizationKey, relationshipType);
  }
  async loadPureSnapshotFromHubSpot(recordRef, organizationKey = "org_global_corp", relationshipType = "b2b") {
    const rawType = (recordRef.objectType || "").toLowerCase();
    let subjectKind = "CONTACT";
    let subjectKey = "";
    let contactKeys = [];
    let companyKey = void 0;
    let primaryContactId = void 0;
    let facts = {};
    let evidence = [];
    let offerings = [];
    let opportunityKey = "";
    let opportunityType = "MQL";
    let opportunityState = "OPEN";
    let cycleIndex = 1;
    let openedAt = (/* @__PURE__ */ new Date()).toISOString();
    let predecessorCompletedAt = void 0;
    let mqlCompletedAt = void 0;
    let relationshipKey = "";
    if (rawType === "contact" || rawType === "0-1") {
      subjectKind = "CONTACT";
      subjectKey = recordRef.objectId;
      contactKeys = [recordRef.objectId];
      primaryContactId = recordRef.objectId;
      const contact = await this.client.crm.contacts.basicApi.getById(recordRef.objectId, [
        "email",
        "phone",
        "firstname",
        "lastname",
        "lifecyclestage",
        "coa_relationship_key",
        "coa_relationship_type",
        "coa_marketing_consent",
        "coa_automation_suppressed",
        "createdate"
      ]);
      const cProps = contact.properties || {};
      let companySuppressed = false;
      const companyAssocs = await this.getAllAssociations("contact", recordRef.objectId, "company");
      const { primaryCompanyId, isAmbiguous: isCompanyAmbiguous } = await this.resolvePrimaryCompanyId(recordRef.objectId, companyAssocs);
      if (isCompanyAmbiguous) {
        facts.ambiguousPrimaryCompany = true;
        facts.manualReviewRequired = true;
      }
      companyKey = primaryCompanyId || void 0;
      if (companyKey) {
        try {
          const compRecord = await this.client.crm.companies.basicApi.getById(companyKey, [
            "coa_relationship_key",
            "coa_automation_suppressed"
          ]);
          companySuppressed = compRecord.properties?.coa_automation_suppressed === "true" || compRecord.properties?.coa_automation_suppressed === "1";
        } catch (err) {
          if (err?.statusCode !== 404 && err?.status !== 404) throw err;
        }
      }
      if (relationshipType === "b2b") {
        if (companyKey) {
          relationshipKey = deriveRelationshipKey(organizationKey, "b2b", companyKey);
        } else {
          facts.missingCompany = true;
          facts.manualReviewRequired = true;
          relationshipKey = deriveRelationshipKey(organizationKey, "review", recordRef.objectId);
        }
      } else {
        relationshipKey = deriveRelationshipKey(organizationKey, "b2c", recordRef.objectId);
      }
      opportunityKey = `${relationshipKey}::LEAD::1`;
      const contactSuppressed = cProps.coa_automation_suppressed === "true" || cProps.coa_automation_suppressed === "1";
      facts = {
        ...facts,
        email: cProps.email || void 0,
        contactEmail: cProps.email || void 0,
        phone: cProps.phone || void 0,
        lifecycleStage: cProps.lifecyclestage || void 0,
        marketingConsent: cProps.coa_marketing_consent === "true" || cProps.coa_marketing_consent === "1",
        automationSuppressed: Boolean(contactSuppressed || companySuppressed)
      };
      openedAt = parseHubSpotTimestamp(cProps.createdate) || openedAt;
    } else if (rawType === "company" || rawType === "0-2") {
      subjectKind = "COMPANY";
      subjectKey = recordRef.objectId;
      companyKey = recordRef.objectId;
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
      let contactPhone = void 0;
      const contactAssocs = await this.getAllAssociations("company", recordRef.objectId, "contact");
      const { primaryContactId: resolvedPrimary, isAmbiguous } = await this.resolvePrimaryContactId("company", recordRef.objectId, contactAssocs);
      if (contactAssocs.length > 0) {
        contactKeys = contactAssocs.map((r) => String(r.toObjectId));
      }
      if (isAmbiguous) {
        facts.ambiguousPrimaryContact = true;
        facts.manualReviewRequired = true;
        primaryContactId = void 0;
      } else {
        primaryContactId = resolvedPrimary || (contactKeys.length === 1 ? contactKeys[0] : void 0);
      }
      if (primaryContactId) {
        try {
          const primaryContact = await this.client.crm.contacts.basicApi.getById(primaryContactId, [
            "email",
            "phone",
            "coa_relationship_key",
            "coa_automation_suppressed"
          ]);
          contactEmail = primaryContact.properties?.email || void 0;
          contactPhone = primaryContact.properties?.phone || void 0;
          contactSuppressed = primaryContact.properties?.coa_automation_suppressed === "true" || primaryContact.properties?.coa_automation_suppressed === "1";
        } catch (err) {
          if (err?.statusCode !== 404 && err?.status !== 404) throw err;
        }
      }
      relationshipKey = deriveRelationshipKey(organizationKey, "b2b", recordRef.objectId);
      opportunityKey = `${relationshipKey}::LEAD::1`;
      const compSuppressed = compProps.coa_automation_suppressed === "true" || compProps.coa_automation_suppressed === "1";
      facts = {
        ...facts,
        domain: compProps.domain || void 0,
        companyName: compProps.name || void 0,
        email: contactEmail,
        contactEmail,
        phone: contactPhone,
        lifecycleStage: compProps.lifecyclestage || void 0,
        marketingConsent: compProps.coa_marketing_consent === "true" || compProps.coa_marketing_consent === "1",
        automationSuppressed: Boolean(compSuppressed || contactSuppressed),
        ambiguousPrimaryContact: isAmbiguous
      };
      openedAt = parseHubSpotTimestamp(compProps.createdate) || openedAt;
    } else if (rawType === "lead" || rawType === "0-136") {
      const lead = await this.leadsApi.basicApi.getById(recordRef.objectId, [
        "coa_opportunity_key",
        "coa_relationship_key",
        "coa_relationship_type",
        "coa_opportunity_type",
        "coa_cycle_index",
        "hs_pipeline_stage",
        "coa_qualification_state",
        "coa_predecessor_opportunity_key",
        "coa_mql_completed_at",
        "coa_offering_keys",
        "createdate"
      ]);
      const lProps = lead.properties || {};
      const cAssocs = await this.getAllAssociations("lead", recordRef.objectId, "contact");
      if (cAssocs.length > 0) {
        const { primaryContactId: resContact, isAmbiguous } = await this.resolvePrimaryContactId("lead", recordRef.objectId, cAssocs);
        contactKeys = cAssocs.map((r) => String(r.toObjectId));
        if (isAmbiguous) {
          facts.ambiguousPrimaryContact = true;
          facts.manualReviewRequired = true;
          primaryContactId = void 0;
        } else {
          primaryContactId = resContact || (contactKeys.length === 1 ? contactKeys[0] : void 0);
        }
      }
      const compAssocs = await this.getAllAssociations("lead", recordRef.objectId, "company");
      if (compAssocs.length > 0) {
        companyKey = String(compAssocs[0].toObjectId);
      }
      if (companyKey) {
        subjectKind = "COMPANY";
        subjectKey = companyKey;
      } else if (primaryContactId) {
        subjectKind = "CONTACT";
        subjectKey = primaryContactId;
      }
      const anchor = companyKey || primaryContactId || recordRef.objectId;
      relationshipKey = lProps.coa_relationship_key || deriveRelationshipKey(organizationKey, relationshipType, anchor);
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
        const rawKeys = String(lProps.coa_offering_keys).split(",").map((s) => s.trim()).filter(Boolean);
        facts.offeringKeys = rawKeys;
        offerings = rawKeys.map((k) => ({ offeringKey: k, quantity: 1 }));
      }
      mqlCompletedAt = parseHubSpotTimestamp(lProps.coa_mql_completed_at) || void 0;
      cycleIndex = Number(lProps.coa_cycle_index) || 1;
      openedAt = parseHubSpotTimestamp(lProps.createdate) || openedAt;
    } else if (rawType === "deal" || rawType === "0-3") {
      const deal = await this.client.crm.deals.basicApi.getById(recordRef.objectId, [
        "dealname",
        "amount",
        "dealstage",
        "pipeline",
        "closedate",
        "coa_opportunity_key",
        "coa_relationship_key",
        "coa_relationship_type",
        "coa_opportunity_type",
        "coa_cycle_index",
        "coa_qualification_state",
        "coa_predecessor_opportunity_key",
        "coa_predecessor_completed_at",
        "coa_mql_completed_at",
        "coa_offering_keys",
        "createdate"
      ]);
      const dProps = deal.properties || {};
      const cAssocs = await this.getAllAssociations("deal", recordRef.objectId, "contact");
      if (cAssocs.length > 0) {
        const { primaryContactId: resContact, isAmbiguous } = await this.resolvePrimaryContactId("deal", recordRef.objectId, cAssocs);
        contactKeys = cAssocs.map((r) => String(r.toObjectId));
        if (isAmbiguous) {
          facts.ambiguousPrimaryContact = true;
          facts.manualReviewRequired = true;
          primaryContactId = void 0;
        } else {
          primaryContactId = resContact || (contactKeys.length === 1 ? contactKeys[0] : void 0);
        }
      }
      const compAssocs = await this.getAllAssociations("deal", recordRef.objectId, "company");
      if (compAssocs.length > 0) {
        companyKey = String(compAssocs[0].toObjectId);
      }
      if (companyKey) {
        subjectKind = "COMPANY";
        subjectKey = companyKey;
      } else if (primaryContactId) {
        subjectKind = "CONTACT";
        subjectKey = primaryContactId;
      }
      const anchor = companyKey || primaryContactId || recordRef.objectId;
      relationshipKey = dProps.coa_relationship_key || deriveRelationshipKey(organizationKey, relationshipType, anchor);
      opportunityType = dProps.coa_opportunity_type || "FTP";
      cycleIndex = Number(dProps.coa_cycle_index) || 1;
      opportunityKey = dProps.coa_opportunity_key || `${relationshipKey}::${opportunityType}::${cycleIndex}`;
      const stage = (dProps.dealstage || "open").toLowerCase();
      openedAt = parseHubSpotTimestamp(dProps.createdate) || openedAt;
      if (stage === "closedwon") {
        opportunityState = "WON";
        facts.transactionCompleted = true;
        facts.closedAt = parseHubSpotTimestamp(dProps.closedate || dProps.closedAt || dProps.coa_predecessor_completed_at) || openedAt;
      } else if (stage === "closedlost") {
        opportunityState = "LOST";
      } else {
        opportunityState = "OPEN";
      }
      const lineItemAssocs = await this.getAllAssociations("deal", recordRef.objectId, "line_item");
      if (lineItemAssocs.length > 0) {
        const loadedOfferings = [];
        for (const lineAssoc of lineItemAssocs) {
          try {
            const li = await this.client.crm.lineItems.basicApi.getById(String(lineAssoc.toObjectId), [
              "name",
              "quantity",
              "price",
              "hs_product_id",
              "hs_sku",
              "coa_line_item_key"
            ]);
            const liProps = li.properties || {};
            const key = liProps.hs_sku || liProps.name;
            if (key) {
              loadedOfferings.push({
                offeringKey: key,
                quantity: Number(liProps.quantity || 1),
                unitPrice: Number(liProps.price || 0)
              });
            }
          } catch (e) {
            if (e?.statusCode !== 404 && e?.status !== 404) throw e;
          }
        }
        if (loadedOfferings.length > 0) {
          offerings = loadedOfferings;
          facts.offeringKeys = loadedOfferings.map((o) => o.offeringKey);
        }
      } else if (dProps.coa_offering_keys) {
        const rawKeys = String(dProps.coa_offering_keys).split(",").map((s) => s.trim()).filter(Boolean);
        facts.offeringKeys = rawKeys;
        offerings = rawKeys.map((k) => ({ offeringKey: k, quantity: 1 }));
      }
      predecessorCompletedAt = parseHubSpotTimestamp(dProps.coa_predecessor_completed_at) || void 0;
      mqlCompletedAt = parseHubSpotTimestamp(dProps.coa_mql_completed_at) || void 0;
    } else {
      throw new Error(`INVALID_ENROLLMENT: Unsupported objectType '${recordRef.objectType}'`);
    }
    if (primaryContactId) {
      try {
        const primaryContact = await this.client.crm.contacts.basicApi.getById(primaryContactId, [
          "email",
          "phone",
          "lifecyclestage",
          "coa_marketing_consent",
          "coa_automation_suppressed"
        ]);
        const pcProps = primaryContact.properties || {};
        facts.email = pcProps.email || facts.email;
        facts.contactEmail = pcProps.email || facts.contactEmail;
        facts.phone = pcProps.phone || facts.phone;
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
    if (primaryContactId) {
      try {
        const lowerTime = predecessorCompletedAt ? new Date(predecessorCompletedAt).getTime() : new Date(openedAt).getTime();
        const meetingAssocs = await this.getAllAssociations("contact", primaryContactId, "meeting");
        for (const assoc of meetingAssocs) {
          const meetingId = String(assoc.toObjectId);
          const meeting = await this.client.crm.objects.meetings.basicApi.getById(meetingId, [
            "hs_meeting_outcome",
            "hs_timestamp"
          ]);
          const parsedTime = parseHubSpotTimestamp(meeting.properties.hs_timestamp);
          if (parsedTime && new Date(parsedTime).getTime() > lowerTime) {
            const rawOutcome = String(meeting.properties.hs_meeting_outcome || "").toUpperCase();
            let outcome = "HELD";
            if (rawOutcome === "COMPLETED") outcome = "COMPLETED";
            else if (rawOutcome === "RESCHEDULED") outcome = "RESCHEDULED";
            else if (rawOutcome === "NO_SHOW") outcome = "NO_SHOW";
            else if (rawOutcome === "CANCELED") outcome = "CANCELED";
            evidence.push({
              id: meeting.id,
              predicate: "activityExists",
              scope: "opportunity",
              occurredAt: parsedTime,
              data: {
                activityType: "MEETING",
                outcome
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
      mqlCompletedAt,
      offerings,
      subject: {
        kind: subjectKind,
        key: subjectKey,
        contactKeys,
        companyKey,
        phone: facts.phone,
        email: facts.email
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
  const needsManualReview = Boolean(
    snapshot.facts.missingCompany === true || snapshot.facts.ambiguousPrimaryCompany === true || snapshot.facts.ambiguousPrimaryContact === true || snapshot.facts.manualReviewRequired === true
  );
  if ((objectType === "contact" || objectType === "0-1" || objectType === "company" || objectType === "0-2") && !needsManualReview) {
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
