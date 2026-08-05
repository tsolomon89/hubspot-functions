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
      if (!snapshot.predecessorCompletedAt || ev.occurredAt < snapshot.predecessorCompletedAt) {
        return false;
      }
    }
    return true;
  });
  switch (goal.predicate) {
    case "manualReview": {
      const isTriggered = snapshot.facts[goal.params?.property] === true || goal.params?.forceReview === true;
      return { satisfied: !isTriggered, manualReviewRequired: isTriggered, evidenceRefs: isTriggered ? ["fact_manual_review"] : [] };
    }
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
          hasFactTransaction = Boolean(snapshot.predecessorCompletedAt && factTxTime >= snapshot.predecessorCompletedAt);
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
      } else if (goal.params?.greaterThan !== void 0) {
        satisfied = typeof val === "number" && val > Number(goal.params.greaterThan);
      } else if (goal.params?.lessThan !== void 0) {
        satisfied = typeof val === "number" && val < Number(goal.params.lessThan);
      } else if (goal.params?.in !== void 0 && Array.isArray(goal.params.in)) {
        satisfied = goal.params.in.includes(val);
      } else if (goal.params?.contains !== void 0 && typeof val === "string") {
        satisfied = val.includes(String(goal.params.contains));
      } else if (goal.params?.isTruthy) {
        satisfied = Boolean(val);
      } else if (goal.params?.isFalsy) {
        satisfied = !val;
      }
      return { satisfied, evidenceRefs: satisfied ? [`fact_prop_${propName}`] : [] };
    }
    default:
      return { satisfied: false, evidenceRefs: [] };
  }
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
    if (res.manualReviewRequired) {
      manualReviewNeeded = true;
    }
    if (res.satisfied) {
      satisfiedGoalKeys.push(goal.key);
      evidenceRefsByGoal[goal.key] = res.evidenceRefs;
    } else {
      unsatisfiedGoalKeys.push(goal.key);
      evidenceRefsByGoal[goal.key] = [];
    }
  }
  let qualificationState = "SATISFIED";
  if (manualReviewNeeded) {
    qualificationState = "MANUAL_REVIEW";
  } else if (unsatisfiedGoalKeys.length > 0) {
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
  if (snapshot.opportunityState === "LOST") {
    return [{ kind: "NOOP", reason: "Opportunity is LOST" }];
  }
  if (snapshot.opportunityState === "WON" && snapshot.facts.successorAlreadyExists === true) {
    return [{ kind: "NOOP", reason: "Opportunity is WON and deterministic successor already exists" }];
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
  if (raw === null || raw === void 0 || raw === "") return null;
  if (typeof raw === "number") {
    if (isNaN(raw) || !isFinite(raw) || raw < 0 || raw > 253402300799e3) return null;
    try {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  }
  const str = String(raw).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    if (isNaN(num) || num < 0 || num > 253402300799e3) return null;
    try {
      const d = new Date(num);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  }
  try {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}
var HubspotAdapter = class {
  client;
  constructor(accessTokenOrClient) {
    if (accessTokenOrClient && typeof accessTokenOrClient !== "string") {
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
  async loadSubjectSnapshot(subject) {
    try {
      if (subject.kind === "CONTACT") {
        const contact = await this.client.crm.contacts.basicApi.getById(subject.key, [
          "email",
          "lifecyclestage",
          "coa_relationship_key",
          "coa_relationship_type",
          "coa_marketing_consent",
          "coa_automation_suppressed"
        ]);
        const props = contact.properties || {};
        return {
          email: props.email,
          lifecycleStage: props.lifecyclestage,
          relationshipKey: props.coa_relationship_key,
          relationshipType: props.coa_relationship_type,
          marketingConsent: props.coa_marketing_consent === "true" || props.coa_marketing_consent === "1",
          automationSuppressed: props.coa_automation_suppressed === "true" || props.coa_automation_suppressed === "1"
        };
      } else if (subject.kind === "COMPANY") {
        const company = await this.client.crm.companies.basicApi.getById(subject.key, [
          "domain",
          "name",
          "lifecyclestage",
          "coa_relationship_key",
          "coa_relationship_type",
          "coa_marketing_consent",
          "coa_automation_suppressed"
        ]);
        const props = company.properties || {};
        return {
          domain: props.domain,
          companyName: props.name,
          lifecycleStage: props.lifecyclestage,
          relationshipKey: props.coa_relationship_key,
          relationshipType: props.coa_relationship_type,
          marketingConsent: props.coa_marketing_consent === "true" || props.coa_marketing_consent === "1",
          automationSuppressed: props.coa_automation_suppressed === "true" || props.coa_automation_suppressed === "1"
        };
      }
    } catch (err) {
      if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      logger.warn(`Subject ${subject.kind}:${subject.key} not found in HubSpot CRM`);
    }
    return {};
  }
  async loadLeadSnapshot(leadId) {
    try {
      const lead = await this.leadsApi.basicApi.getById(leadId, [
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
      return lead.properties || {};
    } catch (err) {
      if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      return {};
    }
  }
  async loadDealSnapshot(dealId) {
    try {
      const deal = await this.client.crm.deals.basicApi.getById(dealId, [
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
        "createdate"
      ]);
      return deal.properties || {};
    } catch (err) {
      if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      return {};
    }
  }
  async findOrCreateLeadForSubject(subject, relationshipKey, relationshipType, config) {
    try {
      const opportunityKey = `${relationshipKey}::LEAD::1`;
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
          "coa_opportunity_type",
          "coa_cycle_index",
          "hs_pipeline_stage",
          "coa_qualification_state",
          "coa_offering_keys",
          "createdate"
        ],
        limit: 1,
        after: 0
      });
      if (searchRes.results && searchRes.results.length > 0) {
        return searchRes.results[0];
      }
      const pipelineId = config?.hubspotPipelines?.leadPipelineId || "b2b_qualification_lead_pipeline";
      const associations = [];
      if (subject.kind === "CONTACT") {
        associations.push({
          to: { id: subject.key },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 608 }]
        });
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
      const newLead = await this.leadsApi.basicApi.create({
        properties: {
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
        },
        associations
      });
      return newLead;
    } catch (err) {
      logger.error("Failed to find or create Lead record", err);
      return null;
    }
  }
  async loadAssociatedEvidence(subjectKey, subjectKind, window, associatedContactId) {
    const evidence = [];
    const lowerBoundaryTime = window.predecessorCompletedAt ? new Date(window.predecessorCompletedAt).getTime() : window.openedAt ? new Date(window.openedAt).getTime() : 0;
    const contactIdsToQuery = /* @__PURE__ */ new Set();
    if (subjectKind === "contact") {
      contactIdsToQuery.add(subjectKey);
    }
    if (associatedContactId) {
      contactIdsToQuery.add(associatedContactId);
    }
    for (const cId of contactIdsToQuery) {
      let assocResults = [];
      try {
        const numericId = Number(cId) || cId;
        const meetingAssocs = await this.client.crm.associations.v4.basicApi.getPage(
          "contact",
          numericId,
          "meeting"
        );
        assocResults = meetingAssocs.results || [];
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
      for (const assoc of assocResults) {
        const meetingId = String(assoc.toObjectId);
        const meeting = await this.client.crm.objects.meetings.basicApi.getById(meetingId, [
          "hs_activity_type",
          "hs_meeting_outcome",
          "hs_timestamp"
        ]);
        const rawTimestamp = meeting.properties.hs_timestamp;
        const parsedTimestamp = parseHubSpotTimestamp(rawTimestamp);
        if (parsedTimestamp) {
          const occurredTime = new Date(parsedTimestamp).getTime();
          if (occurredTime > lowerBoundaryTime) {
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
          const leadSearch = await this.leadsApi.searchApi.doSearch({
            filterGroups: [{ filters: [{ propertyName: "coa_opportunity_key", operator: "EQ", value: intent.opportunityKey }] }],
            sorts: [],
            properties: ["coa_opportunity_key"],
            limit: 1,
            after: 0
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
              after: 0
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
            await this.leadsApi.basicApi.update(targetId, { properties: updateProps });
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
          } else if (targetType === "deal") {
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
              "coa_managed",
              "coa_config_version"
            ],
            limit: 1,
            after: 0
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
              "coa_managed",
              "coa_config_version"
            ]);
            const propVerified = readback?.properties?.coa_opportunity_key === intent.successorKey && readback?.properties?.coa_opportunity_type === intent.successorType && readback?.properties?.coa_cycle_index === String(intent.cycleIndex) && readback?.properties?.pipeline === pipelineId && readback?.properties?.dealstage === "open" && readback?.properties?.coa_relationship_key === relKey && readback?.properties?.coa_managed === "true";
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
            const propVerified = props.coa_opportunity_key === intent.successorKey && props.coa_opportunity_type === intent.successorType && props.coa_cycle_index === String(intent.cycleIndex) && props.pipeline === pipelineId && props.coa_relationship_key === relKey && props.coa_managed === "true";
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
          after: 0
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
              types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 192 }]
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
          const verified = readback?.properties?.hs_task_subject === taskSubject;
          receipts.push({
            intentKind: "CREATE_MANUAL_REVIEW",
            objectType: "task",
            objectId: newTask.id,
            operation: "CREATE",
            verified
          });
        }
        appliedIntents++;
      }
    }
    const allVerified = receipts.length === 0 || receipts.every((r) => r.verified);
    return { success: allVerified, appliedIntents, receipts };
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
  async loadSnapshotFromRecord(recordRef, organizationKey = "org_default") {
    return this.loadPureSnapshotFromHubSpot(recordRef, organizationKey);
  }
  async loadPureSnapshotFromHubSpot(recordRef, organizationKey = "org_default") {
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
        "coa_offering_keys",
        "createdate"
      ]);
      const cProps = contact.properties || {};
      try {
        const companyAssocs = await this.client.crm.associations.v4.basicApi.getPage(
          "contact",
          Number(recordRef.objectId) || recordRef.objectId,
          "company"
        );
        if (companyAssocs.results && companyAssocs.results.length > 0) {
          companyKey = String(companyAssocs.results[0].toObjectId);
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
      relationshipKey = cProps.coa_relationship_key || companyKey || `cnt_${recordRef.objectId}`;
      opportunityKey = `${relationshipKey}::LEAD::1`;
      facts = {
        email: cProps.email,
        contactEmail: cProps.email,
        lifecycleStage: cProps.lifecyclestage,
        marketingConsent: cProps.coa_marketing_consent === "true" || cProps.coa_marketing_consent === "1",
        automationSuppressed: cProps.coa_automation_suppressed === "true" || cProps.coa_automation_suppressed === "1"
      };
      if (cProps.coa_offering_keys) {
        facts.offeringKeys = String(cProps.coa_offering_keys).split(",").map((s) => s.trim());
      }
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
        "coa_offering_keys",
        "createdate"
      ]);
      const compProps = company.properties || {};
      try {
        const contactAssocs = await this.client.crm.associations.v4.basicApi.getPage(
          "company",
          Number(recordRef.objectId) || recordRef.objectId,
          "contact"
        );
        if (contactAssocs.results && contactAssocs.results.length > 0) {
          contactKeys = contactAssocs.results.map((r) => String(r.toObjectId));
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
      relationshipKey = compProps.coa_relationship_key || `comp_${recordRef.objectId}`;
      opportunityKey = `${relationshipKey}::LEAD::1`;
      facts = {
        domain: compProps.domain,
        companyName: compProps.name,
        lifecycleStage: compProps.lifecyclestage,
        marketingConsent: compProps.coa_marketing_consent === "true" || compProps.coa_marketing_consent === "1",
        automationSuppressed: compProps.coa_automation_suppressed === "true" || compProps.coa_automation_suppressed === "1"
      };
      if (compProps.coa_offering_keys) {
        facts.offeringKeys = String(compProps.coa_offering_keys).split(",").map((s) => s.trim());
      }
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
      const successorFtpKey = `${relationshipKey}::FTP::1`;
      try {
        const dealSearch = await this.client.crm.deals.searchApi.doSearch({
          filterGroups: [{ filters: [{ propertyName: "coa_opportunity_key", operator: "EQ", value: successorFtpKey }] }],
          sorts: [],
          properties: ["coa_opportunity_key"],
          limit: 1,
          after: 0
        });
        if (dealSearch.results && dealSearch.results.length > 0) {
          facts.successorAlreadyExists = true;
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
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
      openedAt = parseHubSpotTimestamp(dProps.createdate) || openedAt;
      predecessorCompletedAt = parseHubSpotTimestamp(dProps.coa_predecessor_completed_at) || void 0;
      const nextCycleIndex = opportunityType === "FTP" ? 1 : cycleIndex + 1;
      const successorType = opportunityType === "FTP" ? "RTP" : "RTP";
      const successorKey = `${relationshipKey}::${successorType}::${nextCycleIndex}`;
      try {
        const succSearch = await this.client.crm.deals.searchApi.doSearch({
          filterGroups: [{ filters: [{ propertyName: "coa_opportunity_key", operator: "EQ", value: successorKey }] }],
          sorts: [],
          properties: ["coa_opportunity_key"],
          limit: 1,
          after: 0
        });
        if (succSearch.results && succSearch.results.length > 0) {
          facts.successorAlreadyExists = true;
        }
      } catch (err) {
        if (err?.statusCode !== 404 && err?.status !== 404) throw err;
      }
    } else {
      throw new Error(`INVALID_ENROLLMENT: Unsupported objectType '${recordRef.objectType}'`);
    }
    if (contactKeys.length > 0) {
      try {
        const primaryContact = await this.client.crm.contacts.basicApi.getById(contactKeys[0], [
          "email",
          "lifecyclestage",
          "coa_marketing_consent",
          "coa_automation_suppressed",
          "coa_offering_keys"
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
        if (pcProps.coa_offering_keys && !facts.offeringKeys) {
          facts.offeringKeys = String(pcProps.coa_offering_keys).split(",").map((s) => s.trim());
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
      relationshipType: "b2b",
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

// src/custom-code-actions/reconcile-record.ts
async function processHubSpotCustomCodeAction(event, accessToken, adapterInstance) {
  const portalId = event?.origin?.portalId || 149041124;
  const rawObjectId = event?.object?.objectId || event?.object?.id || "0";
  const objectType = (event?.object?.objectType || "contact").toLowerCase();
  if (!rawObjectId || rawObjectId === "0") {
    throw new Error("INVALID_ENROLLMENT: HubSpot Custom Code action missing valid object.objectId in event payload");
  }
  logger.info("Executing stateless HubSpot Custom Code Action", {
    event: { origin: event?.origin, object: { objectId: rawObjectId, objectType } }
  });
  const config = OrganizationConfigResolver.resolveConfigByPortalId(portalId);
  const adapter = adapterInstance || new HubspotAdapter(accessToken);
  const snapshotLoader = new HubSpotSnapshotLoader(adapter);
  const snapshot = await snapshotLoader.loadSnapshotFromRecord(
    { objectType, objectId: rawObjectId },
    config.organizationKey
  );
  logger.info("Loading pure opportunity snapshot directly from HubSpot CRM", { objectType, objectId: rawObjectId });
  if (objectType === "contact" || objectType === "0-1" || objectType === "company" || objectType === "0-2") {
    const lead = await adapter.findOrCreateLeadForSubject(
      snapshot.subject,
      snapshot.relationshipKey,
      config.relationshipType,
      config
    );
    if (lead) {
      const leadSnapshot = await snapshotLoader.loadSnapshotFromRecord(
        { objectType: "lead", objectId: lead.id },
        config.organizationKey
      );
      const evalRes = evaluateOpportunity(leadSnapshot, config);
      const intents2 = planTransition(leadSnapshot, evalRes, config);
      const mutationResult2 = await adapter.applyTransitionIntents(intents2, leadSnapshot.opportunityKey, config);
      if (!mutationResult2.success) {
        const failedReceipts = mutationResult2.receipts.filter((r) => !r.verified);
        throw new Error(`ACTION_UNVERIFIED: Mutation readback verification failed: ${JSON.stringify(failedReceipts)}`);
      }
      let status2 = "NO_CHANGE";
      if (intents2.some((i) => i.kind === "CREATE_SUCCESSOR")) {
        status2 = "CREATED_SUCCESSOR";
      } else if (intents2.some((i) => i.kind === "UPDATE_OPPORTUNITY")) {
        status2 = "UPDATED";
      }
      return {
        outputFields: {
          objectId: lead.id,
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
  if (intents.some((i) => i.kind === "CREATE_SUCCESSOR")) {
    status = "CREATED_SUCCESSOR";
  } else if (intents.some((i) => i.kind === "CREATE_MANUAL_REVIEW")) {
    status = "MANUAL_REVIEW_REQUIRED";
  } else if (evaluation.qualificationState === "BLOCKED") {
    status = "BLOCKED";
  } else if (intents.some((i) => i.kind === "UPDATE_OPPORTUNITY")) {
    status = "UPDATED";
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
