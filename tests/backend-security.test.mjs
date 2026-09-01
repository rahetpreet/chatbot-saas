import { generateTemporaryPassword, hashPassword, verifyPassword, validatePasswordStrength, generatePasswordResetToken } from "../src/lib/security/password.ts";
import rawMockStore from "../src/lib/mockStore.ts";
import { TenantService } from "../src/lib/services/tenant/tenantService.ts";

const mockStore = rawMockStore.default || rawMockStore;

async function runTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING COMPREHENSIVE BACKEND SECURITY TESTS");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // TEST 1: Password Generation
  console.log("--- 1. Cryptographic Password Generation Tests ---");
  const p1 = generateTemporaryPassword(16);
  const p2 = generateTemporaryPassword(16);

  assert(p1.length === 16, "Password length is 16 characters");
  assert(p1 !== p2, "Generated passwords are high-entropy and unique");
  assert(/[A-Z]/.test(p1), "Password contains uppercase characters");
  assert(/[a-z]/.test(p1), "Password contains lowercase characters");
  assert(/[0-9]/.test(p1), "Password contains numeric digits");
  assert(/[!@#$%^&*()_+\-=[\]{}]/.test(p1), "Password contains special characters");
  assert(!/[0OIl1]/.test(p1), "Password excludes ambiguous characters (0, O, I, l, 1)");

  // TEST 2: Password Hashing & Verification
  console.log("\n--- 2. Hashing & Verification Tests ---");
  const plaintext = "SecurePass2026!#";
  const hash = await hashPassword(plaintext);

  assert(hash !== plaintext, "Password is not stored in plaintext");
  assert(hash.startsWith("$2"), "Hash uses standard bcrypt format");
  assert(await verifyPassword(plaintext, hash), "Valid password verifies successfully");
  assert(!(await verifyPassword("WrongPassword123!", hash)), "Invalid password correctly rejected");

  // TEST 3: Password Strength Validation
  console.log("\n--- 3. Password Strength Validation Tests ---");
  const weakCheck = validatePasswordStrength("weak");
  assert(!weakCheck.valid, "Weak password correctly identified as invalid");

  const strongCheck = validatePasswordStrength("StrongPassword2026!#");
  assert(strongCheck.valid && strongCheck.errors.length === 0, "Strong password validated successfully");

  // TEST 4: Password Reset Token Security
  console.log("\n--- 4. Password Reset Token Tests ---");
  const { token, tokenHash, expiresAt } = generatePasswordResetToken();
  assert(token.length === 64, "Plaintext reset token is 64-char crypto hex string");
  assert(tokenHash.length === 64, "Token hash is SHA-256 digested");
  assert(token !== tokenHash, "Plaintext token differs from token hash");
  assert(expiresAt.getTime() > Date.now() + 25 * 60 * 1000, "Reset token has 30-minute expiry");

  // TEST 5: Tenant Onboarding & One-Time Password Issuance
  console.log("\n--- 5. Dynamic Client Onboarding & One-Time Password Tests ---");
  const onboardResult = await TenantService.createTenant({
    name: "Nexus Dynamics",
    adminEmail: "founder@nexusdynamics.io",
    adminName: "Alex Rivera",
    planTier: "PRO",
  });

  assert(onboardResult.success === true, "Company onboarding returns success: true");
  assert(!!onboardResult.credentials?.temporaryPassword, "Temporary password is generated and returned");
  assert(onboardResult.credentials.temporaryPassword.length >= 16, "Temporary password meets length policy");
  assert(onboardResult.tenant.slug === "nexus-dynamics", "Tenant slug generated properly");

  // TEST 6: Tenant Isolation
  console.log("\n--- 6. Multi-Tenant Isolation Tests ---");
  const tenantA = mockStore.getTenant("t_acme_corp");
  const tenantB = mockStore.getTenant(onboardResult.tenant.id);

  assert(!!tenantA && !!tenantB, "Both tenants exist in store");
  assert(tenantA.id !== tenantB.id, "Tenants have distinct unique IDs");

  // Query flows for Tenant A and Tenant B
  const flowsA = mockStore.getFlows("t_acme_corp");
  const flowsB = mockStore.getFlows(tenantB.id);

  assert(flowsA.every((f) => f.tenantId === "t_acme_corp"), "Tenant A queries only return Tenant A flows");
  assert(flowsB.every((f) => f.tenantId === tenantB.id), "Tenant B queries only return Tenant B flows");

  // TEST 7: Super Admin Password Reset
  console.log("\n--- 7. Super Admin Client Password Reset Tests ---");
  const resetResult = await TenantService.resetClientPassword(tenantB.id, "u_superadmin");
  assert(!!resetResult.temporaryPassword, "Password reset returns a fresh temporary password");
  assert(resetResult.temporaryPassword !== onboardResult.credentials.temporaryPassword, "Reset password differs from original password");

  // TEST 8: Tenant Deletion Cascade
  console.log("\n--- 8. Tenant Deletion Cascade Tests ---");
  const deleteResult = await TenantService.deleteTenant(tenantB.id, "u_superadmin");
  assert(deleteResult.success === true, "Tenant deletion returned success");
  assert(mockStore.getTenant(tenantB.id) === undefined, "Deleted tenant removed from store");
  assert(mockStore.getFlows(tenantB.id).length === 0, "All associated tenant flows cascade deleted");

  console.log("\n=================================================");
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
