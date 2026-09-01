# Backend Implementation Documentation

## Overview

This document describes the backend implementation for the Chatbot SaaS platform, built with Next.js, Prisma, and Neon PostgreSQL.

## Initial Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and configure the following:

```bash
# Database Connection (Neon PostgreSQL)
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
DIRECT_URL="postgresql://user:password@host/database?sslmode=require"

# Security & Session Secrets
SESSION_SECRET="generate-a-cryptographically-secure-random-secret"
PASSWORD_RESET_SECRET="generate-a-cryptographically-secure-random-secret"

# Initial Super Admin Bootstrap
ADMIN_BOOTSTRAP_EMAIL="admin@yourcompany.com"
ADMIN_BOOTSTRAP_PASSWORD="temporary-secure-password"

# Application URL
APP_URL="http://localhost:3000"

# Email Provider Configuration
EMAIL_PROVIDER="console" # Options: console, smtp
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM_EMAIL="support@yourcompany.com"
SMTP_FROM_NAME="Chatbot SaaS Platform"

# Storage & AI Configuration
STORAGE_MODE="local"
AI_PROVIDER="disabled" # Options: disabled, ollama, groq, openrouter, gemini
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="llama3.2"

# Node Environment
NODE_ENV="development"
```

### 2. Database Setup

#### Neon PostgreSQL Setup

1. Create a Neon project at [https://neon.tech](https://neon.tech)
2. Copy the PostgreSQL connection string
3. Add it to your `.env` file as `DATABASE_URL` and `DIRECT_URL`

#### Database Migrations

```bash
# Generate Prisma client
npx prisma generate

# Create initial migration
npx prisma migrate dev --name init

# Seed the database (creates SUPER_ADMIN)
npx prisma db seed
```

#### Production Migration

```bash
# Deploy migrations to production
npx prisma migrate deploy

# Seed production database
npx prisma db seed
```

## Architecture

### Repository Pattern

The backend uses a repository pattern to abstract database operations:

- `ContactRepository` - Contact data access
- `ConversationRepository` - Conversation data access
- `LeadRepository` - Lead data access
- `TenantRepository` - Tenant data access
- `FlowRepository` - Flow/Chatbot data access
- `CampaignRepository` - Campaign data access
- `UserRepository` - User data access

### Service Layer

Business logic is encapsulated in service classes:

- `TenantService` - Tenant management operations
- `AuthService` - Authentication operations (via session.ts)
- `EmailService` - Email sending operations
- `StorageService` - File storage operations
- `AIService` - AI provider abstraction
- `FlowEngine` - Chatbot flow processing

### Security

#### Password Security

- Uses bcrypt with 12 rounds for password hashing
- Generates cryptographically secure temporary passwords
- Implements secure password reset tokens with SHA-256 hashing
- Enforces password strength validation

#### Session Management

- Database-backed sessions with token hashing
- HttpOnly, Secure cookies for session storage
- Session invalidation on password changes
- Impersonation support for Super Admin

#### Tenant Isolation

- All client queries automatically filtered by tenant_id
- Repository methods enforce tenant scoping
- Super Admin requires explicit tenant selection
- Comprehensive tenant isolation utilities

#### Rate Limiting

- Pluggable rate limiting store (currently in-memory)
- Configurable limits per endpoint
- Production-ready for Redis integration

## API Structure

### Authentication Endpoints

- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/change-password` - Change authenticated user password
- `POST /api/auth/impersonate` - Super Admin impersonation
- `GET /api/auth/me` - Get current user info

### Admin Endpoints

- `GET /api/admin/tenants` - List all tenants
- `POST /api/admin/tenants` - Create new tenant
- `GET /api/admin/tenants/:id` - Get tenant details
- `PATCH /api/admin/tenants/:id` - Update tenant
- `POST /api/admin/tenants/:id/pause` - Pause tenant
- `POST /api/admin/tenants/:id/resume` - Resume tenant
- `POST /api/admin/tenants/:id/reset-password` - Reset tenant password
- `GET /api/admin/tenants/:id/usage` - Get tenant usage stats
- `GET /api/admin/audit-logs` - Get audit logs
- `GET /api/admin/analytics` - Get platform analytics

### Client Endpoints

- `GET /api/client/dashboard` - Get client dashboard stats
- `GET /api/client/chatbots` - List client chatbots
- `POST /api/client/chatbots` - Create chatbot
- `GET /api/client/chatbots/:id` - Get chatbot details
- `PATCH /api/client/chatbots/:id` - Update chatbot
- `DELETE /api/client/chatbots/:id` - Delete chatbot
- `POST /api/client/chatbots/:id/publish` - Publish chatbot
- `GET /api/client/contacts` - List contacts
- `POST /api/client/contacts` - Create contact
- `GET /api/client/contacts/:id` - Get contact details
- `PATCH /api/client/contacts/:id` - Update contact
- `DELETE /api/client/contacts/:id` - Delete contact
- `GET /api/client/conversations` - List conversations
- `GET /api/client/conversations/:id` - Get conversation details
- `POST /api/client/conversations/export` - Export conversations
- `GET /api/client/leads` - List leads
- `GET /api/client/leads/:id` - Get lead details
- `PATCH /api/client/leads/:id` - Update lead
- `DELETE /api/client/leads/:id` - Delete lead
- `GET /api/client/campaigns` - List campaigns
- `POST /api/client/campaigns` - Create campaign
- `GET /api/client/exports/:id` - Get export job status
- `GET /api/client/exports/:id/download` - Download export

### Public Endpoints

- `GET /api/public/v1/bots/:publicId/config` - Get public bot configuration
- `POST /api/public/v1/sessions` - Create chat session
- `POST /api/public/v1/messages` - Send chat message
- `POST /api/public/v1/leads` - Submit lead
- `POST /api/public/v1/uploads` - Upload file

### Settings Endpoints

- `GET /api/settings/smtp` - Get SMTP settings
- `POST /api/settings/smtp` - Update SMTP settings
- `GET /api/settings/ai` - Get AI settings
- `POST /api/settings/ai` - Update AI settings
- `GET /api/settings/widget` - Get widget settings
- `POST /api/settings/widget` - Update widget settings

## Security Best Practices

### Password Security

✅ **Implemented:**
- Passwords are hashed using bcrypt (12 rounds)
- Temporary passwords are cryptographically generated
- Password reset tokens are hashed before storage
- Password strength validation enforced
- Session invalidation on password changes

### Tenant Isolation

✅ **Implemented:**
- All client queries automatically scoped to tenant_id
- Repository layer enforces tenant boundaries
- Super Admin requires explicit tenant selection
- Comprehensive tenant isolation utilities

### API Security

✅ **Implemented:**
- Zod validation on all API endpoints
- Rate limiting on sensitive endpoints
- Server-side session management
- HttpOnly, Secure cookies
- CSRF protection via same-site cookies

### Data Protection

✅ **Implemented:**
- Sensitive data never exposed in API responses
- Password hashes never returned
- API keys masked in responses
- Session tokens never exposed to client
- Database credentials in environment variables only

## Testing

### Running Tests

```bash
# Run specification verification tests
npm test
```

### Security Testing

The implementation includes security tests for:

1. Admin login and authentication
2. Client login and role-based access
3. Password security (hashing, validation, reset)
4. Tenant isolation (cross-tenant access prevention)
5. Session management and invalidation
6. Public bot configuration safety
7. API rate limiting
8. File upload security

## Deployment

### Vercel Deployment

1. Push code to GitHub
2. Connect repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy - Vercel will automatically run `prisma generate` and build
5. Run `prisma migrate deploy` as a post-deployment step

### Environment Variables for Production

Ensure these are set in Vercel:

- `DATABASE_URL` - Neon PostgreSQL connection string
- `DIRECT_URL` - Direct connection string for Prisma
- `SESSION_SECRET` - Cryptographically secure random string
- `PASSWORD_RESET_SECRET` - Cryptographically secure random string
- `ADMIN_BOOTSTRAP_EMAIL` - Super admin email
- `ADMIN_BOOTSTRAP_PASSWORD` - Initial password (change after first login)
- `APP_URL` - Production URL
- `EMAIL_PROVIDER` - "smtp" for production
- `SMTP_*` - SMTP configuration
- `NODE_ENV` - "production"

## Troubleshooting

### Database Connection Issues

If you encounter database connection errors:

1. Verify `DATABASE_URL` is correct
2. Check Neon database is active
3. Ensure SSL mode is enabled
4. Test connection with Neon console

### Migration Issues

If migrations fail:

1. Run `npx prisma migrate reset` (development only)
2. Check Prisma schema syntax
3. Verify database permissions
4. Check for conflicting migrations

### Seed Issues

If seeding fails:

1. Verify environment variables are set
2. Check database connection
3. Ensure SUPER_ADMIN doesn't already exist
4. Check password hashing module

## Monitoring

### Audit Logs

All important actions are logged to the `AuditLog` table:

- Login success/failure
- Tenant creation/modification
- Password changes/resets
- Chatbot publishing
- Data exports
- Impersonation

### Usage Tracking

Usage is tracked in `UsageRecord` table:

- Monthly message counts
- Flow usage
- Campaign link usage
- Storage usage

## Performance Optimization

### Database Indexes

The schema includes composite indexes for:

- Tenant-scoped queries (tenant_id + created_at)
- Email lookups (tenant_id + email)
- Status filtering (tenant_id + status)
- Session management (public_session_token_hash)

### Rate Limiting

Rate limiting is implemented for:

- Login attempts (10 per 15 minutes)
- Password reset (10 per 15 minutes)
- Public sessions (30 per minute)
- Public messages (60 per minute)
- File uploads (10 per 15 minutes)

## Future Enhancements

### Production Rate Limiting

Replace in-memory rate limiting with Redis for multi-instance deployments.

### Background Jobs

Implement background job processing for:

- Large data exports
- Email campaigns
- Analytics aggregation

### Enhanced AI

Add support for:

- Vector database integration
- Advanced AI providers
- Knowledge base indexing

## Support

For issues or questions:

1. Check this documentation
2. Review error logs
3. Verify environment configuration
4. Check database connection
5. Review audit logs for troubleshooting
