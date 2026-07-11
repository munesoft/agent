"use strict";

class ApprovalPolicy {
  constructor(opts = {}) {
    this.rules = Array.isArray(opts.rules) ? opts.rules : [];
    this.approve = typeof opts.approve === "function" ? opts.approve : null;
    this.defaultDecision = opts.defaultDecision || "allow";
  }

  async authorize(request) {
    const rule = this.rules.find(candidate => matches(candidate, request));
    const decision = rule?.decision || this.defaultDecision;
    if (decision === "allow") return true;
    if (decision === "deny") throw new ApprovalDeniedError(rule?.reason || "Action denied by approval policy", request);
    if (decision !== "ask") throw new ApprovalPolicyError("Unknown approval decision: " + decision);
    if (!this.approve) throw new ApprovalDeniedError("Action requires approval but no approver is configured", request);
    const approved = await this.approve({ ...request, rule });
    if (approved !== true && approved?.approved !== true) {
      throw new ApprovalDeniedError(approved?.reason || rule?.reason || "Action was not approved", request);
    }
    return true;
  }
}

function matches(rule, request) {
  if (typeof rule?.match === "function") return Boolean(rule.match(request));
  const names = array(rule?.tools || rule?.actions || rule?.tool);
  const tags = array(rule?.tags);
  const nameMatch = !names.length || names.includes(request.tool?.name) || names.includes(request.intent?.action);
  const toolTags = request.tool?.options?.tags || request.tool?.tags || [];
  const tagMatch = !tags.length || tags.some(tag => toolTags.includes(tag));
  return nameMatch && tagMatch;
}
function array(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }

class ApprovalPolicyError extends Error { constructor(message) { super(message); this.name = "ApprovalPolicyError"; } }
class ApprovalDeniedError extends ApprovalPolicyError {
  constructor(message, request) { super(message); this.name = "ApprovalDeniedError"; this.request = request; }
}

module.exports = { ApprovalPolicy, ApprovalPolicyError, ApprovalDeniedError };
