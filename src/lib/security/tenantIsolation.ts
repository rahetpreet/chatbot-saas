/**
 * Tenant Isolation Security Utilities
 * 
 * This module provides utilities to ensure tenant data isolation
 * and prevent cross-tenant data access.
 */

import { JWTPayload } from "@/types";

/**
 * Validates that a user has access to a specific tenant.
 * This should be used in all client-facing API routes.
 */
export function validateTenantAccess(session: JWTPayload, requestedTenantId?: string): boolean {
  // Super Admin can access any tenant if they explicitly specify one
  if (session.role === "SUPER_ADMIN") {
    return !!requestedTenantId; // Must explicitly specify tenant
  }

  // Client users can only access their own tenant
  if (!session.tenantId) {
    return false; // No tenant associated with user
  }

  // If a specific tenant is requested, it must match the user's tenant
  if (requestedTenantId && session.tenantId !== requestedTenantId) {
    return false;
  }

  return true;
}

/**
 * Validates that a user has the required role for an operation.
 */
export function validateUserRole(session: JWTPayload, allowedRoles: string[]): boolean {
  return allowedRoles.includes(session.role);
}

/**
 * Sanitizes any tenant-related data that should never be exposed to clients.
 * This should be used when returning data to ensure no cross-tenant data leaks.
 */
export function sanitizeTenantData<T>(data: T, userTenantId: string): T {
  if (!data || typeof data !== "object") {
    return data;
  }

  // For arrays, sanitize each item
  if (Array.isArray(data)) {
    return data.map(item => sanitizeTenantData(item, userTenantId)) as T;
  }

  // For objects, ensure tenantId matches
  const sanitized = { ...data };
  if ("tenantId" in sanitized && sanitized.tenantId !== userTenantId) {
    console.warn("Attempted to access cross-tenant data");
    throw new Error("Access denied: Cross-tenant data access attempt");
  }

  return sanitized;
}

/**
 * Security middleware to ensure tenant isolation in API responses.
 * This should be used as a final check before returning data.
 */
export function enforceTenantIsolation<T>(data: T, session: JWTPayload): T {
  if (session.role === "SUPER_ADMIN") {
    return data; // Super Admin can see all data
  }

  if (!session.tenantId) {
    throw new Error("No tenant context for user");
  }

  return sanitizeTenantData(data, session.tenantId);
}
