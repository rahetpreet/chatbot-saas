import { TenantService } from "../src/lib/services/tenant/tenantService.ts";
import rawRegistry from "../src/lib/persistentRegistry.ts";
import { hashPassword, verifyPassword } from "../src/lib/security/password.ts";

const PersistentRegistry = rawRegistry.default || rawRegistry.PersistentRegistry || rawRegistry;

async function runEndToEndLifecycleTests() {
  console.log("=================================================");
  console.log("🚀 TESTING COMPLETE END-TO-END SAAS LIFECYCLE");
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

  // STEP 1: Super Admin onboards a new company
  console.log("--- 1. Company Onboarding & Dynamic Password Generation ---");
  const onboardRes = await TenantService.createTenant({
    name: "HyperGrowth Media",
    adminEmail: "ceo@hypergrowth.io",
    adminName: "Jordan Belfort",
    planTier: "PRO",
  });

  assert(onboardRes.success === true, "Tenant onboarded successfully");
  const tempPassword = onboardRes.credentials.temporaryPassword;
  assert(!!tempPassword && tempPassword.length === 16, "16-character temporary password generated");
  console.log(`🔑 Generated Temporary Password: ${tempPassword}`);

  // Verify it exists in PersistentRegistry
  const tenant = PersistentRegistry.getTenant("hypergrowth-media");
  assert(!!tenant && tenant.name === "HyperGrowth Media", "Tenant saved in PersistentRegistry");

  // STEP 2: Client logs in with the generated temporary password
  console.log("\n--- 2. Client Login with Generated Temporary Password ---");
  const user = PersistentRegistry.findUserByEmail("ceo@hypergrowth.io");
  assert(!!user, "Client user found in PersistentRegistry");
  assert(await verifyPassword(tempPassword, user.passwordHash), "Generated temporary password verifies against stored hash");

  // STEP 3: Client changes their password
  console.log("\n--- 3. Client Password Change ---");
  const newPermanentPassword = "HyperGrowthStrongPass2026!#";
  const newHash = await hashPassword(newPermanentPassword);
  PersistentRegistry.updateUserPassword("ceo@hypergrowth.io", newHash);

  const updatedUser = PersistentRegistry.findUserByEmail("ceo@hypergrowth.io");
  assert(await verifyPassword(newPermanentPassword, updatedUser.passwordHash), "New permanent password verified");
  assert(!(await verifyPassword(tempPassword, updatedUser.passwordHash)), "Old temporary password deactivated");

  // STEP 4: Client builds and saves a Flow
  console.log("\n--- 4. Client Bot Flow Creation & Publishing ---");
  const flow = PersistentRegistry.saveFlow({
    tenantId: tenant.id,
    name: "HyperGrowth Onboarding Bot",
    description: "Lead capture and scheduling flow",
    status: "DRAFT",
    nodes: [
      { id: "start-1", type: "start", position: { x: 100, y: 100 }, data: { label: "Trigger" } },
      { id: "msg-1", type: "message", position: { x: 100, y: 250 }, data: { label: "Greeting", messageText: "Welcome to HyperGrowth!" } },
    ],
    edges: [{ id: "e1", source: "start-1", target: "msg-1" }],
  });

  assert(!!flow && flow.name === "HyperGrowth Onboarding Bot", "Flow created and saved in PersistentRegistry");

  // Publish flow
  flow.status = "PUBLISHED";
  flow.version = 2;
  flow.publishedNodes = flow.nodes;
  flow.publishedEdges = flow.edges;
  PersistentRegistry.saveFlow(flow);

  const retrievedFlow = PersistentRegistry.getFlow(flow.id, tenant.id);
  assert(retrievedFlow.status === "PUBLISHED" && retrievedFlow.version === 2, "Flow published state persisted");

  // STEP 5: Client creates a trackable Campaign
  console.log("\n--- 5. Campaign Creation ---");
  const campaign = PersistentRegistry.saveCampaign({
    tenantId: tenant.id,
    name: "Summer Growth Launch",
    slug: "summer-growth",
    flowId: flow.id,
  });

  const tenantCampaigns = PersistentRegistry.getCampaigns(tenant.id);
  assert(tenantCampaigns.some((c) => c.slug === "summer-growth"), "Campaign saved and retrievable");

  // STEP 6: Super Admin updates Master Platform Password
  console.log("\n--- 6. Super Admin Master Password Update ---");
  const newSuperAdminPass = "MasterAdminSuperStrong2026!#";
  const newSuperHash = await hashPassword(newSuperAdminPass);
  PersistentRegistry.setSuperAdminPassword(newSuperHash);

  const state = PersistentRegistry.getState();
  assert(await verifyPassword(newSuperAdminPass, state.superAdmin.passwordHash), "Super Admin new master password verified");

  // STEP 7: Super Admin Resets Client Password
  console.log("\n--- 7. Super Admin 1-Click Client Password Reset ---");
  const resetResult = await TenantService.resetClientPassword(tenant.id, "u_admin_default");
  assert(!!resetResult.temporaryPassword && resetResult.temporaryPassword.length === 16, "Fresh temporary password generated on reset");

  const resetUser = PersistentRegistry.findUserByEmail("ceo@hypergrowth.io");
  assert(await verifyPassword(resetResult.temporaryPassword, resetUser.passwordHash), "Reset password active in PersistentRegistry");

  console.log("\n=================================================");
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runEndToEndLifecycleTests().catch(console.error);
