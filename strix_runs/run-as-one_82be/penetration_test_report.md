# Security Penetration Test Report

**Generated:** 2026-09-23 01:58:11 UTC

# Executive Summary

# Executive Summary

An authorized white-box security assessment of the **Run As One** local codebase (`/workspace/run-as-one`) identified multiple critical and high-severity weaknesses that could lead to unauthorized administrative modifications, authentication bypass, and significant financial fraud through payment evasion.

**Overall risk posture:** Elevated. The application demonstrates strong defenses in certain areas (e.g., race conditions during promo redemption and proper client viewer isolation), but systemic flaws in business logic validation and middleware routing pose immediate risks.

**Key findings**
- **Authentication & Authorization Gaps:** The Next.js middleware fails to adequately protect routes due to path normalization flaws, and event category updates suffer from Insecure Direct Object Reference (IDOR), allowing attackers to modify data across organizations.
- **Payment & Business Logic Bypasses:** The checkout engine implicitly trusts client-provided inputs, enabling attackers to submit negative transaction fees or empty participant arrays to secure free registrations. Furthermore, the PayMongo webhook allows an authentication bypass if the signature header is omitted, permitting forged payment confirmations.
- **File Upload Vulnerabilities:** Unsanitized file names during Vercel Blob uploads allow path traversal, posing a risk to the storage container's integrity.

**Business impact**
- **Financial Loss:** The payment and webhook bypasses allow malicious actors to register for events without paying, directly impacting revenue.
- **Data Integrity & Trust:** Unauthorized modification of event categories and upload path traversals undermine the integrity of the platform, potentially disrupting events and damaging the organization's reputation.

# Methodology

# Methodology

The assessment was conducted per the **OWASP Web Security Testing Guide (WSTG)** principles.

**Engagement type:** White-box source code review and local dynamic analysis.
**Scope:** The local codebase at `/workspace/run-as-one`, including Next.js App Router endpoints, Prisma ORM interactions, and Vercel Blob integration logic.

**Activities:** 
- **Architecture & Reconnaissance:** Mapped the application's routing, data model, and security rules (JWT auth, role-based access control, tenant isolation).
- **Static & Structural Analysis:** Utilized AST-structural parsing and pattern scanning to identify weak trust boundaries, focusing on API endpoints and middleware.
- **Dynamic Validation:** Spawned specialized subagents to validate Authentication, Authorization (BFLA/IDOR), Business Logic/Payments, and File Upload vulnerabilities, ensuring all reported issues were backed by proof-of-concept evidence.
- **Coverage Validation:** Verified and ruled out suspected race conditions in promo redemptions and SSRF in webhook/integration endpoints.

# Technical Analysis

# Technical Analysis

The **Severity model** reflects exploitability and direct business impact, particularly focusing on financial logic and administrative access.

**Authentication & Authorization:**
- **Middleware Bypass (Medium):** The application’s middleware (`src/proxy.ts`) utilizes a flawed `.startsWith()` check for public route whitelisting. Attackers can append URL-encoded traversal payloads to public routes to bypass authentication entirely. Furthermore, the file is misnamed and thus inactive in standard Next.js deployments.
- **Incomplete Logout (Medium):** `/api/auth/logout` only clears client-side cookies. The stateless JWT remains valid until expiration because the server does not advance the `sessionsValidFrom` invalidation timestamp.
- **IDOR in Category Updates (High):** The `PUT /api/admin/events/[id]` endpoint iterates over an array of categories and updates them using their primary keys (`cat.id`) without verifying that the category belongs to the event being edited. This allows cross-tenant data modification.

**Business Logic & Payments:**
- **PayMongo Webhook Bypass (High):** The webhook handler attempts to verify HMAC signatures but fails open if the header is entirely absent. An attacker can directly POST forged "payment.paid" events.
- **Checkout Pricing Manipulation (High):** The checkout logic (`/api/checkout`) implicitly trusts client-provided `transactionFee` values, failing to reject negative numbers, which reduces the total order cost. Additionally, an empty `participants` array results in a zero-subtotal, bypassing PayMongo and generating a "ghost" registration.
- **IDOR on Checkout Category ID (High):** Attackers can submit a `categoryId` belonging to a different event during checkout. The system fails to enforce relational integrity, falling back to unintended (often zero-cost) pricing tiers.

**File Uploads:**
- **Path Traversal in Blob Storage (Medium):** The `/api/upload` endpoint directly consumes the multipart `file.name` parameter without sanitization. While Vercel Blob does not execute code, this allows attackers to write files outside the intended destination directories within the bucket.

**Systemic Themes:**
The codebase exhibits a pattern of **insufficient relational enforcement** (failing to verify that an object belongs to its parent context) and **implicit client trust** in financial calculations. While explicit RBAC (like Client Viewer isolation) is well-implemented, deep object-level checks and input sanitization are frequently omitted.

# Recommendations

# Recommendations

**Immediate (Critical)**
1. **Secure the Checkout Engine:** Implement server-side calculation and strict validation for all financial transactions. Reject negative transaction fees, ensure the `participants` array contains at least one valid runner, and strictly validate that provided `categoryId`s belong to the target event.
2. **Enforce PayMongo Webhook Signatures:** Update the `/api/webhooks/paymongo` endpoint to fail securely (default-deny) if the `paymongo-signature` header is missing, ensuring only verified PayMongo payloads are processed.
3. **Fix Middleware Routing:** Rename `src/proxy.ts` to `src/middleware.ts` to ensure it is actively applied by Next.js, and replace `.startsWith()` checks with exact path matching or strict regex validation to prevent path normalization bypasses.

**Short-term (High/Medium)**
4. **Remediate IDOR in Category Updates:** Update `PUT /api/admin/events/[id]` to scope category updates strictly to the authorized `eventId` using `updateMany` or explicit parent-child validation.
5. **Sanitize File Uploads:** Strip directory traversal characters (e.g., `../`) from `file.name` in `/api/upload` before passing it to the Vercel Blob storage API, or generate server-side UUIDs for filenames.
6. **Complete Server-Side Logout:** Enhance the logout mechanism to record the logout event (e.g., updating the `sessionsValidFrom` timestamp) on the server side to proactively invalidate the JWT, rather than relying solely on clearing the client-side cookie.

**Retest & validation:** 
Re-test the checkout flows and webhook endpoints to confirm that financial bypasses are mitigated, and verify the middleware correctly blocks unauthenticated path traversal attempts.

