# Extension Requirements: Custom Shipping Rates

<!--
  This document follows the REQUIREMENTS.md schema for the Checkout Starter Kit.
  Schema: references/requirements.schema.json
  All sections map to schema properties for consistent parsing by AI agents.
-->

## Document Control

| Field | Value |
|-------|-------|
| **Extension Name** | Custom Shipping Rates |
| **Version** | 1.0 |
| **Status** | approved |
| **Last Updated** | YYYY-MM-DD |
| **Product Manager** | [Name] |
| **Stakeholders** | [Names] |

---

## Executive Summary

### Business Objective

Provide custom shipping rates at checkout based on destination and cart content using the Checkout Starter Kit and Commerce webhooks.

### Priority

**Level**: High

### Success Criteria

1. Webhook returns shipping options within timeout.
2. Commerce Admin webhook configuration documented and verified.
3. Dual security (OAuth + signature) enabled.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Platform** | paas / saas / both |
| **Application Type** | Headless |
| **Starter Kit** | Checkout Starter Kit |

### Constraints

- Out-of-process only; App Builder runtime.
- IMS mandatory for SaaS.

---

## Checkout / Webhook Context

| Aspect | Value |
|--------|-------|
| **Target Domain** | shipping |
| **Trigger** | Commerce requests shipping rates at checkout |
| **Webhook Method** | [To be confirmed in Phase 2 with Adobe docs] |
| **Response Format** | JSON operations array (shipping methods) |

---

## Functional Requirements

### FR-1: Return Custom Shipping Methods

**Description**: Action receives rate request and returns one or more shipping methods.

**Acceptance Criteria**:

- [ ] Given valid cart and address, when webhook invoked, then response contains at least one shipping option or empty array (if Optional).
- [ ] Signature verification and OAuth enforced.

---

## Acceptance Criteria (Master Checklist)

- [ ] Phase 1: Complete ✅
- [ ] Phase 2: Architectural Plan Presented
- [ ] Phase 3: Implementation Approach Selected
- [ ] Phase 5: Complete ✅ (or Cleanup Declined)

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | | Initial requirements |
