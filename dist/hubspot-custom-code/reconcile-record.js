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
    const customGoals = config.goalsByOpportunityType[oppType] || [];
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
function evaluatePredicate(goal, snapshot) {
  const matchingEvidence = snapshot.evidence.filter((ev) => {
    if (goal.scope === "opportunity" && ev.occurredAt < snapshot.openedAt) {
      return false;
    }
    if (goal.scope === "sincePredecessorCompletion") {
      if (!snapshot.predecessorCompletedAt || ev.occurredAt <= snapshot.predecessorCompletedAt) {
        return false;
      }
    }
    return true;
  });
  switch (goal.predicate) {
    case "hasIdentity":
    case "anyCommunicationChannel": {
      const email = snapshot.facts.email || snapshot.facts.contactEmail;
      const phone = snapshot.facts.phone;
      const satisfied = Boolean(email || phone);
      return { satisfied, evidenceRefs: satisfied ? ["fact_communication_channel"] : [] };
    }
    case "hasOfferingInterest":
    case "offeringKnown": {
      const products = snapshot.facts.products || snapshot.facts.offeringKeys || snapshot.facts.offering || snapshot.facts.lineItems;
      const hasOffering = Array.isArray(products) ? products.length > 0 : Boolean(products);
      const evMatches = matchingEvidence.filter((e) => e.predicate === "offeringKnown" || e.data?.productKey);
      const satisfied = hasOffering || evMatches.length > 0;
      const refs = evMatches.map((e) => e.id);
      if (hasOffering) refs.push("fact_offering_known");
      return { satisfied, evidenceRefs: refs };
    }
    case "activityExists": {
      const activityType = goal.params?.activityType;
      const requiredOutcome = goal.params?.outcome;
      const evMatches = matchingEvidence.filter((e) => {
        if (activityType && e.data?.activityType !== activityType) return false;
        if (requiredOutcome && e.data?.outcome !== requiredOutcome) return false;
        return true;
      });
      return { satisfied: evMatches.length > 0, evidenceRefs: evMatches.map((e) => e.id) };
    }
    case "associationExists": {
      const objectType = goal.params?.objectType;
      const evMatches = matchingEvidence.filter((e) => e.data?.associatedObjectType === objectType || e.predicate === "associationExists");
      return { satisfied: evMatches.length > 0, evidenceRefs: evMatches.map((e) => e.id) };
    }
    case "transactionComplete":
    case "transactionExists": {
      const evMatches = matchingEvidence.filter((e) => e.predicate === "transactionExists" || e.data?.transactionId || e.data?.orderId);
      let hasFactTransaction = false;
      if (snapshot.facts.transactionCompleted === true || snapshot.facts.stage === "closedwon") {
        const factTxTime = snapshot.facts.transactionCompletedAt || snapshot.openedAt;
        if (goal.scope === "sincePredecessorCompletion") {
          hasFactTransaction = Boolean(snapshot.predecessorCompletedAt && factTxTime > snapshot.predecessorCompletedAt);
        } else {
          hasFactTransaction = true;
        }
      }
      const satisfied = hasFactTransaction || evMatches.length > 0;
      const refs = evMatches.map((e) => e.id);
      if (hasFactTransaction) refs.push("fact_transaction_completed");
      return { satisfied, evidenceRefs: refs };
    }
    case "property": {
      const propName = goal.params?.property;
      const val = snapshot.facts[propName];
      let satisfied = false;
      if (goal.params?.equals !== void 0) {
        satisfied = val === goal.params.equals;
      } else if (goal.params?.notEquals !== void 0) {
        satisfied = val !== goal.params.notEquals;
      } else if (Array.isArray(goal.params?.in)) {
        satisfied = goal.params.in.includes(val);
      } else if (goal.params?.greaterThan !== void 0) {
        satisfied = Number(val) > Number(goal.params.greaterThan);
      } else if (goal.params?.lessThan !== void 0) {
        satisfied = Number(val) < Number(goal.params.lessThan);
      } else {
        satisfied = val !== void 0 && val !== null;
      }
      return { satisfied, evidenceRefs: satisfied ? [`fact_prop_${propName}`] : [] };
    }
    case "count": {
      const targetPredicate = goal.params?.targetPredicate;
      const threshold = Number(goal.params?.threshold || 1);
      const evMatches = matchingEvidence.filter((e) => e.predicate === targetPredicate);
      const satisfied = evMatches.length >= threshold;
      return { satisfied, evidenceRefs: evMatches.map((e) => e.id) };
    }
    case "all": {
      const subGoals = goal.params?.goals || [];
      const results = subGoals.map((g) => evaluatePredicate(g, snapshot));
      const satisfied = results.every((r) => r.satisfied);
      const refs = results.flatMap((r) => r.evidenceRefs);
      return { satisfied, evidenceRefs: refs };
    }
    case "any": {
      const subGoals = goal.params?.goals || [];
      const results = subGoals.map((g) => evaluatePredicate(g, snapshot));
      const satisfied = results.some((r) => r.satisfied);
      const refs = results.flatMap((r) => r.evidenceRefs);
      return { satisfied, evidenceRefs: refs };
    }
    case "not": {
      const subGoal = goal.params?.goal;
      const result = subGoal ? evaluatePredicate(subGoal, snapshot) : { satisfied: false, evidenceRefs: [] };
      return { satisfied: !result.satisfied, evidenceRefs: [] };
    }
    default: {
      return { satisfied: false, evidenceRefs: [] };
    }
  }
}
function evaluateOpportunity(snapshot, config) {
  const fullConfig = injectUniversalGoals(config);
  const goals = fullConfig.goalsByOpportunityType[snapshot.opportunityType] || [];
  if (config.featureFlags?.automationSuppressed || snapshot.facts.automationSuppressed === true || snapshot.facts.blocked === true) {
    return {
      qualificationState: "BLOCKED",
      satisfiedGoalKeys: [],
      unsatisfiedGoalKeys: goals.map((g) => g.key),
      evidenceRefsByGoal: {},
      evaluatedConfigVersion: fullConfig.configVersion
    };
  }
  const satisfiedGoalKeys = [];
  const unsatisfiedGoalKeys = [];
  const evidenceRefsByGoal = {};
  for (const goal of goals) {
    const res = evaluatePredicate(goal, snapshot);
    if (res.satisfied) {
      satisfiedGoalKeys.push(goal.key);
      evidenceRefsByGoal[goal.key] = res.evidenceRefs;
    } else {
      unsatisfiedGoalKeys.push(goal.key);
      evidenceRefsByGoal[goal.key] = [];
    }
  }
  let qualificationState = "PENDING";
  if (unsatisfiedGoalKeys.length === 0) {
    qualificationState = "SATISFIED";
  } else if (snapshot.facts.manualReviewRequired === true) {
    qualificationState = "MANUAL_REVIEW";
  }
  return {
    qualificationState,
    satisfiedGoalKeys,
    unsatisfiedGoalKeys,
    evidenceRefsByGoal,
    evaluatedConfigVersion: fullConfig.configVersion
  };
}

// packages/commercial-kernel/planner.ts
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
function planTransition(snapshot, evaluation, config) {
  if (snapshot.opportunityState === "WON" || snapshot.opportunityState === "LOST") {
    return [{ kind: "NOOP", reason: `Opportunity is already closed (${snapshot.opportunityState})` }];
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
        targetDealStage: currentDealStage
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
      details: { targetOpportunityType: "SQL", targetLeadStage: "sql", mqlCompletedAt: (/* @__PURE__ */ new Date()).toISOString() }
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
      details: { targetLeadStage: "qualified" }
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
      subject: snapshot.subject
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
    intents.push({
      kind: "CREATE_SUCCESSOR",
      predecessorKey: snapshot.opportunityKey,
      successorKey,
      successorType: "RTP",
      cycleIndex: 1,
      subject: snapshot.subject
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
    const nextCycleIndex = snapshot.cycleIndex + 1;
    const successorKey = deriveSuccessorKey(snapshot.relationshipKey, "RTP", nextCycleIndex);
    intents.push({
      kind: "CREATE_SUCCESSOR",
      predecessorKey: snapshot.opportunityKey,
      successorKey,
      successorType: "RTP",
      cycleIndex: nextCycleIndex,
      subject: snapshot.subject
    });
  }
  return intents;
}

// packages/domain/embedded-configs.ts
var EMBEDDED_INSTALLATIONS = {
  "149041124": {
    "organizationKey": "org_global_corp",
    "defaultRelationshipType": "b2b"
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
          "key": "b2b_contract_signed",
          "name": "First B2B transaction contract signed",
          "predicate": "transactionExists",
          "scope": "opportunity"
        }
      ],
      "RTP": [
        {
          "key": "b2b_renewal_order",
          "name": "Subsequent B2B transaction order",
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
  "org_consumer_brand:b2c": {
    "organizationKey": "org_consumer_brand",
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
          "key": "b2c_checkout_payment",
          "name": "First B2C checkout order payment",
          "predicate": "transactionExists",
          "scope": "opportunity"
        }
      ],
      "RTP": [
        {
          "key": "b2c_repeat_checkout",
          "name": "Repeat B2C checkout order payment",
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
  static resolveConfigByPortalId(portalId) {
    return new _OrganizationConfigResolver().resolveConfig({ portalId });
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
    let orgKey = options.organizationKey;
    let relType = options.relationshipType ? options.relationshipType.trim().toLowerCase() : void 0;
    const installation = options.portalId ? this.resolvePortalInstallation(options.portalId) : null;
    if (options.portalId && !installation) {
      throw new Error(`UNSUPPORTED_PORTAL: Portal '${options.portalId}' is not registered in portal-installations.yaml`);
    }
    if (!relType) {
      relType = installation?.defaultRelationshipType || "b2b";
    }
    if (!orgKey) {
      if (installation && (!options.relationshipType || options.relationshipType === installation.defaultRelationshipType)) {
        orgKey = installation.organizationKey;
      } else {
        orgKey = relType === "b2c" ? "org_consumer_brand" : "org_global_corp";
      }
    }
    const embeddedKey = `${orgKey}:${relType}`;
    if (EMBEDDED_CONFIGS[embeddedKey]) {
      const raw = EMBEDDED_CONFIGS[embeddedKey];
      const config = {
        organizationKey: raw.organizationKey || orgKey,
        configVersion: raw.configVersion || "1.0.0",
        relationshipType: raw.relationshipType || relType,
        goalsByOpportunityType: raw.goalsByOpportunityType || { MQL: [], SQL: [], FTP: [], RTP: [] },
        hubspotPipelines: raw.hubspotPipelines || {
          leadPipelineId: "b2b_qualification_lead_pipeline",
          dealPipelineId: "b2b_transaction_deal_pipeline"
        },
        featureFlags: raw.featureFlags || {}
      };
      const valRes = validateCommercialModel(config);
      if (valRes.valid) return config;
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
function parseHubSpotTimestamp(raw) {
  if (!raw) return null;
  try {
    if (typeof raw === "number") {
      if (isNaN(raw) || !isFinite(raw)) return null;
      const date = new Date(raw);
      if (isNaN(date.getTime())) return null;
      return date.toISOString();
    }
    const str = String(raw).trim();
    if (!isNaN(Number(str)) && !str.includes("-") && !str.includes("T")) {
      const num = Number(str);
      if (isNaN(num) || !isFinite(num)) return null;
      const date = new Date(num);
      if (isNaN(date.getTime())) return null;
      return date.toISOString();
    }
    const parsed = new Date(str);
    if (isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString();
  } catch (e) {
    return null;
  }
}
var HubspotAdapter = class {
  client;
  constructor(accessToken) {
    this.client = new import_api_client.Client({ accessToken });
  }
  getRawClient() {
    return this.client;
  }
  async inspectCapabilities(portalId) {
    try {
      const schemas = await this.client.crm.schemas.coreApi.getAll();
      const customObjectTypes = (schemas.results || []).map((s) => s.fullyQualifiedName);
      return {
        portalId,
        hasLeadObject: true,
        hasQuoteObject: true,
        hasOrderObject: true,
        hasLineItemObject: true,
        hasCustomObjects: customObjectTypes.length > 0
      };
    } catch (err) {
      logger.error("Failed to inspect portal capabilities", err);
      return {
        portalId,
        hasLeadObject: false,
        hasQuoteObject: false,
        hasOrderObject: false,
        hasLineItemObject: false,
        hasCustomObjects: false
      };
    }
  }
  async findOrCreateLeadForSubject(subject, relationshipKey, relationshipType = "b2b", config) {
    const leadKey = `${relationshipKey}::LEAD::1`;
    try {
      const searchRes = await this.client.crm.objects.leads.searchApi.doSearch({
        filterGroups: [{ filters: [{ propertyName: "coa_opportunity_key", operator: "EQ", value: leadKey }] }],
        sorts: [],
        properties: [
          "hs_pipeline_stage",
          "hs_lead_name",
          "createdate",
          "coa_opportunity_key",
          "coa_relationship_key",
          "coa_relationship_type",
          "coa_opportunity_type",
          "coa_qualification_state",
          "coa_cycle_index",
          "coa_offering_keys"
        ],
        limit: 1,
        after: "0"
      });
      if (searchRes.results && searchRes.results.length > 0) {
        return { id: searchRes.results[0].id, ...searchRes.results[0].properties };
      }
      let contactId = void 0;
      let companyId = void 0;
      if (subject.kind === "CONTACT") {
        contactId = subject.key;
      } else if (subject.kind === "COMPANY") {
        companyId = subject.key;
        if (subject.contactKeys && subject.contactKeys.length > 0) {
          contactId = subject.contactKeys[0];
        } else {
          const assoc = await this.client.crm.associations.v4.basicApi.getPage("company", subject.key, "contact");
          if (assoc.results && assoc.results.length > 0) {
            contactId = String(assoc.results[0].toObjectId);
          } else {
            throw new Error(`NO_ASSOCIATED_CONTACT: Cannot create Lead for Company '${subject.key}' without an associated Contact.`);
          }
        }
      }
      const associations = [];
      if (contactId) {
        associations.push({
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 608 }]
        });
      }
      if (companyId) {
        associations.push({
          to: { id: companyId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 610 }]
        });
      }
      const pipelineId = config?.hubspotPipelines?.leadPipelineId || "b2b_qualification_lead_pipeline";
      const newLead = await this.client.crm.objects.leads.basicApi.create({
        properties: {
          hs_lead_name: `Lead - ${relationshipKey}`,
          pipeline: pipelineId,
          hs_pipeline_stage: "mql",
          coa_opportunity_key: leadKey,
          coa_relationship_key: relationshipKey,
          coa_relationship_type: relationshipType,
          coa_opportunity_type: "MQL",
          coa_qualification_state: "PENDING",
          coa_cycle_index: "1",
          coa_managed: "true",
          coa_config_version: config?.configVersion || "1.0.0"
        },
        associations
      });
      return { id: newLead.id, ...newLead.properties };
    } catch (err) {
      logger.error("Failed to find or create managed Lead", err);
      throw err;
    }
  }
  async loadSubjectSnapshot(subjectRef) {
    const facts = {};
    if (subjectRef.kind === "CONTACT") {
      const contact = await this.client.crm.contacts.basicApi.getById(
        subjectRef.key,
        ["email", "firstname", "lastname", "phone", "company", "lifecyclestage", "coa_relationship_key", "coa_relationship_type", "coa_marketing_consent", "coa_automation_suppressed"]
      );
      facts.email = contact.properties?.email;
      facts.firstName = contact.properties?.firstname;
      facts.lastName = contact.properties?.lastname;
      facts.phone = contact.properties?.phone;
      facts.lifecycleStage = contact.properties?.lifecyclestage;
      facts.relationshipKey = contact.properties?.coa_relationship_key;
      facts.relationshipType = contact.properties?.coa_relationship_type;
      if (contact.properties?.coa_marketing_consent !== void 0 && contact.properties?.coa_marketing_consent !== null) {
        facts.marketingConsent = contact.properties.coa_marketing_consent === "true";
      }
      facts.automationSuppressed = contact.properties?.coa_automation_suppressed === "true";
    } else if (subjectRef.kind === "COMPANY") {
      const company = await this.client.crm.companies.basicApi.getById(
        subjectRef.key,
        ["coa_relationship_key", "coa_relationship_type", "name", "domain", "lifecyclestage", "coa_marketing_consent", "coa_automation_suppressed"]
      );
      facts.companyKey = company.properties?.coa_relationship_key || company.properties?.domain || company.id;
      facts.companyName = company.properties?.name;
      facts.domain = company.properties?.domain;
      facts.lifecycleStage = company.properties?.lifecyclestage;
      facts.relationshipKey = company.properties?.coa_relationship_key;
      facts.relationshipType = company.properties?.coa_relationship_type;
      if (company.properties?.coa_marketing_consent !== void 0 && company.properties?.coa_marketing_consent !== null) {
        facts.marketingConsent = company.properties.coa_marketing_consent === "true";
      }
      facts.automationSuppressed = company.properties?.coa_automation_suppressed === "true";
      if (subjectRef.contactKeys && subjectRef.contactKeys.length > 0) {
        const contact = await this.client.crm.contacts.basicApi.getById(
          subjectRef.contactKeys[0],
          ["email", "firstname", "lastname", "phone", "coa_marketing_consent", "coa_automation_suppressed"]
        );
        facts.email = contact.properties?.email;
        facts.contactEmail = contact.properties?.email;
        facts.firstName = contact.properties?.firstname;
        facts.lastName = contact.properties?.lastname;
        if (facts.marketingConsent === void 0 && contact.properties?.coa_marketing_consent !== void 0 && contact.properties?.coa_marketing_consent !== null) {
          facts.marketingConsent = contact.properties.coa_marketing_consent === "true";
        }
        if (contact.properties?.coa_automation_suppressed === "true") {
          facts.automationSuppressed = true;
        }
      }
    }
    return facts;
  }
  async loadLeadSnapshot(leadId) {
    const lead = await this.client.crm.objects.leads.basicApi.getById(
      leadId,
      [
        "hs_pipeline_stage",
        "hs_lead_name",
        "createdate",
        "hs_createdate",
        "coa_opportunity_key",
        "coa_relationship_key",
        "coa_relationship_type",
        "coa_opportunity_type",
        "coa_qualification_state",
        "coa_cycle_index",
        "coa_offering_keys"
      ]
    );
    return lead.properties || {};
  }
  async loadDealSnapshot(dealId) {
    const deal = await this.client.crm.deals.basicApi.getById(
      dealId,
      [
        "dealname",
        "dealstage",
        "pipeline",
        "amount",
        "createdate",
        "hs_createdate",
        "coa_opportunity_key",
        "coa_relationship_key",
        "coa_relationship_type",
        "coa_opportunity_type",
        "coa_qualification_state",
        "coa_cycle_index",
        "coa_predecessor_completed_at"
      ]
    );
    return deal.properties || {};
  }
  async loadAssociatedEvidence(associatedObjectId, associatedObjectType = "contact", opportunityWindow, associatedContactId) {
    const evidence = [];
    if (!associatedObjectId || associatedObjectId === "0") return evidence;
    const targets = [
      { id: associatedObjectId, type: associatedObjectType.toLowerCase() === "company" ? "company" : "contact" }
    ];
    if (associatedObjectType.toLowerCase() === "company" && associatedContactId) {
      targets.push({ id: associatedContactId, type: "contact" });
    }
    const openedAtTime = opportunityWindow?.openedAt ? new Date(opportunityWindow.openedAt).getTime() : 0;
    const predecessorTime = opportunityWindow?.predecessorCompletedAt ? new Date(opportunityWindow.predecessorCompletedAt).getTime() : 0;
    const lowerBoundary = Math.max(openedAtTime, predecessorTime);
    for (const target of targets) {
      const page = await this.client.crm.associations.v4.basicApi.getPage(
        target.type,
        target.id,
        "meeting"
      );
      for (const assoc of page.results || []) {
        const meetingId = String(assoc.toObjectId);
        if (evidence.some((e) => e.id === meetingId)) continue;
        const meeting = await this.client.crm.objects.meetings.basicApi.getById(
          meetingId,
          ["hs_activity_type", "hs_meeting_outcome", "hs_timestamp"]
        );
        const parsedTimestamp = parseHubSpotTimestamp(meeting.properties.hs_timestamp);
        if (!parsedTimestamp) continue;
        const occurredTime = new Date(parsedTimestamp).getTime();
        if (occurredTime > lowerBoundary) {
          evidence.push({
            id: meeting.id,
            predicate: "activityExists",
            scope: "opportunity",
            occurredAt: parsedTimestamp,
            data: {
              activityType: "MEETING",
              outcome: meeting.properties.hs_meeting_outcome === "COMPLETED" ? "COMPLETED" : "HELD"
            }
          });
        }
      }
    }
    return evidence;
  }
  async applyTransitionIntents(intents, correlationKey, config) {
    let appliedIntents = 0;
    const receipts = [];
    for (const intent of intents) {
      if (intent.kind === "UPDATE_OPPORTUNITY") {
        logger.info("Applying UPDATE_OPPORTUNITY intent", { key: intent.opportunityKey, newState: intent.newState });
        let targetId = intent.targetRecordId;
        let targetType = intent.targetObjectType;
        if (!targetId) {
          const leadSearch = await this.client.crm.objects.leads.searchApi.doSearch({
            filterGroups: [{ filters: [{ propertyName: "coa_opportunity_key", operator: "EQ", value: intent.opportunityKey }] }],
            sorts: [],
            properties: ["coa_opportunity_key"],
            limit: 1,
            after: "0"
          });
          if (leadSearch.results.length > 0) {
            targetId = leadSearch.results[0].id;
            targetType = "lead";
          } else {
            const dealSearch = await this.client.crm.deals.searchApi.doSearch({
              filterGroups: [{ filters: [{ propertyName: "coa_opportunity_key", operator: "EQ", value: intent.opportunityKey }] }],
              sorts: [],
              properties: ["coa_opportunity_key"],
              limit: 1,
              after: "0"
            });
            if (dealSearch.results.length > 0) {
              targetId = dealSearch.results[0].id;
              targetType = "deal";
            }
          }
        }
        if (targetId && targetType) {
          const updateProps = {
            coa_qualification_state: intent.qualificationState,
            coa_last_evaluated_at: (/* @__PURE__ */ new Date()).toISOString(),
            coa_config_version: config?.configVersion || "1.0.0"
          };
          if (intent.details?.unsatisfiedGoalKeys) {
            updateProps.coa_unsatisfied_goal_keys = JSON.stringify(intent.details.unsatisfiedGoalKeys);
          }
          if (intent.details?.targetOpportunityType) {
            updateProps.coa_opportunity_type = String(intent.details.targetOpportunityType);
          }
          if (targetType === "lead") {
            const targetStage = intent.details?.targetLeadStage ? String(intent.details.targetLeadStage) : intent.newState === "WON" ? "qualified" : "mql";
            updateProps.hs_pipeline_stage = targetStage;
            await this.client.crm.objects.leads.basicApi.update(targetId, { properties: updateProps });
            const readback = await this.client.crm.objects.leads.basicApi.getById(targetId, ["coa_qualification_state", "hs_pipeline_stage"]);
            const verified = readback?.properties?.coa_qualification_state === intent.qualificationState && readback?.properties?.hs_pipeline_stage === targetStage;
            receipts.push({
              intentKind: "UPDATE_OPPORTUNITY",
              objectType: "lead",
              objectId: targetId,
              operation: "UPDATE",
              verified
            });
          } else if (targetType === "deal") {
            const targetStage = intent.details?.targetDealStage ? String(intent.details.targetDealStage) : intent.newState === "WON" ? "closedwon" : "open";
            updateProps.dealstage = targetStage;
            await this.client.crm.deals.basicApi.update(targetId, { properties: updateProps });
            const readback = await this.client.crm.deals.basicApi.getById(targetId, ["coa_qualification_state", "dealstage"]);
            const verified = readback?.properties?.coa_qualification_state === intent.qualificationState && readback?.properties?.dealstage === targetStage;
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
            properties: ["dealname", "dealstage", "pipeline", "coa_opportunity_key", "coa_opportunity_type", "coa_cycle_index"],
            limit: 1,
            after: "0"
          });
          let expectedContactId = void 0;
          let expectedCompanyId = void 0;
          if (intent.subject?.kind === "CONTACT") {
            expectedContactId = intent.subject.key;
          } else if (intent.subject?.kind === "COMPANY") {
            expectedCompanyId = intent.subject.key;
            if (intent.subject.contactKeys && intent.subject.contactKeys.length > 0) {
              expectedContactId = intent.subject.contactKeys[0];
            }
          }
          if (existingDeals.results.length === 0) {
            const relKey = intent.successorKey.split("::")[0];
            const pipelineId = config?.hubspotPipelines?.dealPipelineId || "b2b_transaction_deal_pipeline";
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
                coa_predecessor_completed_at: (/* @__PURE__ */ new Date()).toISOString(),
                coa_managed: "true",
                coa_config_version: config?.configVersion || "1.0.0"
              },
              associations
            });
            const readback = await this.client.crm.deals.basicApi.getById(newDeal.id, ["coa_opportunity_key", "coa_opportunity_type", "coa_cycle_index"]);
            const propVerified = readback?.properties?.coa_opportunity_key === intent.successorKey && readback?.properties?.coa_opportunity_type === intent.successorType && readback?.properties?.coa_cycle_index === String(intent.cycleIndex);
            let assocVerified = true;
            if (expectedContactId) {
              const contactAssoc = await this.client.crm.associations.v4.basicApi.getPage("deal", newDeal.id, "contact");
              const found = (contactAssoc.results || []).some((r) => String(r.toObjectId) === expectedContactId);
              if (!found) assocVerified = false;
            }
            if (expectedCompanyId) {
              const companyAssoc = await this.client.crm.associations.v4.basicApi.getPage("deal", newDeal.id, "company");
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
            const propVerified = existingDeal.properties?.coa_opportunity_key === intent.successorKey && existingDeal.properties?.coa_opportunity_type === intent.successorType;
            let assocVerified = true;
            if (expectedContactId) {
              const contactAssoc = await this.client.crm.associations.v4.basicApi.getPage("deal", existingDeal.id, "contact");
              const found = (contactAssoc.results || []).some((r) => String(r.toObjectId) === expectedContactId);
              if (!found) assocVerified = false;
            }
            if (expectedCompanyId) {
              const companyAssoc = await this.client.crm.associations.v4.basicApi.getPage("deal", existingDeal.id, "company");
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
        }
        appliedIntents++;
      } else if (intent.kind === "PROJECT_LIFECYCLE_STAGE") {
        logger.info("Applying PROJECT_LIFECYCLE_STAGE intent", { stage: intent.stage });
        const subject = intent.subject;
        if (subject.kind === "CONTACT") {
          await this.client.crm.contacts.basicApi.update(subject.key, {
            properties: { lifecyclestage: intent.stage }
          });
          const readback = await this.client.crm.contacts.basicApi.getById(subject.key, ["lifecyclestage"]);
          const verified = readback?.properties?.lifecyclestage === intent.stage;
          receipts.push({
            intentKind: "PROJECT_LIFECYCLE_STAGE",
            objectType: "contact",
            objectId: subject.key,
            operation: "UPDATE",
            verified
          });
        } else if (subject.kind === "COMPANY") {
          await this.client.crm.companies.basicApi.update(subject.key, {
            properties: { lifecyclestage: intent.stage }
          });
          const readback = await this.client.crm.companies.basicApi.getById(subject.key, ["lifecyclestage"]);
          const verified = readback?.properties?.lifecyclestage === intent.stage;
          receipts.push({
            intentKind: "PROJECT_LIFECYCLE_STAGE",
            objectType: "company",
            objectId: subject.key,
            operation: "UPDATE",
            verified
          });
        }
        appliedIntents++;
      } else if (intent.kind === "CREATE_MANUAL_REVIEW") {
        logger.warn("Applying CREATE_MANUAL_REVIEW intent", { opportunityKey: intent.opportunityKey, reason: intent.reason });
        const taskSubject = `[Manual Review] ${intent.opportunityKey}`;
        const existingTasks = await this.client.crm.objects.tasks.searchApi.doSearch({
          filterGroups: [{ filters: [{ propertyName: "hs_task_subject", operator: "EQ", value: taskSubject }] }],
          sorts: [],
          properties: ["hs_task_subject"],
          limit: 1,
          after: "0"
        });
        if (existingTasks.results.length > 0) {
          receipts.push({
            intentKind: "CREATE_MANUAL_REVIEW",
            objectType: "task",
            objectId: existingTasks.results[0].id,
            operation: "NOOP",
            verified: true
          });
        } else {
          const associations = [];
          if (intent.subject?.kind === "CONTACT") {
            associations.push({
              to: { id: intent.subject.key },
              types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }]
            });
          } else if (intent.subject?.kind === "COMPANY") {
            associations.push({
              to: { id: intent.subject.key },
              types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 218 }]
            });
          }
          const newTask = await this.client.crm.objects.tasks.basicApi.create({
            properties: {
              hs_task_subject: taskSubject,
              hs_task_body: intent.reason,
              hs_task_status: "NOT_STARTED",
              hs_task_priority: "HIGH",
              hs_timestamp: String(Date.now())
            },
            associations
          });
          const readback = await this.client.crm.objects.tasks.basicApi.getById(newTask.id, ["hs_task_subject"]);
          const verified = Boolean(readback?.id);
          receipts.push({
            intentKind: "CREATE_MANUAL_REVIEW",
            objectType: "task",
            objectId: newTask.id,
            operation: "CREATE",
            verified
          });
        }
        appliedIntents++;
      } else if (intent.kind === "NOOP") {
        receipts.push({
          intentKind: "NOOP",
          objectType: "none",
          operation: "NOOP",
          verified: true
        });
      }
    }
    const allVerified = receipts.length > 0 && receipts.every((r) => r.verified);
    return { success: allVerified, appliedIntents, receipts };
  }
  async associateLineItemsToDeal(dealId, lineItemIds) {
    for (const lineItemId of lineItemIds) {
      await this.client.crm.associations.v4.basicApi.create(
        "line_items",
        lineItemId,
        "deals",
        dealId,
        [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 20 }]
      );
    }
  }
};

// packages/hubspot-adapter/snapshot-loader.ts
var HubSpotSnapshotLoader = class {
  hsAdapter;
  constructor(hsAdapter) {
    this.hsAdapter = hsAdapter;
  }
  async loadSnapshotFromRecord(recordRef, organizationKey = "org_default", relationshipType = "b2b", config) {
    logger.info("Loading pure opportunity snapshot directly from HubSpot CRM", { objectType: recordRef.objectType, objectId: recordRef.objectId });
    let subject = { kind: "CONTACT", key: recordRef.objectId };
    let opportunityType = "MQL";
    let opportunityState = "OPEN";
    let cycleIndex = 1;
    let relationshipKey = `${organizationKey}_${relationshipType}_${recordRef.objectId}`;
    let opportunityKey = `${relationshipKey}::LEAD::1`;
    let predecessorOpportunityKey = void 0;
    let predecessorCompletedAt = void 0;
    let openedAt = (/* @__PURE__ */ new Date()).toISOString();
    const facts = {};
    const client = this.hsAdapter.getRawClient();
    if (recordRef.objectType === "contact") {
      subject = { kind: "CONTACT", key: recordRef.objectId };
      const contactFacts = await this.hsAdapter.loadSubjectSnapshot(subject);
      Object.assign(facts, contactFacts);
      try {
        const companyAssoc = await client.crm.associations.v4.basicApi.getPage("contact", recordRef.objectId, "company");
        if (companyAssoc.results && companyAssoc.results.length > 0) {
          const companyId = String(companyAssoc.results[0].toObjectId);
          subject = { kind: "COMPANY", key: companyId, contactKeys: [recordRef.objectId] };
          const companyFacts = await this.hsAdapter.loadSubjectSnapshot({ kind: "COMPANY", key: companyId });
          if (companyFacts.relationshipKey) facts.relationshipKey = companyFacts.relationshipKey;
          if (companyFacts.relationshipType) facts.relationshipType = companyFacts.relationshipType;
          if (companyFacts.automationSuppressed === true) facts.automationSuppressed = true;
        }
      } catch (e) {
        logger.warn("Could not resolve company for contact", e);
      }
      relationshipKey = facts.relationshipKey || facts.domain || facts.email || `rel_${recordRef.objectId}`;
      opportunityKey = `${relationshipKey}::LEAD::1`;
      const managedLead = await this.hsAdapter.findOrCreateLeadForSubject(subject, relationshipKey, relationshipType, config);
      if (managedLead) {
        opportunityType = managedLead.coa_opportunity_type || "MQL";
        cycleIndex = Number(managedLead.coa_cycle_index || 1);
        opportunityKey = managedLead.coa_opportunity_key || opportunityKey;
        if (managedLead.createdate) {
          openedAt = parseHubSpotTimestamp(managedLead.createdate) || openedAt;
        }
        const stage = managedLead.hs_pipeline_stage || "mql";
        if (stage === "qualified") opportunityState = "WON";
        else if (stage === "disqualified") opportunityState = "LOST";
        facts.stage = stage;
        facts.leadId = managedLead.id;
        if (managedLead.coa_offering_keys) {
          facts.offeringKeys = String(managedLead.coa_offering_keys).split(",");
          facts.products = facts.offeringKeys;
        }
      }
    } else if (recordRef.objectType === "company") {
      subject = { kind: "COMPANY", key: recordRef.objectId };
      const companyFacts = await this.hsAdapter.loadSubjectSnapshot(subject);
      Object.assign(facts, companyFacts);
      try {
        const contactAssoc = await client.crm.associations.v4.basicApi.getPage("company", recordRef.objectId, "contact");
        if (contactAssoc.results && contactAssoc.results.length > 0) {
          const contactId = String(contactAssoc.results[0].toObjectId);
          subject.contactKeys = [contactId];
          const contactFacts = await this.hsAdapter.loadSubjectSnapshot({ kind: "CONTACT", key: contactId });
          if (contactFacts.email) facts.email = contactFacts.email;
          if (contactFacts.automationSuppressed === true) facts.automationSuppressed = true;
        }
      } catch (e) {
      }
      relationshipKey = facts.relationshipKey || facts.domain || `rel_${recordRef.objectId}`;
      opportunityKey = `${relationshipKey}::LEAD::1`;
      const managedLead = await this.hsAdapter.findOrCreateLeadForSubject(subject, relationshipKey, relationshipType, config);
      if (managedLead) {
        opportunityType = managedLead.coa_opportunity_type || "MQL";
        cycleIndex = Number(managedLead.coa_cycle_index || 1);
        opportunityKey = managedLead.coa_opportunity_key || opportunityKey;
        if (managedLead.createdate) {
          openedAt = parseHubSpotTimestamp(managedLead.createdate) || openedAt;
        }
        const stage = managedLead.hs_pipeline_stage || "mql";
        if (stage === "qualified") opportunityState = "WON";
        else if (stage === "disqualified") opportunityState = "LOST";
        facts.stage = stage;
        facts.leadId = managedLead.id;
        if (managedLead.coa_offering_keys) {
          facts.offeringKeys = String(managedLead.coa_offering_keys).split(",");
          facts.products = facts.offeringKeys;
        }
      }
    } else if (recordRef.objectType === "lead") {
      const leadProps = await this.hsAdapter.loadLeadSnapshot(recordRef.objectId);
      opportunityType = leadProps.coa_opportunity_type || "MQL";
      cycleIndex = Number(leadProps.coa_cycle_index || 1);
      relationshipKey = leadProps.coa_relationship_key || `rel_${recordRef.objectId}`;
      opportunityKey = leadProps.coa_opportunity_key || `${relationshipKey}::LEAD::1`;
      predecessorOpportunityKey = leadProps.coa_predecessor_opportunity_key;
      if (leadProps.createdate) {
        openedAt = parseHubSpotTimestamp(leadProps.createdate) || openedAt;
      }
      let resolvedContactId = void 0;
      let resolvedCompanyId = void 0;
      try {
        const contactAssoc = await client.crm.associations.v4.basicApi.getPage("lead", recordRef.objectId, "contact");
        if (contactAssoc.results && contactAssoc.results.length > 0) {
          resolvedContactId = String(contactAssoc.results[0].toObjectId);
          const contactFacts = await this.hsAdapter.loadSubjectSnapshot({ kind: "CONTACT", key: resolvedContactId });
          Object.assign(facts, contactFacts);
        }
      } catch (e) {
      }
      try {
        const companyAssoc = await client.crm.associations.v4.basicApi.getPage("lead", recordRef.objectId, "company");
        if (companyAssoc.results && companyAssoc.results.length > 0) {
          resolvedCompanyId = String(companyAssoc.results[0].toObjectId);
          const companyFacts = await this.hsAdapter.loadSubjectSnapshot({ kind: "COMPANY", key: resolvedCompanyId });
          if (companyFacts.relationshipKey) facts.relationshipKey = companyFacts.relationshipKey;
        }
      } catch (e) {
      }
      if (resolvedCompanyId) {
        subject = { kind: "COMPANY", key: resolvedCompanyId, contactKeys: resolvedContactId ? [resolvedContactId] : [] };
      } else if (resolvedContactId) {
        subject = { kind: "CONTACT", key: resolvedContactId };
      }
      const stage = leadProps.hs_pipeline_stage || "mql";
      if (stage === "qualified") opportunityState = "WON";
      else if (stage === "disqualified") opportunityState = "LOST";
      facts.stage = stage;
      facts.email = leadProps.email;
      facts.leadId = recordRef.objectId;
      if (leadProps.coa_offering_keys) {
        facts.offeringKeys = String(leadProps.coa_offering_keys).split(",");
        facts.products = facts.offeringKeys;
      }
    } else if (recordRef.objectType === "deal") {
      const dealProps = await this.hsAdapter.loadDealSnapshot(recordRef.objectId);
      opportunityType = dealProps.coa_opportunity_type || "FTP";
      cycleIndex = Number(dealProps.coa_cycle_index || 1);
      relationshipKey = dealProps.coa_relationship_key || `rel_${recordRef.objectId}`;
      opportunityKey = dealProps.coa_opportunity_key || `${relationshipKey}::${opportunityType}::${cycleIndex}`;
      predecessorOpportunityKey = dealProps.coa_predecessor_opportunity_key;
      if (dealProps.coa_predecessor_completed_at) {
        predecessorCompletedAt = parseHubSpotTimestamp(dealProps.coa_predecessor_completed_at) || void 0;
      }
      if (dealProps.createdate) {
        openedAt = parseHubSpotTimestamp(dealProps.createdate) || openedAt;
      }
      let resolvedContactId = void 0;
      let resolvedCompanyId = void 0;
      try {
        const companyAssoc = await client.crm.associations.v4.basicApi.getPage("deal", recordRef.objectId, "company");
        if (companyAssoc.results && companyAssoc.results.length > 0) {
          resolvedCompanyId = String(companyAssoc.results[0].toObjectId);
          const companyFacts = await this.hsAdapter.loadSubjectSnapshot({ kind: "COMPANY", key: resolvedCompanyId });
          if (companyFacts.relationshipKey) facts.relationshipKey = companyFacts.relationshipKey;
        }
      } catch (e) {
      }
      try {
        const contactAssoc = await client.crm.associations.v4.basicApi.getPage("deal", recordRef.objectId, "contact");
        if (contactAssoc.results && contactAssoc.results.length > 0) {
          resolvedContactId = String(contactAssoc.results[0].toObjectId);
          const contactFacts = await this.hsAdapter.loadSubjectSnapshot({ kind: "CONTACT", key: resolvedContactId });
          Object.assign(facts, contactFacts);
        }
      } catch (e) {
      }
      if (resolvedCompanyId) {
        subject = { kind: "COMPANY", key: resolvedCompanyId, contactKeys: resolvedContactId ? [resolvedContactId] : [] };
      } else if (resolvedContactId) {
        subject = { kind: "CONTACT", key: resolvedContactId };
      }
      try {
        const lineItemAssocs = await client.crm.associations.v4.basicApi.getPage("deal", recordRef.objectId, "line_items");
        const productIds = [];
        const lineItems = [];
        for (const itemAssoc of lineItemAssocs.results || []) {
          const itemId = String(itemAssoc.toObjectId);
          const lineItem = await client.crm.lineItems.basicApi.getById(itemId, ["name", "hs_product_id", "quantity", "price"]);
          const prodId = lineItem.properties?.hs_product_id || lineItem.id;
          productIds.push(prodId);
          lineItems.push(lineItem.properties);
        }
        facts.products = productIds;
        facts.offeringKeys = productIds;
        facts.lineItems = lineItems;
      } catch (err) {
        if (err.statusCode && err.statusCode !== 404) throw err;
      }
      const stage = dealProps.dealstage || "open";
      if (stage === "closedwon") {
        opportunityState = "WON";
        facts.transactionCompleted = true;
      } else if (stage === "closedlost") {
        opportunityState = "LOST";
      }
      facts.stage = stage;
      facts.amount = dealProps.amount;
      facts.dealId = recordRef.objectId;
    }
    const associatedContactId = subject.kind === "COMPANY" && subject.contactKeys && subject.contactKeys.length > 0 ? subject.contactKeys[0] : void 0;
    const evidence = await this.hsAdapter.loadAssociatedEvidence(
      subject.key,
      subject.kind.toLowerCase(),
      { openedAt, predecessorCompletedAt },
      associatedContactId
    );
    return {
      organizationKey,
      relationshipKey,
      relationshipType,
      opportunityKey,
      opportunityType,
      opportunityState,
      cycleIndex,
      openedAt,
      predecessorOpportunityKey,
      predecessorCompletedAt,
      subject,
      facts,
      evidence
    };
  }
};

// src/custom-code-actions/reconcile-record.ts
async function processHubSpotCustomCodeAction(event, accessToken) {
  logger.info("Executing stateless HubSpot Custom Code Action", { event });
  try {
    const rawObjectType = event.object?.objectType?.toUpperCase() || "";
    const rawObjectId = String(event.object?.objectId || "").trim();
    if (!rawObjectId || rawObjectId === "0") {
      throw new Error("INVALID_ENROLLMENT: Missing event.object.objectId in HubSpot custom code payload.");
    }
    const portalId = event.origin?.portalId;
    if (!portalId) {
      throw new Error("INVALID_ENROLLMENT: Missing event.origin.portalId in HubSpot custom code payload.");
    }
    let objectType;
    if (rawObjectType === "CONTACT" || rawObjectType === "0-1") {
      objectType = "contact";
    } else if (rawObjectType === "COMPANY" || rawObjectType === "0-2") {
      objectType = "company";
    } else if (rawObjectType === "LEAD" || rawObjectType === "0-136") {
      objectType = "lead";
    } else if (rawObjectType === "DEAL" || rawObjectType === "0-3") {
      objectType = "deal";
    } else {
      throw new Error(`UNSUPPORTED_OBJECT_TYPE: Enrolled object type '${event.object?.objectType}' is not supported by Commercial Operations Kernel.`);
    }
    const config = OrganizationConfigResolver.resolveConfigByPortalId(portalId);
    const token = accessToken || process.env.PRIVATE_APP_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
    const adapter = new HubspotAdapter(token);
    const snapshotLoader = new HubSpotSnapshotLoader(adapter);
    const snapshot = await snapshotLoader.loadSnapshotFromRecord(
      { objectType, objectId: rawObjectId },
      config.organizationKey,
      config.relationshipType,
      config
    );
    const evalRes = evaluateOpportunity(snapshot, config);
    const intents = planTransition(snapshot, evalRes, config);
    const correlationKey = `${snapshot.opportunityKey}:${Date.now()}`;
    const mutationResult = await adapter.applyTransitionIntents(intents, correlationKey, config);
    let status = "NO_CHANGE";
    if (evalRes.qualificationState === "BLOCKED") {
      status = "BLOCKED";
    } else if (mutationResult.receipts.some((r) => r.intentKind === "CREATE_MANUAL_REVIEW")) {
      status = "MANUAL_REVIEW";
    } else if (mutationResult.receipts.some((r) => r.intentKind === "CREATE_SUCCESSOR" && r.operation === "CREATE")) {
      status = "CREATED_SUCCESSOR";
    } else if (mutationResult.receipts.some((r) => r.intentKind === "CREATE_SUCCESSOR" && r.operation === "NOOP" && r.verified)) {
      status = config.featureFlags?.dryRunTransactions ? "DRY_RUN_SUCCESSOR_PLANNED" : "NO_CHANGE";
    } else if (mutationResult.receipts.some((r) => r.operation === "UPDATE" && r.verified)) {
      status = "UPDATED_EXISTING";
    }
    logger.info("Stateless HubSpot Custom Code Action executed successfully", {
      objectId: rawObjectId,
      objectType,
      opportunityKey: snapshot.opportunityKey,
      qualificationState: evalRes.qualificationState,
      appliedIntentsCount: mutationResult.appliedIntents,
      verified: mutationResult.success,
      status
    });
    return {
      outputFields: {
        qualificationState: evalRes.qualificationState,
        opportunityKey: snapshot.opportunityKey,
        appliedIntentsCount: mutationResult.appliedIntents,
        status,
        verified: mutationResult.success
      }
    };
  } catch (err) {
    logger.error("HubSpot Custom Code Action execution error", { error: err });
    throw err;
  }
}
async function main(event, callback) {
  const result = await processHubSpotCustomCodeAction(event);
  if (callback) {
    callback(result);
  }
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  main,
  processHubSpotCustomCodeAction
});
