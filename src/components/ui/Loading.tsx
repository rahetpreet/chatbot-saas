"use client";

import React from "react";

/**
 * Loading states.
 *
 * The rule these follow: never show an empty page while data is on its way.
 * A blank list is indistinguishable from "you have no conversations", so an
 * unloaded screen must look busy, not empty.
 */

export function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );
}

/** A shimmering placeholder shaped roughly like the content it replaces. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />;
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={`h-3 ${index === lines - 1 ? "w-2/3" : index % 2 ? "w-5/6" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** Placeholder rows for a list, matching the real row height. */
export function SkeletonList({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
          <Skeleton className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows for a table, matching the column count. */
export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-3 py-2 border-b border-slate-100">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={`h-3 ${columnIndex === 0 ? "w-1/4" : "flex-1"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder cards for a stat row. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Centred spinner with a caption, for a whole panel that has nothing to
 * outline yet.
 */
export function LoadingPanel({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 text-slate-500 ${className}`}>
      <Spinner className="w-6 h-6 text-indigo-600" />
      <p className="text-xs font-semibold">{label}</p>
    </div>
  );
}

/**
 * A dimming overlay for content that is already on screen and being refreshed.
 * Keeping the stale content visible is less jarring than replacing it with a
 * skeleton on every poll.
 */
export function RefreshOverlay({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className={active ? "opacity-60 transition-opacity pointer-events-none" : "transition-opacity"}>
        {children}
      </div>
      {active && (
        <div className="absolute inset-0 flex items-start justify-center pt-6">
          <Spinner className="w-5 h-5 text-indigo-600" />
        </div>
      )}
    </div>
  );
}
