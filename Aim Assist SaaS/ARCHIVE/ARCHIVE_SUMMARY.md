# Archive Summary

This directory contains files that were archived during cleanup on 2025-08-28.

## Archiving Rationale

These files were moved to the ARCHIVE directory because:
1. They are from old migration approaches that have been replaced
2. They are test files for specific leads that are no longer relevant
3. They are one-time setup/fix scripts that have already been applied
4. They are old documentation from earlier development phases

## Archived Categories

### 1. Old Migration Files (`migrations_archived_tenant_version/`)
- **Why Archived**: These were tenant-based migrations that were replaced with organization-based migrations
- **Status**: Replaced by `supabase/migrations/` structure
- **Files**: 001-011 migration SQL files using old tenant terminology

### 2. Previously Archived SQL (`archived_sql_files/`)
- **Why Archived**: Already marked as archived, contains old migration attempts
- **Status**: Superseded by current migration system
- **Files**: Various combined and balanced migration attempts

### 3. Old Test Files
- **Lead-specific tests**: `test-lead-622*.js`, `test-lead-627.js`, `test-lead-632.js`, `test-lead-633.js`, `test-lead-470-messages.js`
  - These tested specific old leads that are no longer in the system
- **Old architecture tests**: `test-multi-crm-architecture.js`, `test-brokerage-system.js`
  - Testing features that were redesigned
- **Tenant tests**: `test-tenant-*.js` files
  - Old tenant system replaced with organization structure
- **Translation tests**: `test-translation-fixes.js`
  - Translation service no longer used

### 4. One-Time Scripts
- **SQL fix scripts**: `fix-*.sql`, `fix-*.js`
  - Applied fixes that are now incorporated into migrations
- **Add scripts**: `add-*.sql`
  - Column additions now in proper migrations
- **Setup scripts**: `setup-*.js`
  - One-time setup scripts that have been executed
- **Check/Debug scripts**: `check-*.js`, `check-*.sql`, `debug-*.js`
  - Debugging scripts used during development
- **Reset scripts**: `reset-lead-*.js`
  - Lead reset utilities for old test leads

### 5. Migration Runners
- **Multiple versions**: `run-migration.js`, `run-migrations.js`, `execute-migration.js`, etc.
  - Replaced by current migration system
- **Specific runners**: `run-migration-009.js`, `run-migration-012.js`, etc.
  - For specific migrations that have been applied

### 6. Old Documentation
- `TOMORROW_PLAN.md` - Old planning document
- `PROGRESS.md`, `PROGRESS_SUMMARY.md` - Old progress tracking
- `BALANCED_MIGRATION_GUIDE.md` - Guide for old migration approach
- `MIGRATION_INSTRUCTIONS.md` - Old migration instructions
- `MIGRATION_IMPROVEMENTS.md` - Notes on old migration system

### 7. Verification Scripts
- `verify-*.js` - Scripts to verify old implementations
- `inspect-*.js` - Database inspection utilities
- `apply-fixes.js` - Fix application script

### 8. Miscellaneous
- `fub-lead-3-complete.json` - Old test data
- `register-phone-number.js` - Old phone registration
- `clean-bad-messages.js`, `clear-sms-queue.js` - Cleanup utilities

## Active Files Retained

The following types of files were **NOT** archived:
- All `src/` directories (active source code)
- Current `supabase/migrations/` (active migrations)
- Package files (`package.json`, configuration files)
- Active documentation (`README.md`, `CLAUDE.md`, `Sprint2.md`, etc.)
- Recent test files that may still be useful
- Shell scripts referenced in package.json
- Active route and service files

## Recovery

If any archived file is needed:
1. Check this summary for the file location
2. Move it back from ARCHIVE to its original location
3. Update this summary to reflect the change

## Statistics
- **Total Files Archived**: ~90 files
- **Space Saved**: Reduced clutter in main directories
- **Categories**: 7 main categories of obsolete files